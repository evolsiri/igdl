import { describe, expect, it } from "vitest";
import { remuxToMp4 } from "../mp4";
import { AAC_AUDIO_STREAM, VP9_VIDEO_STREAM } from "./fixtures";
import {
  box,
  fragmentedStream,
  readMp4,
  selfContainingStream,
  stsd,
  tkhdTail,
  type SampleSpec,
  type StreamSpec,
} from "./mp4-kit";

const NON_SYNC = 0x00010000;

/**
 * `count` samples whose bytes encode the tag and the sample index, so a
 * payload that ends up in the wrong place or the wrong track can't pass.
 */
function samples(
  tag: number,
  count: number,
  options: { duration: number; keyEvery?: number; size?: number },
): SampleSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    bytes: Array.from(
      { length: (options.size ?? 5) + (i % 3) },
      (_, j) => (tag * 37 + i * 7 + j) & 0xff,
    ),
    duration: options.duration,
    sync: options.keyEvery ? i % options.keyEvery === 0 : true,
  }));
}

/** Offsets of every occurrence of a four-character box type in `stream`. */
function indicesOf(stream: Uint8Array, type: string): number[] {
  const found: number[] = [];
  for (let i = 0; i + 4 <= stream.length; i++) {
    if (String.fromCharCode(...stream.subarray(i, i + 4)) === type) found.push(i);
  }
  return found;
}

/**
 * Pads a stream's `stsd` box with `extra` zero bytes, growing every box around
 * it to match. Sample offsets are relative to each `moof`, so they stay valid.
 */
function padStsd(stream: Uint8Array, extra: number): Uint8Array<ArrayBuffer> {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const sizeFieldOf = (type: string) => indicesOf(stream, type)[0] - 4;
  const stsdStart = sizeFieldOf("stsd");
  const stsdEnd = stsdStart + view.getUint32(stsdStart);
  const out = new Uint8Array(stream.length + extra);
  out.set(stream.subarray(0, stsdEnd), 0);
  out.set(stream.subarray(stsdEnd), stsdEnd + extra);
  const outView = new DataView(out.buffer);
  // Every box named here starts before the padding, so its offset is unchanged.
  for (const type of ["moov", "trak", "mdia", "minf", "stbl", "stsd"]) {
    outView.setUint32(sizeFieldOf(type), view.getUint32(sizeFieldOf(type)) + extra);
  }
  return out;
}

function payloads(list: SampleSpec[]): number[][] {
  return list.map((sample) => sample.bytes);
}

function video(fragments: StreamSpec["fragments"], extra: Partial<StreamSpec> = {}) {
  return fragmentedStream({ handler: "vide", timescale: 30, fragments, ...extra });
}

