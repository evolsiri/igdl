/**
 * Test kit for the remuxer: a builder that writes single-track fragmented
 * MP4 streams to order, and a reader that takes a progressive MP4 apart so
 * specs can assert on its tables and on the bytes of each sample.
 *
 * Both sides are written straight from the box layouts in ISO/IEC 14496-12
 * and share no code with `../mp4.ts`. The real ffmpeg-made streams in
 * `./fixtures.ts` guard against this kit and the remuxer agreeing on a wrong
 * reading of the format.
 */

const NON_SYNC = 0x00010000;

export interface SampleSpec {
  bytes: number[];
  duration?: number;
  /** Defaults to true. */
  sync?: boolean;
  ctsOffset?: number;
}

export interface FragmentSpec {
  /** Written to `tfdt`. Omit to leave the box out. */
  decodeTime?: number;
  samples: SampleSpec[];
  /** Per-sample fields left out of `trun` — the reader must take them from `tfhd`. */
  tfhdDefaults?: { duration?: number; size?: number; flags?: number };
  /** Written as `trun.first_sample_flags`; per-sample flags are then omitted. */
  firstSampleFlags?: number;
  /** Split the samples across this many `trun` boxes (default 1). */
  runs?: number;
}

export interface StreamSpec {
  handler: "vide" | "soun";
  timescale: number;
  trackId?: number;
  movieTimescale?: number;
  /** `elst` entries; `mediaTime: -1` is an empty edit. Durations are in the movie timescale. */
  edits?: Array<{ duration: number; mediaTime: number }>;
  /** `trex` defaults, for fields that neither `trun` nor `tfhd` provide. */
  trexDefaults?: { duration?: number; size?: number; flags?: number };
  fragments: FragmentSpec[];
  /**
   * How a fragment says where its sample data is:
   *  - `moof` (default): `default-base-is-moof` + a `trun` data offset
   *  - `absolute`: an explicit 64-bit `tfhd.base_data_offset`
   *  - `implicit`: neither flag — the base is the start of the `moof`
   */
  dataBase?: "moof" | "absolute" | "implicit";
  /** Write `mvhd` / `tkhd` / `mdhd` / `elst` / `tfdt` as version 1 (64-bit times). */
  wide?: boolean;
  /** Write `trun` as version 1, where composition offsets are signed. */
  signedCts?: boolean;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u32(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, i) => view.setUint32(i * 4, value));
  return out;
}

function u64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
}

function i64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, BigInt(value));
  return out;
}

function text(value: string): Uint8Array {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

/** Builds a box from its type and payload parts. Exported so specs can craft odd inputs. */
export function box(type: string, ...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const payload = concat(parts);
  return concat([u32(payload.length + 8), text(type), payload]);
}

function fullBox(type: string, version: number, flags: number, ...parts: Uint8Array[]) {
  return box(type, u32(version * 0x1000000 + flags), ...parts);
}

/**
 * The opening of `mvhd` / `mdhd` / `tkhd`: creation + modification time, then
 * `middle` (the timescale, or the track id followed by a reserved word), then
 * the duration. Version 1 widens the three time fields to 64 bits.
 */
function timedHeader(wide: boolean, middle: number[], duration: number): Uint8Array {
  return wide
    ? concat([u64(0), u64(0), u32(...middle), u64(duration)])
    : u32(0, 0, ...middle, duration);
}

/** Bytes that uniquely identify a track's `tkhd` tail, so specs can check it survives. */
export function tkhdTail(handler: "vide" | "soun"): Uint8Array {
  const isVideo = handler === "vide";
  return concat([
    u32(0, 0), // reserved
    u32(isVideo ? 0 : 0x00010000), // layer 0, alternate group 0 (video) / 1 (audio)
    u32(isVideo ? 0 : 0x01000000), // volume 1.0 for audio, reserved
    u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000), // identity matrix
    u32(isVideo ? 0x04380000 : 0, isVideo ? 0x07800000 : 0), // 1080 × 1920
  ]);
}

/** A stand-in sample description: the remuxer copies `stsd` without looking inside. */
export function stsd(handler: "vide" | "soun"): Uint8Array {
  const entry = box(handler === "vide" ? "vp09" : "mp4a", text(`${handler}-codec-config`));
  return fullBox("stsd", 0, 0, u32(1), entry);
}

