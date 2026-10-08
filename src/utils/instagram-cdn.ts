/** Hosts Instagram serves media from: `scontent-*.cdninstagram.com`, `*.fbcdn.net`. */
const CDN_HOST = /\.(?:cdninstagram\.com|fbcdn\.net)$/;

/**
 * True for an HTTPS URL on one of Instagram's media CDN hosts, with no
 * embedded credentials. The VP9 path fetches stream URLs that originate in
 * page data, from the extension's own origin — this keeps that fetch pointed
 * at the CDN and nowhere else.
 *
 * The check parses the string as an absolute URL. A caller that goes on to
 * fetch it should fetch `new URL(value).href`, the form that was checked,
 * rather than the raw string: `https:host/path` is absolute here but relative
 * to an `https:` page.
 *
 * @example
 * isInstagramCdnUrl("https://scontent-lax3-1.cdninstagram.com/o1/v/t16/x.mp4"); // → true
 * isInstagramCdnUrl("https://example.com/x.mp4");                               // → false
 * isInstagramCdnUrl("http://scontent.cdninstagram.com/x.mp4");                  // → false
 */
export function isInstagramCdnUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== "" || url.password !== "") return false;
  return url.protocol === "https:" && CDN_HOST.test(url.hostname);
}