function audio(fragments: StreamSpec["fragments"], extra: Partial<StreamSpec> = {}) {
  return fragmentedStream({ handler: "soun", timescale: 48000, fragments, ...extra });
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("remuxToMp4 — a real VP9 + AAC rendition", () => {
  const out = remuxToMp4([VP9_VIDEO_STREAM, AAC_AUDIO_STREAM]);
  const mp4 = readMp4(out);
  const [vp9, aac] = mp4.tracks;

  it("writes a progressive MP4 — moov ahead of a single mdat — holding both tracks", () => {
    expect(mp4.layout).toEqual(["ftyp", "moov", "mdat"]);
    expect(mp4.tracks.map((t) => [t.id, t.handler, t.codec])).toEqual([
      [1, "vide", "vp09"],
      [2, "soun", "mp4a"],
    ]);
    expect(mp4.nextTrackId).toBe(3);
  });

  it("keeps every frame of both streams with its timing", () => {
    expect(vp9.samples).toHaveLength(10);
    expect(vp9.stts).toEqual([[10, 1024]]);
    expect(vp9.timescale).toBe(10240);
    expect(vp9.mediaDuration).toBe(10240);
    expect(aac.samples).toHaveLength(23);
    expect(aac.timescale).toBe(22050);
    // One second of each, in the movie's millisecond timescale.
    expect([vp9.duration, aac.duration, mp4.movieDuration]).toEqual([1000, 1000, 1000]);
  });

  it("marks the two keyframes for seeking and leaves the all-sync audio without stss", () => {
    expect(vp9.stss).toEqual([1, 6]);
    expect(aac.stss).toBeNull();
  });

  it("turns the audio's open-ended priming edit into one with a real duration", () => {
    // Source: segment_duration 0, media_time 1024. Players that take a zero
    // duration literally (VLC) would otherwise play no audio at all.
    expect(aac.edits).toEqual([{ duration: 1000, mediaTime: 1024 }]);
    expect(vp9.edits).toBeNull();
  });

  it("matches the output that was verified packet-for-packet against ffmpeg", async () => {
    // This exact file was checked with `ffmpeg -c copy -f framehash`: every
    // packet's timestamps and payload hash equal both the source streams and
    // ffmpeg's own remux of them, and it decodes without errors. A changed
    // hash means the output changed — re-verify against ffmpeg before
    // updating it.
    expect(await sha256(out)).toBe(
      "13496c8eebe00b9535f971b90224f9586ea296cbc2c4d9e30e197b04d59fe7f2",
    );
  });
});

describe("remuxToMp4 — sample data", () => {
  it("copies every sample byte-for-byte, in order, into the right track", () => {
    const frames = samples(1, 45, { duration: 1, keyEvery: 15 });
    const packets = samples(2, 70, { duration: 1024 });
    const out = readMp4(
      remuxToMp4([
        video([
          { decodeTime: 0, samples: frames.slice(0, 20) },
          { decodeTime: 20, samples: frames.slice(20) },
        ]),
        audio([
          { decodeTime: 0, samples: packets.slice(0, 30) },
          { decodeTime: 30 * 1024, samples: packets.slice(30) },
        ]),
      ]),
    );

    expect(out.tracks[0].samples.map((s) => Array.from(s))).toEqual(payloads(frames));
    expect(out.tracks[1].samples.map((s) => Array.from(s))).toEqual(payloads(packets));
  });

  it("keeps all sample data inside mdat", () => {
    const out = readMp4(
      remuxToMp4([video([{ decodeTime: 0, samples: samples(1, 12, { duration: 1 }) }])]),
    );
    const track = out.tracks[0];
    const last = track.samples.length - 1;
    expect(track.sampleOffsets[0]).toBe(out.mdat.start);
    expect(track.sampleOffsets[last] + track.samples[last].length).toBe(out.mdat.end);
  });

  it("interleaves the tracks in one-second chunks, video ahead of audio at the same instant", () => {
    const out = readMp4(
      remuxToMp4([
        // 3 s of video at 30 fps and 3 s of audio at 48 kHz (1024-sample frames).
        video([{ decodeTime: 0, samples: samples(1, 90, { duration: 1 }) }]),
        audio([{ decodeTime: 0, samples: samples(2, 141, { duration: 1024 }) }]),
      ]),
    );
    const [v, a] = out.tracks;
    expect(v.chunkOffsets).toHaveLength(3);
    expect(a.chunkOffsets).toHaveLength(3);
    // v0 a0 v1 a1 v2 a2 — no track runs more than a second ahead of the other.
    const order = [...v.chunkOffsets.map((o) => [o, "v"]), ...a.chunkOffsets.map((o) => [o, "a"])]
      .sort((x, y) => (x[0] as number) - (y[0] as number))
      .map(([, track]) => track);
    expect(order).toEqual(["v", "a", "v", "a", "v", "a"]);
  });

  it("finds sample data addressed by an absolute base offset or by the implicit moof base", () => {
    const frames = samples(3, 8, { duration: 1 });
    for (const dataBase of ["absolute", "implicit"] as const) {
      const out = readMp4(
        remuxToMp4([
          video(
            [
              { decodeTime: 0, samples: frames.slice(0, 4) },
              { decodeTime: 4, samples: frames.slice(4) },
            ],
            { dataBase },
          ),
        ]),
      );
      expect(out.tracks[0].samples.map((s) => Array.from(s))).toEqual(payloads(frames));
    }
  });

  it("reads samples split across several trun boxes in one fragment", () => {
    const frames = samples(4, 9, { duration: 1 });
    const out = readMp4(remuxToMp4([video([{ decodeTime: 0, samples: frames, runs: 3 }])]));
    expect(out.tracks[0].samples.map((s) => Array.from(s))).toEqual(payloads(frames));
  });
});

describe("remuxToMp4 — sample defaults", () => {
  it("takes duration, size and flags from tfhd when trun omits them", () => {
    const frames = samples(5, 6, { duration: 0, size: 7 }).map((s) => ({
      ...s,
      bytes: s.bytes.slice(0, 7),
    }));
    const out = readMp4(
      remuxToMp4([
        video([
          {
            decodeTime: 0,
            samples: frames,
            tfhdDefaults: { duration: 3, size: 7, flags: NON_SYNC },
            firstSampleFlags: 0,
          },
        ]),
      ]),
    );
    const track = out.tracks[0];
    expect(track.stts).toEqual([[6, 3]]);
    expect(track.samples.map((s) => Array.from(s))).toEqual(payloads(frames));
    // first_sample_flags marks the keyframe; the tfhd default marks the rest non-sync.
    expect(track.stss).toEqual([1]);
  });

  it("falls back to the trex defaults when neither trun nor tfhd carries a field", () => {
    const frames = samples(6, 4, { duration: 0, size: 6 }).map((s) => ({
      ...s,
      bytes: s.bytes.slice(0, 6),
    }));
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: frames }], {
          trexDefaults: { duration: 2, size: 6, flags: 0 },
        }),
      ]),
    );
    expect(out.tracks[0].stts).toEqual([[4, 2]]);
    expect(out.tracks[0].samples.map((s) => Array.from(s))).toEqual(payloads(frames));
    expect(out.tracks[0].stss).toBeNull();
  });
});