/** Builds one single-track fragmented MP4 stream from a declarative spec. */
export function fragmentedStream(spec: StreamSpec): Uint8Array<ArrayBuffer> {
  const trackId = spec.trackId ?? 1;
  const wide = spec.wide ?? false;
  const version = wide ? 1 : 0;
  const isVideo = spec.handler === "vide";

  const elst = spec.edits
    ? fullBox(
        "elst",
        version,
        0,
        u32(spec.edits.length),
        ...spec.edits.map((edit) =>
          wide
            ? concat([u64(edit.duration), i64(edit.mediaTime), u32(0x10000)])
            : u32(edit.duration, edit.mediaTime, 0x10000),
        ),
      )
    : null;
  const emptyTable = (type: string) => fullBox(type, 0, 0, u32(0));
  const trak = box(
    "trak",
    fullBox("tkhd", version, 3, timedHeader(wide, [trackId, 0], 0), tkhdTail(spec.handler)),
    ...(elst ? [box("edts", elst)] : []),
    box(
      "mdia",
      // 0x55c4 = "und" packed language code.
      fullBox("mdhd", version, 0, timedHeader(wide, [spec.timescale], 0), u32(0x55c40000)),
      fullBox("hdlr", 0, 0, u32(0), text(spec.handler), u32(0, 0, 0), text("Handler\0")),
      box(
        "minf",
        isVideo ? fullBox("vmhd", 0, 1, u32(0, 0)) : fullBox("smhd", 0, 0, u32(0)),
        box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))),
        box(
          "stbl",
          stsd(spec.handler),
          emptyTable("stts"),
          emptyTable("stsc"),
          fullBox("stsz", 0, 0, u32(0, 0)),
          emptyTable("stco"),
        ),
      ),
    ),
  );
  const trex = spec.trexDefaults ?? {};
  const moov = box(
    "moov",
    fullBox(
      "mvhd",
      version,
      0,
      timedHeader(wide, [spec.movieTimescale ?? 1000], 0),
      u32(0x10000, 0x1000000, 0, 0),
      u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000),
      u32(0, 0, 0, 0, 0, 0, trackId + 1),
    ),
    trak,
    box(
      "mvex",
      fullBox("trex", 0, 0, u32(trackId, 1, trex.duration ?? 0, trex.size ?? 0, trex.flags ?? 0)),
    ),
  );

  const parts: Uint8Array[] = [box("ftyp", text("iso5"), u32(0x200), text("iso5iso6mp41")), moov];
  let position = parts[0].length + moov.length;
  spec.fragments.forEach((fragment, sequence) => {
    // DASH on-demand files put an index in front of each fragment; it must be ignored.
    const sidx = box("sidx", new Uint8Array(24));
    parts.push(sidx);
    position += sidx.length;

    const moof = buildMoof(spec, fragment, sequence + 1, position);
    const mdat = box("mdat", ...fragment.samples.map((s) => Uint8Array.from(s.bytes)));
    parts.push(moof, mdat);
    position += moof.length + mdat.length;
  });
  return concat(parts);
}

function buildMoof(
  spec: StreamSpec,
  fragment: FragmentSpec,
  sequence: number,
  moofStart: number,
): Uint8Array {
  const dataBase = spec.dataBase ?? "moof";
  const defaults = fragment.tfhdDefaults ?? {};
  const trex = spec.trexDefaults ?? {};
  const has = (field: "duration" | "size" | "flags") =>
    defaults[field] === undefined && trex[field] === undefined;
  const perSampleFlags = has("flags") && fragment.firstSampleFlags === undefined;
  const hasCts = fragment.samples.some((s) => s.ctsOffset !== undefined);

  // Sizes are fixed by the spec, so the moof can be laid out before its offsets are known.
  const build = (dataOffsets: number[], baseDataOffset: number): Uint8Array => {
    let tfhdFlags = dataBase === "moof" ? 0x020000 : 0;
    const tfhdFields: Uint8Array[] = [];
    if (dataBase === "absolute") {
      tfhdFlags |= 0x000001;
      tfhdFields.push(u64(baseDataOffset));
    }
    if (defaults.duration !== undefined) {
      tfhdFlags |= 0x000008;
      tfhdFields.push(u32(defaults.duration));
    }
    if (defaults.size !== undefined) {
      tfhdFlags |= 0x000010;
      tfhdFields.push(u32(defaults.size));
    }
    if (defaults.flags !== undefined) {
      tfhdFlags |= 0x000020;
      tfhdFields.push(u32(defaults.flags));
    }
    const runCount = fragment.runs ?? 1;
    const perRun = Math.ceil(fragment.samples.length / runCount);
    const truns: Uint8Array[] = [];
    for (let run = 0; run < runCount; run++) {
      const samples = fragment.samples.slice(run * perRun, (run + 1) * perRun);
      let flags = 0x000001;
      if (run === 0 && fragment.firstSampleFlags !== undefined) flags |= 0x000004;
      if (has("duration")) flags |= 0x000100;
      if (has("size")) flags |= 0x000200;
      if (perSampleFlags) flags |= 0x000400;
      if (hasCts) flags |= 0x000800;
      const fields: number[] = [];
      for (const sample of samples) {
        if (has("duration")) fields.push(sample.duration ?? 0);
        if (has("size")) fields.push(sample.bytes.length);
        if (perSampleFlags) fields.push(sample.sync === false ? NON_SYNC : 0);
        if (hasCts) fields.push(sample.ctsOffset ?? 0);
      }
      truns.push(
        fullBox(
          "trun",
          spec.signedCts ? 1 : 0,
          flags,
          u32(samples.length, dataOffsets[run]),
          ...(run === 0 && fragment.firstSampleFlags !== undefined
            ? [u32(fragment.firstSampleFlags)]
            : []),
          u32(...fields),
        ),
      );
    }
    const tfdt =
      fragment.decodeTime === undefined
        ? []
        : [
            spec.wide
              ? fullBox("tfdt", 1, 0, u64(fragment.decodeTime))
              : fullBox("tfdt", 0, 0, u32(fragment.decodeTime)),
          ];
    return box(
      "moof",
      fullBox("mfhd", 0, 0, u32(sequence)),
      box(
        "traf",
        fullBox("tfhd", 0, tfhdFlags, u32(spec.trackId ?? 1), ...tfhdFields),
        ...tfdt,
        ...truns,
      ),
    );
  };

  const runCount = fragment.runs ?? 1;
  const perRun = Math.ceil(fragment.samples.length / runCount);
  const moofSize = build(new Array<number>(runCount).fill(0), 0).length;
  // Sample data starts right after the moof and the 8-byte mdat header.
  const dataStart = moofStart + moofSize + 8;
  const base = dataBase === "absolute" ? dataStart : moofStart;
  const offsets: number[] = [];
  let cursor = dataStart;
  for (let run = 0; run < runCount; run++) {
    offsets.push(cursor - base);
    for (const sample of fragment.samples.slice(run * perRun, (run + 1) * perRun)) {
      cursor += sample.bytes.length;
    }
  }
  return build(offsets, dataStart);
}

