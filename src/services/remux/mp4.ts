/**
 * Stream-copy remuxer for DASH on-demand renditions: N single-track
 * fragmented MP4 files in, one progressive MP4 out. Nothing is decoded or
 * re-encoded — the codec configuration (`stsd`) and every sample byte are
 * copied verbatim; only the container bookkeeping is rebuilt.
 *
 * A DASH rendition spreads its samples over `moof` + `mdat` fragment pairs and
 * leaves the `moov` sample tables empty. The output folds every fragment's
 * `trun` back into classic `stts` / `stsc` / `stsz` / `stco` tables in front
 * of a single interleaved `mdat`, so players that seek through `moov` (or
 * don't understand fragments at all) open the file like any other MP4.
 *
 * Box layouts follow ISO/IEC 14496-12.
 */

/** Timescale of the output movie header. Track and edit durations are expressed in it. */
const MOVIE_TIMESCALE = 1000;
/** Seconds of media per chunk — how finely the tracks interleave inside `mdat`. */
const CHUNK_SECONDS = 1;
const U32_MAX = 0xffffffff;
const I32_MAX = 0x7fffffff;
/** Far more samples than hours of video hold — stops a corrupt count from spinning the parser. */
const MAX_SAMPLES = 1_000_000;
/** Most boxes read at one level. A real rendition has two per fragment: a few thousand. */
const MAX_BOXES = 100_000;
/**
 * Largest box copied through verbatim (`stsd`, `hdlr`, `vmhd` / `smhd`). Real
 * ones run to a few hundred bytes; without a ceiling a padded one would be
 * copied into the output at every level of `moov`.
 */
const MAX_HEADER_BOX_BYTES = 64 * 1024;

const TFHD_BASE_DATA_OFFSET = 0x000001;
const TFHD_SAMPLE_DESCRIPTION_INDEX = 0x000002;
const TFHD_DEFAULT_DURATION = 0x000008;
const TFHD_DEFAULT_SIZE = 0x000010;
const TFHD_DEFAULT_FLAGS = 0x000020;
const TFHD_DEFAULT_BASE_IS_MOOF = 0x020000;

const TRUN_DATA_OFFSET = 0x000001;
const TRUN_FIRST_SAMPLE_FLAGS = 0x000004;
const TRUN_SAMPLE_DURATION = 0x000100;
const TRUN_SAMPLE_SIZE = 0x000200;
const TRUN_SAMPLE_FLAGS = 0x000400;
const TRUN_SAMPLE_CTS_OFFSET = 0x000800;

/** `sample_is_non_sync_sample` bit inside a 32-bit sample-flags word. */
const SAMPLE_IS_NON_SYNC = 0x00010000;

interface Box {
  type: string;
  /** Offset of the box header. */
  start: number;
  /** Offset of the first payload byte, past the 8- or 16-byte header. */
  body: number;
  /** Offset one past the box's last byte. */
  end: number;
}

/** Per-track sample defaults declared in `mvex/trex`. */
interface TrackDefaults {
  descIndex: number;
  duration: number;
  size: number;
  flags: number;
}

interface Track {
  /** The file the samples are copied out of. */
  source: Uint8Array;
  /** Media timescale (`mdhd`). */
  timescale: number;
  flags: number;
  /** `tkhd` fields after the duration — layer, volume, matrix, dimensions — kept verbatim. */
  tkhdTail: Uint8Array;
  /** `mdhd` fields after the duration — the packed language code — kept verbatim. */
  mdhdTail: Uint8Array;
  hdlr: Uint8Array;
  /** `vmhd` / `smhd`, kept verbatim. */
  mediaHeader: Uint8Array | null;
  stsd: Uint8Array;
  offsets: number[];
  sizes: number[];
  durations: number[];
  ctsOffsets: number[];
  sync: boolean[];
  descIndexes: number[];
  /** Sum of every sample duration, in the media timescale. */
  mediaDuration: number;
  /**
   * Media time at which the last-presented sample ends. Later than
   * `mediaDuration` when B-frames push presentation behind decode order.
   */
  presentationEnd: number;
  /** Silence / blank lead-in before the first sample plays, in the movie timescale. */
  emptyDuration: number;
  /** Media time at which playback starts — skips encoder priming samples. */
  mediaTime: number;
}