describe("remuxToMp4 — timing", () => {
  it("writes movie and track durations in milliseconds and media durations in track ticks", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 45, { duration: 1 }) }]), // 1.5 s
        audio([{ decodeTime: 0, samples: samples(2, 94, { duration: 1024 }) }]), // ≈2.005 s
      ]),
    );
    const [v, a] = out.tracks;
    expect(out.movieTimescale).toBe(1000);
    expect(v.mediaDuration).toBe(45);
    expect(v.duration).toBe(1500);
    expect(a.mediaDuration).toBe(94 * 1024);
    expect(a.duration).toBe(2005);
    expect(out.movieDuration).toBe(2005);
  });

  it("omits the edit list for a track that starts at zero with nothing to skip", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 3, { duration: 1 }) }], {
          edits: [{ duration: 0, mediaTime: 0 }],
        }),
      ]),
    );
    expect(out.tracks[0].edits).toBeNull();
  });

  it("keeps encoder priming out of the presentation and off the track duration", () => {
    const out = readMp4(
      remuxToMp4([
        audio([{ decodeTime: 0, samples: samples(2, 50, { duration: 1024 }) }], {
          edits: [{ duration: 0, mediaTime: 2112 }],
        }),
      ]),
    );
    const track = out.tracks[0];
    // (50 × 1024 − 2112) / 48000 s = 1022.67 ms.
    expect(track.edits).toEqual([{ duration: 1023, mediaTime: 2112 }]);
    expect(track.duration).toBe(1023);
    expect(track.mediaDuration).toBe(50 * 1024);
  });

  it("turns a first fragment that starts late into an empty edit, keeping A/V sync", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 60, { duration: 1 }) }]),
        // Audio's first sample decodes at 0.5 s.
        audio([{ decodeTime: 24000, samples: samples(2, 47, { duration: 1024 }) }]),
      ]),
    );
    const a = out.tracks[1];
    expect(a.edits).toEqual([
      { duration: 500, mediaTime: -1 },
      { duration: 1003, mediaTime: 0 },
    ]);
    expect(a.duration).toBe(1503);
    // The sample table itself restarts at zero.
    expect(a.mediaDuration).toBe(47 * 1024);
  });

  it("starts the movie when the earliest track starts, wherever the source timeline put it", () => {
    // Both streams begin 100 s into their timeline; audio trails video by 0.25 s.
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 3000, samples: samples(1, 60, { duration: 1 }) }]),
        audio([{ decodeTime: 4_812_000, samples: samples(2, 47, { duration: 1024 }) }]),
      ]),
    );
    const [v, a] = out.tracks;
    expect(v.edits).toBeNull();
    expect(v.duration).toBe(2000);
    expect(a.edits).toEqual([
      { duration: 250, mediaTime: -1 },
      { duration: 1003, mediaTime: 0 },
    ]);
    expect(out.movieDuration).toBe(2000);
  });

  it("gives a lone late-starting stream no lead-in", () => {
    const out = readMp4(
      remuxToMp4([video([{ decodeTime: 3000, samples: samples(1, 30, { duration: 1 }) }])]),
    );
    expect(out.tracks[0].edits).toBeNull();
    expect(out.movieDuration).toBe(1000);
  });

  it("preserves a leading empty edit from the source", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 60, { duration: 1 }) }]),
        audio([{ decodeTime: 0, samples: samples(2, 47, { duration: 1024 }) }], {
          movieTimescale: 600,
          edits: [
            { duration: 300, mediaTime: -1 }, // 0.5 s in the source's movie timescale
            { duration: 0, mediaTime: 0 },
          ],
        }),
      ]),
    );
    expect(out.tracks[1].edits).toEqual([
      { duration: 500, mediaTime: -1 },
      { duration: 1003, mediaTime: 0 },
    ]);
  });

  it("stretches the last sample across a gap between fragments so later samples stay on time", () => {
    const out = readMp4(
      remuxToMp4([
        video([
          { decodeTime: 0, samples: samples(1, 3, { duration: 1 }) },
          // Decode time jumps from 3 to 10.
          { decodeTime: 10, samples: samples(2, 3, { duration: 1 }) },
        ]),
      ]),
    );
    expect(out.tracks[0].durations).toEqual([1, 1, 8, 1, 1, 1]);
    expect(out.tracks[0].mediaDuration).toBe(13);
  });

  it("keeps fragments contiguous when tfdt is absent", () => {
    const out = readMp4(
      remuxToMp4([
        video([
          { samples: samples(1, 2, { duration: 2 }) },
          { samples: samples(2, 2, { duration: 2 }) },
        ]),
      ]),
    );
    expect(out.tracks[0].stts).toEqual([[4, 2]]);
  });

  it("reads 64-bit (version 1) headers, edits and decode times", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 60, { duration: 1 }) }], { wide: true }),
        audio([{ decodeTime: 0, samples: samples(2, 50, { duration: 1024 }) }], {
          wide: true,
          edits: [
            { duration: 250, mediaTime: -1 },
            { duration: 0, mediaTime: 1024 },
          ],
        }),
      ]),
    );
    const [v, a] = out.tracks;
    expect(v.timescale).toBe(30);
    expect(v.duration).toBe(2000);
    expect(a.timescale).toBe(48000);
    expect(a.edits).toEqual([
      { duration: 250, mediaTime: -1 },
      { duration: 1045, mediaTime: 1024 },
    ]);
  });

  it("reads a 64-bit (version 1) fragment decode time", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 60, { duration: 1 }) }], { wide: true }),
        // First audio sample decodes at 0.5 s, stored in a version 1 tfdt.
        audio([{ decodeTime: 24000, samples: samples(2, 47, { duration: 1024 }) }], { wide: true }),
      ]),
    );
    expect(out.tracks[1].edits).toEqual([
      { duration: 500, mediaTime: -1 },
      { duration: 1003, mediaTime: 0 },
    ]);
  });
});