/**
 * A stream whose single sample claims every byte of the stream — header boxes
 * included — as its data. It passes each per-sample check, yet remuxes into a
 * file larger than itself: the reason the output's size is limited separately.
 */
export function selfContainingStream(): Uint8Array<ArrayBuffer> {
  const stream = fragmentedStream({
    handler: "vide",
    timescale: 30,
    fragments: [
      {
        decodeTime: 0,
        samples: [{ bytes: [1, 2, 3] }],
        tfhdDefaults: { duration: 1, size: 3, flags: 0 },
      },
    ],
  });
  const typeAt = (type: string): number => {
    for (let i = 0; i + 4 <= stream.length; i++) {
      if (String.fromCharCode(...stream.subarray(i, i + 4)) === type) return i;
    }
    throw new Error(`no ${type} box`);
  };
  const view = new DataView(stream.buffer);
  const moofStart = typeAt("moof") - 4;
  // type(4) + version/flags(4) + track id(4) + default duration(4) → default sample size
  view.setUint32(typeAt("tfhd") + 16, stream.length);
  // type(4) + version/flags(4) + sample count(4) → data offset, relative to the moof
  view.setInt32(typeAt("trun") + 12, -moofStart);
  return stream;
}

// --- Reading a progressive MP4 ----------------------------------------------

export interface ReadTrack {
  id: number;
  flags: number;
  handler: string;
  codec: string;
  /** Movie-timescale duration from `tkhd`. */
  duration: number;
  tkhdTail: Uint8Array;
  timescale: number;
  /** Media-timescale duration from `mdhd`. */
  mediaDuration: number;
  edits: Array<{ duration: number; mediaTime: number }> | null;
  stsd: Uint8Array;
  /** `[count, delta]` runs. */
  stts: Array<[number, number]>;
  ctts: { version: number; runs: Array<[number, number]> } | null;
  /** 1-based sync sample numbers, or null when the box is absent. */
  stss: number[] | null;
  chunkOffsets: number[];
  /** Per-sample durations, expanded from `stts`. */
  durations: number[];
  /** Per-sample payloads, resolved through `stsc` / `stsz` / `stco`. */
  samples: Uint8Array[];
  /** Absolute file offset of each sample. */
  sampleOffsets: number[];
}

export interface ReadMp4 {
  /** Top-level box types in file order. */
  layout: string[];
  brands: string;
  movieTimescale: number;
  movieDuration: number;
  nextTrackId: number;
  mdat: { start: number; end: number };
  tracks: ReadTrack[];
}

interface Box {
  type: string;
  start: number;
  body: number;
  end: number;
}