interface Chunk {
  track: number;
  first: number;
  count: number;
  /** Presentation time of the chunk's first sample; orders chunks across tracks. */
  seconds: number;
  bytes: number;
  descIndex: number;
  /** Offset from the first byte of the `mdat` payload. */
  offset: number;
}

/**
 * Remuxes single-track fragmented MP4 streams into one progressive MP4. Pass
 * the streams in output-track order (video first, then audio). Sample data is
 * copied bit-for-bit; A/V sync is preserved by carrying each stream's start
 * time and edit list into the output.
 *
 * Throws when a stream isn't a fragmented MP4, has no samples, declares more
 * samples than it has bytes or more sample data than it holds, references
 * sample data outside the file, carries an implausible number of boxes or an
 * oversized header box, or would overflow a 32-bit MP4 field. Also throws
 * when the output would be larger than `maxBytes` — the tables are rebuilt,
 * so the output's size is not simply the input's. Every check runs before the
 * output buffer is allocated.
 *
 * @example
 * async function load(url: string): Promise<Uint8Array> {
 *   return new Uint8Array(await (await fetch(url)).arrayBuffer());
 * }
 * const video = await load("https://scontent.cdninstagram.com/o1/v/t16/f2/m69/vp9-1080p.mp4");
 * const audio = await load("https://scontent.cdninstagram.com/o1/v/t16/f2/m69/aac.mp4");
 * const mp4 = remuxToMp4([video, audio]);
 * const blob = new Blob([mp4], { type: "video/mp4" });
 */
export function remuxToMp4(
  streams: readonly Uint8Array[],
  maxBytes = U32_MAX,
): Uint8Array<ArrayBuffer> {
  if (streams.length === 0) fail("no streams");
  const tracks = streams.map((stream) => {
    try {
      return parseTrack(stream);
    } catch (err) {
      // A header field that runs past the end of the data surfaces as a DataView RangeError.
      if (err instanceof RangeError) fail("truncated box");
      throw err;
    }
  });
  // Only the tracks' starts relative to each other matter: the movie begins
  // when the earliest track does, wherever the source timeline put that.
  const origin = Math.min(...tracks.map((track) => track.emptyDuration));
  for (const track of tracks) track.emptyDuration -= origin;
  const perTrack = tracks.map(planChunks);
  const chunks = perTrack.flat().sort((a, b) => a.seconds - b.seconds || a.track - b.track);
  let dataBytes = 0;
  for (const chunk of chunks) {
    chunk.offset = dataBytes;
    dataBytes += chunk.bytes;
  }

  const ftyp = box("ftyp", ascii("isom"), u32s([0x200]), ascii("isomiso2mp41"));
  // `moov` sits in front of `mdat`, so the chunk offsets it stores depend on its
  // own size. That size doesn't depend on the offsets' values — measure, then build.
  const dataStart = ftyp.length + buildMoov(tracks, perTrack, 0).length + 8;
  if (dataStart + dataBytes > U32_MAX) fail("output exceeds the 4 GiB a 32-bit MP4 can address");
  if (dataStart + dataBytes > maxBytes) fail("output exceeds the size limit");
  const moov = buildMoov(tracks, perTrack, dataStart);

  const out = new Uint8Array(dataStart + dataBytes);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  out.set(u32s([8 + dataBytes]), dataStart - 8);
  out.set(ascii("mdat"), dataStart - 4);
  for (const chunk of chunks) copyChunk(out, dataStart + chunk.offset, tracks[chunk.track], chunk);
  return out;
}

// --- Reading ---------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`remuxToMp4: ${message}`);
}

function readBoxes(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7),
    );
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > end) fail(`truncated "${type}" box at offset ${at}`);
      size = u64(view, at + 8);
      body = at + 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < body - at || at + size > end) fail(`truncated "${type}" box at offset ${at}`);
    // Each box costs an object here; a stream of empty ones would cost far more than its bytes.
    if (boxes.length === MAX_BOXES) fail("stream has too many boxes");
    boxes.push({ type, start: at, body, end: at + size });
    at += size;
  }
  return boxes;
}

function children(view: DataView, parent: Box): Box[] {
  return readBoxes(view, parent.body, parent.end);
}

function required(boxes: Box[], type: string): Box {
  const found = boxes.find((b) => b.type === type);
  if (!found) fail(`missing "${type}" box — not a fragmented MP4 stream`);
  return found;
}

function u64(view: DataView, at: number): number {
  return Number(view.getBigUint64(at));
}