describe("remuxToMp4 — reordered frames", () => {
  const reordered = (offsets: number[]): SampleSpec[] =>
    samples(7, offsets.length, { duration: 512, keyEvery: 4 }).map((s, i) => ({
      ...s,
      ctsOffset: offsets[i],
    }));

  it("writes unsigned composition offsets as ctts version 0", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: reordered([1024, 2048, 512, 512]) }], {
          timescale: 15360,
          edits: [{ duration: 0, mediaTime: 1024 }],
        }),
      ]),
    );
    const track = out.tracks[0];
    expect(track.ctts).toEqual({
      version: 0,
      runs: [
        [1, 1024],
        [1, 2048],
        [2, 512],
      ],
    });
    // The last-shown frame ends at 512 + 2048 + 512 = 3072; minus the 1024 the
    // edit skips, that is 2048 ticks = 133 ms — longer than the 2048-tick decode
    // span would give once the skip is subtracted.
    expect(track.edits).toEqual([{ duration: 133, mediaTime: 1024 }]);
  });

  it("writes negative composition offsets as the signed ctts version 1", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: reordered([0, 512, -512, 0]) }], {
          timescale: 15360,
          signedCts: true,
        }),
      ]),
    );
    expect(out.tracks[0].ctts).toEqual({
      version: 1,
      runs: [
        [1, 0],
        [1, 512],
        [1, -512],
        [1, 0],
      ],
    });
    expect(out.tracks[0].edits).toBeNull();
  });

  it("writes no ctts when presentation order equals decode order", () => {
    const out = readMp4(
      remuxToMp4([video([{ decodeTime: 0, samples: samples(1, 4, { duration: 1 }) }])]),
    );
    expect(out.tracks[0].ctts).toBeNull();
  });
});