/** Parses a non-fragmented MP4 into its tables and per-sample payloads. */
export function readMp4(bytes: Uint8Array): ReadMp4 {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxesIn = (start: number, end: number): Box[] => {
    const boxes: Box[] = [];
    let at = start;
    while (at + 8 <= end) {
      const size = view.getUint32(at);
      if (size < 8 || at + size > end) throw new Error(`bad box size ${size} at ${at}`);
      const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
      boxes.push({ type, start: at, body: at + 8, end: at + size });
      at += size;
    }
    if (at !== end) throw new Error(`trailing bytes after box at ${at}`);
    return boxes;
  };
  const kids = (parent: Box) => boxesIn(parent.body, parent.end);
  const one = (boxes: Box[], type: string): Box => {
    const found = boxes.filter((b) => b.type === type);
    if (found.length !== 1) throw new Error(`expected exactly one ${type}, found ${found.length}`);
    return found[0];
  };
  const maybe = (boxes: Box[], type: string) => boxes.find((b) => b.type === type) ?? null;
  const table = (b: Box, width: number): number[][] => {
    const count = view.getUint32(b.body + 4);
    if (b.body + 8 + count * width * 4 !== b.end) throw new Error(`${b.type} size mismatch`);
    return Array.from({ length: count }, (_, row) =>
      Array.from({ length: width }, (_, col) => view.getUint32(b.body + 8 + (row * width + col) * 4)),
    );
  };

  const top = boxesIn(0, bytes.length);
  const moov = kids(one(top, "moov"));
  const mvhd = one(moov, "mvhd");
  const mdatBox = one(top, "mdat");
  const ftyp = one(top, "ftyp");

  const tracks = moov
    .filter((b) => b.type === "trak")
    .map((trakBox): ReadTrack => {
      const trak = kids(trakBox);
      const tkhd = one(trak, "tkhd");
      const mdia = kids(one(trak, "mdia"));
      const mdhd = one(mdia, "mdhd");
      const hdlr = one(mdia, "hdlr");
      const stbl = kids(one(kids(one(mdia, "minf")), "stbl"));
      const stsdBox = one(stbl, "stsd");
      const edts = maybe(trak, "edts");
      const cttsBox = maybe(stbl, "ctts");
      const stssBox = maybe(stbl, "stss");
      const stszBox = one(stbl, "stsz");

      const stts = table(one(stbl, "stts"), 2) as Array<[number, number]>;
      const durations = stts.flatMap(([count, delta]) => new Array<number>(count).fill(delta));
      const sizes = Array.from({ length: view.getUint32(stszBox.body + 8) }, (_, i) =>
        view.getUint32(stszBox.body + 12 + i * 4),
      );
      const chunkOffsets = table(one(stbl, "stco"), 1).map(([offset]) => offset);
      const stsc = table(one(stbl, "stsc"), 3);

      const samples: Uint8Array[] = [];
      const sampleOffsets: number[] = [];
      chunkOffsets.forEach((chunkOffset, chunk) => {
        // The governing stsc entry is the last one whose first_chunk ≤ this chunk.
        const [, perChunk] = stsc.filter(([first]) => first <= chunk + 1).at(-1)!;
        let at = chunkOffset;
        for (let i = 0; i < perChunk; i++) {
          const size = sizes[samples.length];
          sampleOffsets.push(at);
          samples.push(bytes.subarray(at, at + size));
          at += size;
        }
      });
      if (samples.length !== sizes.length) throw new Error("stsc does not cover every sample");

      return {
        id: view.getUint32(tkhd.body + 12),
        flags: view.getUint32(tkhd.body) & 0xffffff,
        handler: String.fromCharCode(...bytes.subarray(hdlr.body + 8, hdlr.body + 12)),
        codec: String.fromCharCode(...bytes.subarray(stsdBox.body + 12, stsdBox.body + 16)),
        duration: view.getUint32(tkhd.body + 20),
        tkhdTail: bytes.subarray(tkhd.end - 60, tkhd.end),
        timescale: view.getUint32(mdhd.body + 12),
        mediaDuration: view.getUint32(mdhd.body + 16),
        edits: edts
          ? table(one(kids(edts), "elst"), 3).map(([duration, mediaTime]) => ({
              duration,
              mediaTime: mediaTime | 0,
            }))
          : null,
        stsd: bytes.subarray(stsdBox.start, stsdBox.end),
        stts,
        ctts: cttsBox
          ? {
              version: view.getUint8(cttsBox.body),
              runs: table(cttsBox, 2).map(([count, offset]) => [count, offset | 0]),
            }
          : null,
        stss: stssBox ? table(stssBox, 1).map(([n]) => n) : null,
        chunkOffsets,
        durations,
        samples,
        sampleOffsets,
      };
    });

  return {
    layout: top.map((b) => b.type),
    brands: String.fromCharCode(...bytes.subarray(ftyp.body, ftyp.end)),
    movieTimescale: view.getUint32(mvhd.body + 12),
    movieDuration: view.getUint32(mvhd.body + 16),
    nextTrackId: view.getUint32(mvhd.end - 4),
    mdat: { start: mdatBox.body, end: mdatBox.end },
    tracks,
  };
}