/**
 * `mvhd`, `mdhd` and `tkhd` all open with creation + modification times whose
 * width depends on the box version; the next u32 is the timescale (`mvhd`,
 * `mdhd`) or the track id (`tkhd`).
 */
function fieldAfterTimes(view: DataView, header: Box): number {
  return view.getUint32(header.body + (view.getUint8(header.body) === 1 ? 20 : 12));
}

function parseTrack(source: Uint8Array): Track {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const top = readBoxes(view, 0, source.byteLength);
  const moov = children(view, required(top, "moov"));
  const trak = children(view, required(moov, "trak"));
  const mdia = children(view, required(trak, "mdia"));
  const minf = children(view, required(mdia, "minf"));
  const stbl = children(view, required(minf, "stbl"));

  const tkhd = required(trak, "tkhd");
  const mdhd = required(mdia, "mdhd");
  const hdlr = required(mdia, "hdlr");
  const stsd = required(stbl, "stsd");
  const mediaHeader = minf.find((b) => b.type === "vmhd" || b.type === "smhd");
  for (const copied of [hdlr, stsd, mediaHeader]) {
    if (copied && copied.end - copied.start > MAX_HEADER_BOX_BYTES) {
      fail(`oversized "${copied.type}" box`);
    }
  }
  // Version 1 widens the three time fields from 32 to 64 bits.
  if (tkhd.end - tkhd.body < (view.getUint8(tkhd.body) === 1 ? 96 : 84)) fail("truncated tkhd");
  if (mdhd.end - mdhd.body < (view.getUint8(mdhd.body) === 1 ? 36 : 24)) fail("truncated mdhd");

  const movieTimescale = fieldAfterTimes(view, required(moov, "mvhd"));
  const timescale = fieldAfterTimes(view, mdhd);
  if (movieTimescale === 0 || timescale === 0) fail("zero timescale");

  const defaults = new Map<number, TrackDefaults>();
  const mvex = moov.find((b) => b.type === "mvex");
  for (const trex of mvex ? children(view, mvex) : []) {
    if (trex.type !== "trex") continue;
    defaults.set(view.getUint32(trex.body + 4), {
      descIndex: view.getUint32(trex.body + 8),
      duration: view.getUint32(trex.body + 12),
      size: view.getUint32(trex.body + 16),
      flags: view.getUint32(trex.body + 20),
    });
  }

  const track: Track = {
    source,
    timescale,
    flags: view.getUint32(tkhd.body) & 0xffffff,
    tkhdTail: source.subarray(tkhd.end - 60, tkhd.end),
    mdhdTail: source.subarray(mdhd.end - 4, mdhd.end),
    hdlr: source.subarray(hdlr.start, hdlr.end),
    mediaHeader: mediaHeader ? source.subarray(mediaHeader.start, mediaHeader.end) : null,
    stsd: source.subarray(stsd.start, stsd.end),
    offsets: [],
    sizes: [],
    durations: [],
    ctsOffsets: [],
    sync: [],
    descIndexes: [],
    mediaDuration: 0,
    presentationEnd: 0,
    emptyDuration: 0,
    mediaTime: 0,
  };
  const startTime = readFragments(view, top, fieldAfterTimes(view, tkhd), defaults, track);
  if (track.sizes.length === 0) fail("stream has no samples");
  let sampleBytes = 0;
  track.durations.forEach((duration, i) => {
    const shownUntil = track.mediaDuration + track.ctsOffsets[i] + duration;
    track.presentationEnd = Math.max(track.presentationEnd, shownUntil);
    track.mediaDuration += duration;
    sampleBytes += track.sizes[i];
  });
  // Checked separately: negative composition offsets can leave the presentation
  // end below the decode duration.
  if (track.mediaDuration > U32_MAX || track.presentationEnd > U32_MAX) {
    fail("track is too long for a 32-bit MP4");
  }
  // Samples never share bytes in a real stream, so together they can't outweigh
  // it. More sample bytes than stream bytes means some are counted twice;
  // rejecting that keeps `mdat` no larger than the input.
  if (sampleBytes > source.byteLength) fail("samples overlap");

  // The flat sample table restarts decode time at zero, so the fragments' start
  // time and the source edit list fold into one lead: positive means the track
  // starts late (an empty edit), negative means its opening media is skipped —
  // that is how AAC encoder priming stays out of the presentation.
  const edit = readEditList(view, trak);
  const lead = startTime - edit.mediaTime;
  track.emptyDuration =
    toMovieTime(edit.emptyTicks, movieTimescale) + (lead > 0 ? toMovieTime(lead, timescale) : 0);
  track.mediaTime = lead < 0 ? Math.min(-lead, track.presentationEnd) : 0;
  // elst stores the media time as a signed 32-bit field.
  if (track.mediaTime > I32_MAX) fail("edit list is out of range for a 32-bit MP4");
  return track;
}

