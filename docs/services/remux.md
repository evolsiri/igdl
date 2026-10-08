# RemuxService

Turns a DASH rendition — a video-only stream plus an audio-only stream — into one playable `video/mp4` blob. It exists for the **Download reels in VP9** setting: Instagram publishes a reel's VP9 encoding only as a pair of single-track DASH streams, so the two have to be fetched and combined before there is a file worth saving.

"Remux" means the streams are **copied, not re-encoded**. Every video frame and audio packet lands in the output bit-for-bit; only the container bookkeeping is rebuilt. That keeps the rendition's exact quality and makes the work cheap: the time goes into downloading the two streams, not into combining them.

## Public API

```ts
interface RemuxService {
  build(rendition: DashRendition): Promise<Blob>;
}

interface RemuxServiceOptions {
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  isAllowedUrl?: (url: string) => boolean;
}

function createRemuxService(options?: RemuxServiceOptions): RemuxService;
```

`DashRendition` (`src/types/instagram.ts`) is `{ videoUrl: string; audioUrl?: string }`.

`build()` fetches both URLs **in parallel** with `credentials: "omit"`, then hands the two byte arrays to `remuxToMp4()` (`src/services/remux/mp4.ts`) and wraps the result in a `Blob`. A rendition without `audioUrl` produces a video-only file.

Rejects — always with a `RemuxService.build:` prefix — on:

- A URL that `isAllowedUrl` refuses. The default, `isInstagramCdnUrl` (`src/utils/instagram-cdn.ts`), accepts only HTTPS URLs on `*.cdninstagram.com` and `*.fbcdn.net` that carry no embedded credentials. Nothing is fetched if either URL fails, what is fetched is the parsed, absolute form of the URL that was checked, and a response that was redirected off the CDN is refused before its body is read.
- Any non-2xx response (message includes the URL and status) or network error.
- Streams that add up to more than `maxBytes` (default 128 MiB). The check runs twice: against the declared `Content-Length` values before any body is read, so an oversized reel costs no download, and again chunk by chunk while reading, so a missing or wrong `Content-Length` can't let a transfer run past the limit.
- Streams that fit under `maxBytes` but would remux into a file larger than it.
- Transfers that outlive `timeoutMs` (default two minutes).
- A stream `remuxToMp4()` cannot parse.

When either transfer fails, the other is aborted — one `AbortController` covers both.

## The remuxer

`remuxToMp4(streams, maxBytes?)` is a pure function: single-track fragmented MP4 byte arrays in (video first), one progressive MP4 out, or an error if that file would be larger than `maxBytes`.

A DASH stream keeps its samples in `moof` + `mdat` fragment pairs and leaves the `moov` sample tables empty. The remuxer reads every fragment's `trun`, rebuilds classic `stts` / `stsc` / `stsz` / `stco` tables, and writes `ftyp` → `moov` → a single `mdat` in which the tracks interleave in one-second chunks. The codec configuration (`stsd`) is copied verbatim, which is what makes it codec-agnostic — VP9, H.264, AV1 and AAC all pass through the same code.

Three details keep the output in sync with the source:

- **Encoder priming.** A fragmented audio stream marks its priming samples with an edit list of the form "segment duration 0, media time N" — play from sample N to the end. A zero duration is only meaningful in a fragmented file; some players read it literally in a progressive one and play no audio. The remuxer writes the same edit with the real duration.
- **Late starts.** A stream whose first fragment doesn't decode at time zero, or whose edit list opens with an empty edit, gets an empty edit in the output so it starts as late — relative to the other track — as it did in the source. Only the relative offset is kept: the movie begins when its earliest track does.
- **Reordered frames.** Composition offsets go to `ctts` (the signed version 1 when any offset is negative), and track durations are measured to the end of the last-*presented* frame.

It throws — and the caller falls back — on anything it can't represent or shouldn't trust: a stream that isn't fragmented MP4, sample data pointing outside the stream, samples that together claim more bytes than the stream holds, more samples than the stream has bytes (or than one million), more than 100,000 boxes at one level, a `stsd`, `hdlr` or media-header box over 64 KiB (these are copied through, and real ones run to a few hundred bytes), or a duration, edit or file size that overflows a 32-bit MP4 field. All of these are checked before the output buffer is allocated.

The output is not simply as large as the input. The sample tables are rebuilt, and a stream written to do so can make one sample claim the stream's own header boxes as data, so that they are copied twice. That is why `maxBytes` is checked against the planned output as well as against the transfers.

## Lifecycle

Stateless. The background creates one instance at startup; nothing persists between `build()` calls. The service does not limit how many builds run at once — its caller does: the background runs them one at a time (`downloads.ts:buildVp9`), because each holds both streams and the output in memory.

A build lasts as long as the two downloads do — up to `timeoutMs`. The service does nothing to keep its host context alive for that long; that is `handleDownloadMedia`'s job, and on Firefox it matters (see the MV3 lifecycle section of `../architecture.md`).

## Storage

None.

## Call sites

- `src/background/chrome.ts` / `firefox.ts` — instantiation, registered on `BackgroundDeps.remux`.
- `src/background/shared/downloads.ts:buildVp9`, for `handleDownloadMedia` — calls `build()` when a `DOWNLOAD_MEDIA` resource carries a `vp9` rendition and the user's `preferVp9Reels` setting is on, then turns the resulting blob into a download URL. Any rejection, at either step, makes the handler download the standard video instead. Both URLs are checked with `isInstagramCdnUrl` before the call, so a rendition pointing anywhere else falls back without a fetch.

The rendition itself is chosen in the content script: `src/content/extractors/dash.ts:pickVp9Rendition` parses the reel's `video_dash_manifest`, and `resolveReelVp9` gates that on the `preferVp9Reels` setting. See `../download-flow.md`.

## Invariants

- **The service runs in the background, never in the content script.** A remux holds the streams and the output in memory at once; doing that on Instagram's main thread would freeze the tab, and the result would then have to cross the message boundary as one oversized string.
- **No CDN host permission.** The fetches work because Instagram's media CDN answers any origin (`Access-Control-Allow-Origin: *`). `credentials: "omit"` is load-bearing for the same reason as in [`zip.md`](./zip.md): a wildcard CORS answer cannot be combined with credentials.
- **Only the CDN is fetched.** The stream URLs originate in page data and are fetched from the extension's own origin, so the host check is not optional. Widen `isAllowedUrl` only for a host Instagram really serves media from.
- **A failed remux is never a failed download.** `build()` rejects; it does not try to recover. Recovery — the standard video — belongs to the caller.
- **The size limit protects Chrome.** Chrome's service worker cannot mint `blob:` URLs, so the remuxed file reaches `chrome.downloads.download` as a base64 `data:` URL, a third larger than the file and passed in a single extension-API call. In manual probes on Chromium 147 — `data:` downloads started from the extension's service worker — a 160 MiB file (a 213 MiB URL) downloaded intact and a 200 MiB file (267 MiB) hung the browser. The limit covers the streams and the remuxed file alike, which keeps the URL near 171 MiB; raise it only with a real-browser test at the new size.
- **Output changes are verified against ffmpeg.** The spec pins the output for a real VP9 + AAC rendition by hash. That output was checked packet-for-packet (`ffmpeg -c copy -f framehash`) against both the source streams and ffmpeg's own remux. A change to `mp4.ts` that moves the hash needs the same check before the hash is updated.