describe("remuxToMp4 — box sizes", () => {
  /** A `free` box written with the 64-bit "largesize" form: size field 1, real size in the next 8 bytes. */
  function largeFree(payloadBytes: number): Uint8Array {
    const out = new Uint8Array(16 + payloadBytes);
    const view = new DataView(out.buffer);
    view.setUint32(0, 1);
    out.set([0x66, 0x72, 0x65, 0x65], 4); // "free"
    view.setBigUint64(8, BigInt(out.length));
    return out;
  }

  function splice(stream: Uint8Array, at: number, insert: Uint8Array): Uint8Array {
    const out = new Uint8Array(stream.length + insert.length);
    out.set(stream.subarray(0, at), 0);
    out.set(insert, at);
    out.set(stream.subarray(at), at + insert.length);
    return out;
  }

  const frames = samples(8, 6, { duration: 1 });

  it("skips a box that uses the 64-bit size form", () => {
    // Absolute data offsets, so inserting bytes ahead of moov would break them:
    // append the box after the last mdat instead.
    const stream = video([{ decodeTime: 0, samples: frames }]);
    const withLarge = splice(stream, stream.length, largeFree(32));
    const out = readMp4(remuxToMp4([withLarge]));
    expect(out.tracks[0].samples.map((s) => Array.from(s))).toEqual(payloads(frames));
  });

  it("reads a final box whose size is 0, meaning it runs to the end of the file", () => {
    const stream = video([{ decodeTime: 0, samples: frames }]);
    const tail = new Uint8Array(24); // size 0 + "free" + 16 bytes of padding
    tail.set([0x66, 0x72, 0x65, 0x65], 4);
    const out = readMp4(remuxToMp4([splice(stream, stream.length, tail)]));
    expect(out.tracks[0].samples.map((s) => Array.from(s))).toEqual(payloads(frames));
  });
});

describe("remuxToMp4 — track headers", () => {
  it("copies the codec configuration and the track's geometry untouched", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 2, { duration: 1 }) }], { trackId: 7 }),
        audio([{ decodeTime: 0, samples: samples(2, 2, { duration: 1024 }) }], { trackId: 7 }),
      ]),
    );
    const [v, a] = out.tracks;
    expect(Array.from(v.stsd)).toEqual(Array.from(stsd("vide")));
    expect(Array.from(a.stsd)).toEqual(Array.from(stsd("soun")));
    expect(Array.from(v.tkhdTail)).toEqual(Array.from(tkhdTail("vide")));
    expect(Array.from(a.tkhdTail)).toEqual(Array.from(tkhdTail("soun")));
  });

  it("renumbers tracks 1..N in the order the streams were passed and enables them", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 2, { duration: 1 }) }], { trackId: 9 }),
        audio([{ decodeTime: 0, samples: samples(2, 2, { duration: 1024 }) }], { trackId: 9 }),
      ]),
    );
    expect(out.tracks.map((t) => t.id)).toEqual([1, 2]);
    expect(out.tracks.every((t) => (t.flags & 3) === 3)).toBe(true);
    expect(out.brands).toContain("isom");
  });

  it("remuxes a lone video stream into a video-only file", () => {
    const out = readMp4(
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 5, { duration: 1, keyEvery: 5 }) }]),
      ]),
    );
    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0].handler).toBe("vide");
    expect(out.tracks[0].stss).toEqual([1]);
  });
});