/** Reads the leading empty edits and the first media edit's start time from `edts/elst`. */
function readEditList(view: DataView, trak: Box[]): { emptyTicks: number; mediaTime: number } {
  const result = { emptyTicks: 0, mediaTime: 0 };
  const edts = trak.find((b) => b.type === "edts");
  const elst = edts && children(view, edts).find((b) => b.type === "elst");
  if (!elst) return result;
  const wide = view.getUint8(elst.body) === 1;
  const count = view.getUint32(elst.body + 4);
  const entrySize = wide ? 20 : 12;
  if (elst.body + 8 + count * entrySize > elst.end) fail("truncated elst");
  for (let i = 0; i < count; i++) {
    const at = elst.body + 8 + i * entrySize;
    const segmentDuration = wide ? u64(view, at) : view.getUint32(at);
    const mediaTime = wide ? Number(view.getBigInt64(at + 8)) : view.getInt32(at + 4);
    if (mediaTime >= 0) {
      result.mediaTime = mediaTime;
      break;
    }
    result.emptyTicks += segmentDuration;
  }
  return result;
}

/**
 * Appends every sample of `trackId` found in the stream's `moof` boxes to
 * `track`. Returns the decode time of the first sample.
 */
function readFragments(
  view: DataView,
  top: Box[],
  trackId: number,
  defaults: Map<number, TrackDefaults>,
  track: Track,
): number {
  let startTime = 0;
  let decodeEnd = 0;
  let seen = 0;
  for (const moof of top) {
    if (moof.type !== "moof") continue;
    // Absent an explicit base, a traf's data starts at the moof (first traf) or
    // where the previous traf's data ended.
    let implicitBase = moof.start;
    for (const traf of children(view, moof)) {
      if (traf.type !== "traf") continue;
      const boxes = children(view, traf);
      const tfhd = required(boxes, "tfhd");
      const tfhdFlags = view.getUint32(tfhd.body) & 0xffffff;
      const id = view.getUint32(tfhd.body + 4);
      const trex = defaults.get(id);
      let at = tfhd.body + 8;
      const optional = (flag: number, fallback: number): number => {
        if (!(tfhdFlags & flag)) return fallback;
        at += 4;
        return view.getUint32(at - 4);
      };
      let base = tfhdFlags & TFHD_DEFAULT_BASE_IS_MOOF ? moof.start : implicitBase;
      if (tfhdFlags & TFHD_BASE_DATA_OFFSET) {
        base = u64(view, at);
        at += 8;
      }
      const descIndex = optional(TFHD_SAMPLE_DESCRIPTION_INDEX, trex?.descIndex ?? 1);
      const defaultDuration = optional(TFHD_DEFAULT_DURATION, trex?.duration ?? 0);
      const defaultSize = optional(TFHD_DEFAULT_SIZE, trex?.size ?? 0);
      const defaultFlags = optional(TFHD_DEFAULT_FLAGS, trex?.flags ?? 0);

      const mine = id === trackId;
      const tfdt = boxes.find((b) => b.type === "tfdt");
      if (mine && tfdt) {
        const time =
          view.getUint8(tfdt.body) === 1 ? u64(view, tfdt.body + 4) : view.getUint32(tfdt.body + 4);
        if (track.sizes.length === 0) {
          startTime = decodeEnd = time;
        } else if (time > decodeEnd) {
          // A gap between fragments: stretch the previous sample across it so
          // the flat timeline lands this fragment on its original decode time.
          track.durations[track.durations.length - 1] += time - decodeEnd;
          decodeEnd = time;
        }
      }

      let cursor = base;
      for (const trun of boxes) {
        if (trun.type !== "trun") continue;
        const version = view.getUint8(trun.body);
        const flags = view.getUint32(trun.body) & 0xffffff;
        const count = view.getUint32(trun.body + 4);
        // A stream can't hold more samples than it has bytes. Checking that first
        // keeps a few hundred bytes from declaring a million empty samples.
        seen += count;
        if (seen > Math.min(MAX_SAMPLES, view.byteLength)) fail("stream declares too many samples");
        let p = trun.body + 8;
        if (flags & TRUN_DATA_OFFSET) {
          cursor = base + view.getInt32(p);
          p += 4;
        }
        let firstFlags = -1;
        if (flags & TRUN_FIRST_SAMPLE_FLAGS) {
          firstFlags = view.getUint32(p);
          p += 4;
        }
        const fields = [
          TRUN_SAMPLE_DURATION,
          TRUN_SAMPLE_SIZE,
          TRUN_SAMPLE_FLAGS,
          TRUN_SAMPLE_CTS_OFFSET,
        ].filter((flag) => flags & flag).length;
        if (p + count * fields * 4 > trun.end) fail("truncated trun");
        for (let i = 0; i < count; i++) {
          let duration = defaultDuration;
          let size = defaultSize;
          let sampleFlags = i === 0 && firstFlags >= 0 ? firstFlags : defaultFlags;
          let ctsOffset = 0;
          if (flags & TRUN_SAMPLE_DURATION) {
            duration = view.getUint32(p);
            p += 4;
          }
          if (flags & TRUN_SAMPLE_SIZE) {
            size = view.getUint32(p);
            p += 4;
          }
          if (flags & TRUN_SAMPLE_FLAGS) {
            sampleFlags = view.getUint32(p);
            p += 4;
          }
          if (flags & TRUN_SAMPLE_CTS_OFFSET) {
            ctsOffset = version === 0 ? view.getUint32(p) : view.getInt32(p);
            p += 4;
          }
          if (mine) {
            if (cursor < 0 || cursor + size > view.byteLength) {
              fail("sample data lies outside the stream");
            }
            track.offsets.push(cursor);
            track.sizes.push(size);
            track.durations.push(duration);
            track.ctsOffsets.push(ctsOffset);
            track.sync.push(!(sampleFlags & SAMPLE_IS_NON_SYNC));
            track.descIndexes.push(descIndex);
            decodeEnd += duration;
          }
          cursor += size;
        }
      }
      implicitBase = cursor;
    }
  }
  return startTime;
}

