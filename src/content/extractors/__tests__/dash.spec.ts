import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickVp9Rendition, resolveReelVp9 } from "../dash";
import { storageCache } from "../storage";

interface Rep {
  codecs: string;
  url: string;
  width?: number;
  height?: number;
  bandwidth?: number;
  /** Extra child markup, e.g. a `<SegmentTemplate>`. */
  extra?: string;
}

/**
 * Builds a manifest modeled on Instagram's `video_dash_manifest`: the
 * on-demand profile, one video and one audio AdaptationSet, each
 * Representation a single file addressed by `<BaseURL>` + `<SegmentBase>`,
 * with Meta's `FB*` attributes alongside the standard ones. URLs are
 * XML-escaped the way a serialized manifest carries them.
 */
function manifest(video: Rep[], audio: Rep[] = []): string {
  const escape = (url: string) => url.replace(/&/g, "&amp;");
  const videoReps = video
    .map(
      (r, i) => `
   <Representation id="${i}v" bandwidth="${r.bandwidth ?? 0}" codecs="${r.codecs}" mimeType="video/mp4" sar="1:1" FBEncodingTag="tag_${i}" FBContentLength="1000" width="${r.width ?? 0}" height="${r.height ?? 0}" FBQualityClass="hd" FBQualityLabel="${r.height}p">
    <BaseURL>${escape(r.url)}</BaseURL>
    <SegmentBase indexRange="919-998" timescale="15360" FBFirstSegmentRange="999-63467">
     <Initialization range="0-918"/>
    </SegmentBase>${r.extra ?? ""}
   </Representation>`,
    )
    .join("");
  const audioReps = audio
    .map(
      (r, i) => `
   <Representation id="${i}a" bandwidth="${r.bandwidth ?? 0}" codecs="${r.codecs}" mimeType="audio/mp4" audioSamplingRate="44100" FBEncodingTag="audio_${i}">
    <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>
    <BaseURL>${escape(r.url)}</BaseURL>
    <SegmentBase indexRange="824-951" timescale="44100">
     <Initialization range="0-823"/>
    </SegmentBase>
   </Representation>`,
    )
    .join("");
  const audioSet =
    audio.length > 0
      ? `
  <AdaptationSet id="1" contentType="audio" subsegmentAlignment="true">${audioReps}
  </AdaptationSet>`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" minBufferTime="PT2S" type="static" mediaPresentationDuration="PT14.933333S" FBManifestIdentifier="abc">
 <Period id="0" duration="PT14.933333S">
  <AdaptationSet id="0" contentType="video" frameRate="15360/512" subsegmentAlignment="true" par="9:16">${videoReps}
  </AdaptationSet>${audioSet}
 </Period>
</MPD>`;
}

const cdn = (name: string) =>
  `https://scontent-lax3-1.cdninstagram.com/o1/v/t16/f2/m69/${name}.mp4?strext=1&_nc_cat=110&oh=00_Abc&oe=68F0`;

const H264_720 = { codecs: "avc1.64001F", width: 720, height: 1280, bandwidth: 1_900_000, url: cdn("h264-720") };
const VP9_540 = { codecs: "vp09.00.21.08.00.01.01.01.00", width: 540, height: 960, bandwidth: 600_000, url: cdn("vp9-540") };
const VP9_1080 = { codecs: "vp09.00.40.08.00.01.01.01.00", width: 1080, height: 1920, bandwidth: 2_400_000, url: cdn("vp9-1080") };
const VP9_720 = { codecs: "vp09.00.31.08.00.01.01.01.00", width: 720, height: 1280, bandwidth: 1_200_000, url: cdn("vp9-720") };
const AAC = { codecs: "mp4a.40.5", bandwidth: 66_000, url: cdn("heaac") };

describe("pickVp9Rendition", () => {
  it("picks the highest-resolution VP9 stream and the audio stream", () => {
    const xml = manifest([H264_720, VP9_540, VP9_1080, VP9_720], [AAC]);
    expect(pickVp9Rendition(xml)).toEqual({ videoUrl: VP9_1080.url, audioUrl: AAC.url });
  });

  it("returns the URLs with XML entities decoded, ready to fetch", () => {
    const picked = pickVp9Rendition(manifest([VP9_1080], [AAC]));
    expect(picked?.videoUrl).toContain("?strext=1&_nc_cat=110&oh=00_Abc");
    expect(picked?.videoUrl).not.toContain("&amp;");
  });

  it("never picks a non-VP9 stream, even one with a higher resolution", () => {
    const av1 = { codecs: "av01.0.08M.08", width: 2160, height: 3840, bandwidth: 9_000_000, url: cdn("av1-4k") };
    const h264 = { ...H264_720, width: 1440, height: 2560, url: cdn("h264-1440") };
    expect(pickVp9Rendition(manifest([av1, h264, VP9_540], [AAC]))?.videoUrl).toBe(VP9_540.url);
  });

  it("ranks by the shorter side, so a landscape 1080p beats a portrait 720p", () => {
    const landscape = { ...VP9_1080, width: 1920, height: 1080, url: cdn("vp9-landscape") };
    expect(pickVp9Rendition(manifest([VP9_720, landscape], [AAC]))?.videoUrl).toBe(landscape.url);
  });

  it("breaks a resolution tie with the higher bitrate", () => {
    const richer = { ...VP9_1080, bandwidth: 4_000_000, url: cdn("vp9-1080-high") };
    expect(pickVp9Rendition(manifest([VP9_1080, richer], [AAC]))?.videoUrl).toBe(richer.url);
  });

  it("picks the highest-bitrate AAC audio", () => {
    const better = { codecs: "mp4a.40.2", bandwidth: 128_000, url: cdn("aac-lc") };
    expect(pickVp9Rendition(manifest([VP9_1080], [AAC, better]))?.audioUrl).toBe(better.url);
  });

  it("prefers AAC over xHE-AAC, which few players can decode, even at a lower bitrate", () => {
    const xhe = { codecs: "mp4a.40.42", bandwidth: 256_000, url: cdn("xhe-aac") };
    expect(pickVp9Rendition(manifest([VP9_1080], [xhe, AAC]))?.audioUrl).toBe(AAC.url);
    // Still better than a silent file when it is the only audio there is.
    expect(pickVp9Rendition(manifest([VP9_1080], [xhe]))?.audioUrl).toBe(xhe.url);
  });

  it("never returns a silent file unless the caller says the reel is silent", () => {
    const silent = manifest([VP9_1080]);
    expect(pickVp9Rendition(silent)).toBeNull();
    expect(pickVp9Rendition(silent, { allowSilent: true })).toEqual({ videoUrl: VP9_1080.url });
  });

  it("returns null when the reel has an audio track that can't be used, even if silence is allowed", () => {
    // The audio exists but isn't a fetchable CDN file: dropping it would lose the sound.
    const unusable = { ...AAC, url: "https://example.com/aac.mp4" };
    expect(pickVp9Rendition(manifest([VP9_1080], [unusable]), { allowSilent: true })).toBeNull();
  });

  it("takes audio from the first audio track only — later tracks are translations", () => {
    const original = { codecs: "mp4a.40.5", bandwidth: 64_000, url: cdn("audio-original") };
    const dubbed = { codecs: "mp4a.40.2", bandwidth: 192_000, url: cdn("audio-dubbed") };
    const xml = manifest([VP9_1080], [original]).replace(
      " </Period>",
      `  <AdaptationSet id="2" contentType="audio" lang="es">
   <Representation id="9a" bandwidth="${dubbed.bandwidth}" codecs="${dubbed.codecs}" mimeType="audio/mp4">
    <BaseURL>${dubbed.url.replace(/&/g, "&amp;")}</BaseURL>
   </Representation>
  </AdaptationSet>
 </Period>`,
    );
    expect(xml).toContain("audio-dubbed");
    expect(pickVp9Rendition(xml)?.audioUrl).toBe(original.url);
  });

  it("does not pick a VP9 stream smaller than the video it would replace", () => {
    const xml = manifest([H264_720, VP9_540], [AAC]);
    expect(pickVp9Rendition(xml, { minResolution: 720 })).toBeNull();
    expect(pickVp9Rendition(xml, { minResolution: 540 })?.videoUrl).toBe(VP9_540.url);
    expect(pickVp9Rendition(xml)?.videoUrl).toBe(VP9_540.url);
  });

  it("takes a VP9 stream of unknown size — there is nothing to compare it with", () => {
    const unsized = { ...VP9_1080, width: 0, height: 0 };
    expect(pickVp9Rendition(manifest([unsized], [AAC]), { minResolution: 720 })?.videoUrl).toBe(
      VP9_1080.url,
    );
  });

  it("tolerates whitespace around the manifest", () => {
    const padded = `\n  ${manifest([VP9_1080], [AAC])}\n`;
    expect(pickVp9Rendition(padded)).toEqual({ videoUrl: VP9_1080.url, audioUrl: AAC.url });
  });

  it("reads codecs and type hoisted onto the AdaptationSet", () => {
    const xml = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
      <AdaptationSet mimeType="video/mp4" codecs="vp09.00.40.08">
        <Representation width="1080" height="1920" bandwidth="1"><BaseURL>https://scontent.cdninstagram.com/v.mp4</BaseURL></Representation>
      </AdaptationSet>
      <AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2">
        <Representation bandwidth="1"><BaseURL>https://scontent.cdninstagram.com/a.mp4</BaseURL></Representation>
      </AdaptationSet>
    </Period></MPD>`;
    expect(pickVp9Rendition(xml)).toEqual({
      videoUrl: "https://scontent.cdninstagram.com/v.mp4",
      audioUrl: "https://scontent.cdninstagram.com/a.mp4",
    });
  });

  it("returns null when Instagram published no VP9 encoding", () => {
    expect(pickVp9Rendition(manifest([H264_720], [AAC]))).toBeNull();
  });

  it.each([undefined, null, "", 42, { xml: true }])("returns null for a missing manifest (%j)", (value) => {
    expect(pickVp9Rendition(value)).toBeNull();
  });

  it("returns null for a manifest that isn't well-formed XML", () => {
    expect(pickVp9Rendition(manifest([VP9_1080], [AAC]).slice(0, 700))).toBeNull();
    expect(pickVp9Rendition("not xml at all")).toBeNull();
  });

  it("skips streams that can't be fetched as one HTTPS file from Instagram's CDN", () => {
    const relative = { ...VP9_1080, url: "segments/vp9-1080.mp4" };
    const insecure = { ...VP9_720, url: "http://scontent.cdninstagram.com/vp9-720.mp4" };
    const elsewhere = { ...VP9_1080, url: "https://example.com/vp9-1080.mp4" };
    const templated = {
      ...VP9_1080,
      url: cdn("vp9-templated"),
      extra: '<SegmentTemplate media="seg-$Number$.m4s" initialization="init.mp4"/>',
    };
    const xml = manifest([relative, insecure, elsewhere, templated, VP9_540], [AAC]);
    expect(pickVp9Rendition(xml)?.videoUrl).toBe(VP9_540.url);
  });
});

describe("resolveReelVp9", () => {
  const original = storageCache.canonical;
  const reel = { product_type: "clips", video_dash_manifest: manifest([H264_720, VP9_1080], [AAC]) };

  function setPath(pathname: string) {
    window.history.replaceState({}, "", pathname);
  }

  beforeEach(() => {
    storageCache.canonical = { ...original, preferVp9Reels: true };
    setPath("/");
  });

  afterEach(() => {
    storageCache.canonical = original;
    setPath("/");
  });

  it("returns nothing while the setting is off — the default", () => {
    storageCache.canonical = original;
    expect(original.preferVp9Reels).toBe(false);
    expect(resolveReelVp9(reel)).toBeUndefined();
  });

  it("returns the VP9 rendition of a reel once the setting is on", () => {
    expect(resolveReelVp9(reel)).toEqual({ videoUrl: VP9_1080.url, audioUrl: AAC.url });
  });

  it("recognizes a reel shown in the home feed or a post dialog by its product type", () => {
    setPath("/p/DAbc123/");
    expect(resolveReelVp9(reel)).toBeDefined();
  });

  it("leaves non-reel videos alone — carousel videos and classic feed videos keep the standard file", () => {
    setPath("/p/DAbc123/");
    expect(resolveReelVp9({ ...reel, product_type: "feed" })).toBeUndefined();
    expect(resolveReelVp9({ ...reel, product_type: "carousel_container" })).toBeUndefined();
    expect(resolveReelVp9({ video_dash_manifest: reel.video_dash_manifest })).toBeUndefined();
  });

  it("does not let a reel page override an explicit non-reel product type", () => {
    // The shape getUrlFromInfoApi returns for a carousel video: the child item, plus its parent.
    setPath("/reel/DAbc123/");
    const carouselVideo = {
      product_type: "carousel_item",
      video_dash_manifest: reel.video_dash_manifest,
      origin_data: { product_type: "carousel_container" },
    };
    expect(resolveReelVp9(carouselVideo)).toBeUndefined();
    expect(resolveReelVp9({ ...reel, product_type: "feed" })).toBeUndefined();
  });

  it.each(["/reels/", "/alice/reels/", "/reels/audio/1234567890/", "/explore/", "/alice/"])(
    "does not treat %s as a reel page",
    (pathname) => {
      setPath(pathname);
      expect(resolveReelVp9({ video_dash_manifest: reel.video_dash_manifest })).toBeUndefined();
    },
  );

  it("keeps the standard video when the best VP9 stream is smaller than it", () => {
    const small = manifest([H264_720, VP9_540], [AAC]);
    expect(
      resolveReelVp9({
        product_type: "clips",
        video_dash_manifest: small,
        video_versions: [{ type: 101, width: 720, height: 1280, url: cdn("standard") }],
      }),
    ).toBeUndefined();
    // Same size or larger is an upgrade worth taking.
    expect(
      resolveReelVp9({
        ...reel,
        video_versions: [{ type: 101, width: 720, height: 1280, url: cdn("standard") }],
      }),
    ).toEqual({ videoUrl: VP9_1080.url, audioUrl: AAC.url });
  });

  it("only downloads video-only VP9 for a reel Instagram marks as having no audio", () => {
    const silent = manifest([VP9_1080]);
    expect(
      resolveReelVp9({ product_type: "clips", video_dash_manifest: silent, has_audio: false }),
    ).toEqual({ videoUrl: VP9_1080.url });
    expect(
      resolveReelVp9({ product_type: "clips", video_dash_manifest: silent, has_audio: true }),
    ).toBeUndefined();
    expect(resolveReelVp9({ product_type: "clips", video_dash_manifest: silent })).toBeUndefined();
  });

  it.each(["/reel/DAbc123/", "/reels/DAbc123/", "/alice/reel/DAbc123/"])(
    "treats everything on %s as a reel, even when the payload omits product_type",
    (pathname) => {
      setPath(pathname);
      expect(resolveReelVp9({ video_dash_manifest: reel.video_dash_manifest })).toEqual({
        videoUrl: VP9_1080.url,
        audioUrl: AAC.url,
      });
    },
  );

  it("gives up on VP9, rather than on the download, when the manifest can't be parsed at all", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "DOMParser",
      class {
        parseFromString(): never {
          throw new Error("parser unavailable");
        }
      },
    );
    try {
      expect(resolveReelVp9(reel)).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("could not read the DASH manifest"),
        expect.any(Error),
      );
    } finally {
      vi.unstubAllGlobals();
      warn.mockRestore();
    }
  });

  it("returns nothing for a reel that has no VP9 encoding", () => {
    expect(
      resolveReelVp9({ product_type: "clips", video_dash_manifest: manifest([H264_720], [AAC]) }),
    ).toBeUndefined();
    expect(resolveReelVp9({ product_type: "clips" })).toBeUndefined();
  });

  it.each([null, undefined, "reel", 7])("returns nothing for a non-object item (%j)", (item) => {
    setPath("/reel/DAbc123/");
    expect(resolveReelVp9(item)).toBeUndefined();
  });
});