describe("remuxToMp4 — rejected input", () => {
  const good = () => video([{ decodeTime: 0, samples: samples(1, 3, { duration: 1 }) }]);

  it("throws when given no streams", () => {
    expect(() => remuxToMp4([])).toThrow(/no streams/);
  });

  it("throws on data that isn't an MP4 at all", () => {
    expect(() => remuxToMp4([new TextEncoder().encode("<html>403 Forbidden</html>")])).toThrow(
      /remuxToMp4:/,
    );
  });

  it("throws on a stream without a moov box", () => {
    expect(() => remuxToMp4([box("ftyp", new Uint8Array(8))])).toThrow(/missing "moov"/);
  });

  it("throws on a stream whose fragments hold no samples", () => {
    expect(() => remuxToMp4([video([])])).toThrow(/no samples/);
  });

  it("throws on a stream cut off mid-download", () => {
    const stream = good();
    expect(() => remuxToMp4([stream.subarray(0, stream.length - 4)])).toThrow(/truncated/);
  });

  it("throws when a fragment points at sample data beyond the end of the stream", () => {
    const stream = good();
    // Find the trun's first sample-size field and inflate it past the file.
    const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
    const [trun] = indicesOf(stream, "trun");
    // type(4) + version/flags(4) + count(4) + data offset(4) + first duration(4) → first size.
    view.setUint32(trun + 20, 0x00ffffff);
    expect(() => remuxToMp4([stream])).toThrow(/outside the stream/);
  });

  it("throws on a corrupt sample count instead of looping over it", () => {
    // Every per-sample field comes from tfhd, so nothing in the trun bounds its count.
    const stream = video([
      {
        decodeTime: 0,
        samples: samples(1, 3, { duration: 0, size: 5 }).map((s) => ({
          ...s,
          bytes: s.bytes.slice(0, 5),
        })),
        tfhdDefaults: { duration: 1, size: 5, flags: 0 },
      },
    ]);
    const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
    const [trun] = indicesOf(stream, "trun");
    view.setUint32(trun + 8, 0xfffffff0); // type(4) + version/flags(4) → sample count
    expect(() => remuxToMp4([stream])).toThrow(/too many samples/);
  });

  it("throws when samples claim more bytes than the stream holds", () => {
    // Three runs of one 1000-byte sample each, sizes taken from tfhd.
    const stream = video([
      {
        decodeTime: 0,
        samples: [1, 2, 3].map((tag) => ({ bytes: new Array<number>(1000).fill(tag), duration: 1 })),
        tfhdDefaults: { duration: 1, size: 1000, flags: 0 },
        runs: 3,
      },
    ]);
    const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
    const [tfhd] = indicesOf(stream, "tfhd");
    const truns = indicesOf(stream, "trun");
    // Point every run at the first sample's bytes and claim 1500 bytes for each:
    // each sample is in bounds on its own, but together they claim 4500 bytes of
    // a stream that is shorter than that.
    view.setUint32(tfhd + 16, 1500); // type(4) + version/flags(4) + track id(4) + default duration(4)
    const firstOffset = view.getUint32(truns[0] + 12); // type(4) + version/flags(4) + count(4)
    for (const trun of truns) view.setUint32(trun + 12, firstOffset);
    expect(stream.length).toBeLessThan(4500);

    expect(() => remuxToMp4([stream])).toThrow(/samples overlap/);
  });

  it("throws rather than build a file larger than the caller's limit", () => {
    const stream = video([{ decodeTime: 0, samples: samples(1, 30, { duration: 1 }) }]);
    const size = remuxToMp4([stream]).length;

    expect(remuxToMp4([stream], size)).toHaveLength(size);
    expect(() => remuxToMp4([stream], size - 1)).toThrow(/output exceeds the size limit/);
  });

  it("applies that limit to the output, which a crafted stream can make larger than the input", () => {
    // One sample that claims the whole stream — header boxes and all — as its data.
    const stream = selfContainingStream();

    // Within every per-sample check, and still the output outgrows the input…
    expect(remuxToMp4([stream]).length).toBeGreaterThan(stream.length);
    // …so the limit has to be enforced on what is built, not on what came in.
    expect(() => remuxToMp4([stream], stream.length)).toThrow(/output exceeds the size limit/);
  });

  it("throws on a header box padded far beyond what a codec configuration needs", () => {
    const stream = video([{ decodeTime: 0, samples: samples(1, 3, { duration: 1 }) }]);

    // Under the ceiling the padding is carried through like any other configuration…
    const padded = remuxToMp4([padStsd(stream, 60_000)]);
    expect(padded.length).toBeGreaterThan(remuxToMp4([stream]).length + 60_000 - 1);
    // …past it, the stream is refused before anything is copied.
    expect(() => remuxToMp4([padStsd(stream, 64 * 1024)])).toThrow(/oversized "stsd" box/);
  });

  it("throws on a stream made of more boxes than any rendition has", () => {
    // 100,001 empty boxes: under a megabyte of input, but an object apiece to read.
    const count = 100_001;
    const flood = new Uint8Array(count * 8);
    const view = new DataView(flood.buffer);
    for (let i = 0; i < count; i++) {
      view.setUint32(i * 8, 8);
      flood.set([0x66, 0x72, 0x65, 0x65], i * 8 + 4); // "free"
    }
    expect(() => remuxToMp4([flood])).toThrow(/too many boxes/);
  });

  it("throws when a few hundred bytes declare more samples than the stream has bytes", () => {
    const stream = video([
      {
        decodeTime: 0,
        samples: [{ bytes: [], duration: 1 }],
        tfhdDefaults: { duration: 1, size: 0, flags: 0 },
      },
    ]);
    const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
    const [trun] = indicesOf(stream, "trun");
    // Well under the million-sample cap, but far more than this stream could hold.
    view.setUint32(trun + 8, 500_000);
    expect(stream.length).toBeLessThan(2000);
    expect(() => remuxToMp4([stream])).toThrow(/too many samples/);
  });

  it("throws when the decode timeline overflows 32 bits even though the presentation end does not", () => {
    // Two samples of 2^31 ticks each: 2^32 of decode time. A large negative
    // composition offset keeps the presentation end small.
    const stream = video(
      [
        {
          decodeTime: 0,
          samples: [
            { bytes: [1], duration: 0x80000000, ctsOffset: 0 },
            { bytes: [2], duration: 0x80000000, ctsOffset: -0x7fffffff },
          ],
        },
      ],
      // A fine timescale, so the movie's millisecond duration still fits and
      // only the track's own tick count overflows.
      { signedCts: true, timescale: 90000 },
    );
    expect(() => remuxToMp4([stream])).toThrow(/track is too long for a 32-bit MP4/);
  });

  it("throws when the edit list's start time doesn't fit the signed 32-bit field", () => {
    const stream = audio(
      [
        {
          decodeTime: 0,
          samples: [
            { bytes: [1], duration: 0xf0000000 },
            { bytes: [2], duration: 1 },
          ],
        },
      ],
      { edits: [{ duration: 0, mediaTime: 0x80000001 }], wide: true },
    );
    expect(() => remuxToMp4([stream])).toThrow(/edit list is out of range/);
  });

  it("reports a header that runs off the end of the data as a remux error, not a RangeError", () => {
    const stream = good();
    const [tfhd] = indicesOf(stream, "tfhd");
    // Cut the stream inside tfhd, then repair the enclosing box sizes so the cut
    // is only discovered when a field is read.
    const cut = stream.slice(0, tfhd + 6);
    const view = new DataView(cut.buffer);
    const [moof] = indicesOf(cut, "moof");
    const [traf] = indicesOf(cut, "traf");
    view.setUint32(moof - 4, cut.length - (moof - 4));
    view.setUint32(traf - 4, cut.length - (traf - 4));
    view.setUint32(tfhd - 4, cut.length - (tfhd - 4));
    expect(() => remuxToMp4([cut])).toThrow(/^remuxToMp4: /);
  });

  it("throws on a zero timescale instead of dividing by it", () => {
    expect(() =>
      remuxToMp4([
        video([{ decodeTime: 0, samples: samples(1, 2, { duration: 1 }) }], { timescale: 0 }),
      ]),
    ).toThrow(/zero timescale/);
  });
});