// --- Writing ---------------------------------------------------------------

function toMovieTime(ticks: number, timescale: number): number {
  return Math.round((ticks * MOVIE_TIMESCALE) / timescale);
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

/** Big-endian u32 per value. Negative values are stored as their two's complement. */
function u32s(values: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < values.length; i++) view.setUint32(i * 4, values[i]);
  return out;
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  let size = 8;
  for (const part of parts) size += part.length;
  const out = new Uint8Array(size);
  out.set(u32s([size]), 0);
  out.set(ascii(type), 4);
  let at = 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function fullBox(type: string, version: number, flags: number, ...parts: Uint8Array[]): Uint8Array {
  return box(type, u32s([version * 0x1000000 + flags]), ...parts);
}

/** A table box: version/flags, the entry count, then `width` u32 fields per entry. */
function tableBox(type: string, version: number, width: number, fields: number[]): Uint8Array {
  return fullBox(type, version, 0, u32s([fields.length / width]), u32s(fields));
}

/** Run-length encodes `values` as flat `[count, value, count, value, …]` pairs. */
function runLengths(values: number[]): number[] {
  const pairs: number[] = [];
  for (const value of values) {
    if (pairs.length > 0 && pairs[pairs.length - 1] === value) pairs[pairs.length - 2] += 1;
    else pairs.push(1, value);
  }
  return pairs;
}

/** Groups a track's samples into ~`CHUNK_SECONDS` chunks. Offsets are assigned by the caller. */
function planChunks(track: Track, index: number): Chunk[] {
  const span = track.timescale * CHUNK_SECONDS;
  const chunks: Chunk[] = [];
  let decodeTime = 0;
  let chunkStart = 0;
  let current: Chunk | undefined;
  for (let i = 0; i < track.sizes.length; i++) {
    const descIndex = track.descIndexes[i];
    if (!current || decodeTime - chunkStart >= span || descIndex !== current.descIndex) {
      const seconds =
        track.emptyDuration / MOVIE_TIMESCALE + (decodeTime - track.mediaTime) / track.timescale;
      current = { track: index, first: i, count: 0, seconds, bytes: 0, descIndex, offset: 0 };
      chunks.push(current);
      chunkStart = decodeTime;
    }
    current.count += 1;
    current.bytes += track.sizes[i];
    decodeTime += track.durations[i];
  }
  return chunks;
}

function buildMoov(tracks: Track[], perTrack: Chunk[][], dataStart: number): Uint8Array {
  const durations = tracks.map(
    (t) => t.emptyDuration + toMovieTime(t.presentationEnd - t.mediaTime, t.timescale),
  );
  if (Math.max(...durations) > U32_MAX) fail("movie is too long for a 32-bit MP4");
  // Unity rate and volume, reserved words, identity matrix, pre_defined words, next track id.
  const mvhd = fullBox(
    "mvhd",
    0,
    0,
    u32s([0, 0, MOVIE_TIMESCALE, Math.max(...durations)]),
    u32s([0x10000, 0x1000000, 0, 0]),
    u32s([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000]),
    u32s([0, 0, 0, 0, 0, 0, tracks.length + 1]),
  );
  const traks = tracks.map((track, i) =>
    buildTrak(track, i + 1, durations[i], perTrack[i], dataStart),
  );
  return box("moov", mvhd, ...traks);
}

function buildTrak(
  track: Track,
  id: number,
  duration: number,
  chunks: Chunk[],
  dataStart: number,
): Uint8Array {
  // elst entries: segment duration (movie timescale), media time (-1 = empty), rate 1.0.
  const edits: number[] = [];
  if (track.emptyDuration > 0) edits.push(track.emptyDuration, -1, 0x10000);
  if (edits.length > 0 || track.mediaTime > 0) {
    edits.push(duration - track.emptyDuration, track.mediaTime, 0x10000);
  }

  const syncSamples: number[] = [];
  track.sync.forEach((isSync, i) => {
    if (isSync) syncSamples.push(i + 1);
  });
  // stsc entries: first chunk (1-based), samples per chunk, sample description index.
  const chunkRuns: number[] = [];
  chunks.forEach((chunk, i) => {
    const previous = chunks[i - 1];
    if (i === 0 || previous.count !== chunk.count || previous.descIndex !== chunk.descIndex) {
      chunkRuns.push(i + 1, chunk.count, chunk.descIndex);
    }
  });

  const stbl = [track.stsd, tableBox("stts", 0, 2, runLengths(track.durations))];
  if (track.ctsOffsets.some((offset) => offset !== 0)) {
    // Version 1 is the signed variant; version 0 readers treat offsets as unsigned.
    const version = track.ctsOffsets.some((offset) => offset < 0) ? 1 : 0;
    stbl.push(tableBox("ctts", version, 2, runLengths(track.ctsOffsets)));
  }
  // No stss means "every sample is a sync sample" — true for audio, wrong for video.
  if (syncSamples.length < track.sync.length) stbl.push(tableBox("stss", 0, 1, syncSamples));
  stbl.push(
    tableBox("stsc", 0, 3, chunkRuns),
    fullBox("stsz", 0, 0, u32s([0, track.sizes.length]), u32s(track.sizes)),
    tableBox(
      "stco",
      0,
      1,
      chunks.map((chunk) => dataStart + chunk.offset),
    ),
  );

  const dinf = box("dinf", fullBox("dref", 0, 0, u32s([1]), fullBox("url ", 0, 1)));
  return box(
    "trak",
    // Flags: enabled + in-movie, so players don't skip the track.
    fullBox("tkhd", 0, track.flags | 3, u32s([0, 0, id, 0, duration]), track.tkhdTail),
    ...(edits.length > 0 ? [box("edts", tableBox("elst", 0, 3, edits))] : []),
    box(
      "mdia",
      fullBox("mdhd", 0, 0, u32s([0, 0, track.timescale, track.mediaDuration]), track.mdhdTail),
      track.hdlr,
      box("minf", ...(track.mediaHeader ? [track.mediaHeader] : []), dinf, box("stbl", ...stbl)),
    ),
  );
}

function copyChunk(out: Uint8Array, target: number, track: Track, chunk: Chunk): void {
  const end = chunk.first + chunk.count;
  let i = chunk.first;
  while (i < end) {
    // Samples of one fragment sit back-to-back in the source: copy them as one run.
    const from = track.offsets[i];
    let to = from + track.sizes[i++];
    while (i < end && track.offsets[i] === to) to += track.sizes[i++];
    out.set(track.source.subarray(from, to), target);
    target += to - from;
  }
}
