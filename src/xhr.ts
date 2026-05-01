/**
 * Page-context XHR + fetch patcher. Exported as a function so tests can
 * assert patching behavior and endpoint parsing can be extended.
 *
 * Runs in the page's MAIN world (Chrome via content_scripts world:"MAIN";
 * Firefox via <script> tag injection from content/loader.ts). Never touches
 * chrome.* APIs — those aren't available here.
 */

export interface XhrSnapshot {
  endpoint: string;
  body: unknown;
}

export interface XhrInterceptorOptions {
  onSnapshot: (snapshot: XhrSnapshot) => void;
  /** Predicate to filter which requests we capture. Default: any URL. */
  shouldCapture?: (endpoint: string, contentType: string) => boolean;
}

const GLOBAL_SENTINEL = "__igdl_xhr_installed__";

/**
 * Monkey-patches XMLHttpRequest.open/send and window.fetch on the current
 * global. Idempotent — safe to call multiple times.
 */
export function installXhrInterceptor(options: XhrInterceptorOptions): void {
  const w = globalThis as unknown as Record<string, unknown>;
  if (w[GLOBAL_SENTINEL]) return;
  w[GLOBAL_SENTINEL] = true;

  const shouldCapture = options.shouldCapture ?? defaultShouldCapture;
  patchXhr(options.onSnapshot, shouldCapture);
  patchFetch(options.onSnapshot, shouldCapture);
}

function defaultShouldCapture(_endpoint: string, contentType: string): boolean {
  return contentType.includes("application/json");
}

function patchXhr(
  onSnapshot: (s: XhrSnapshot) => void,
  shouldCapture: (endpoint: string, contentType: string) => boolean,
): void {
  const Original = (
    globalThis as unknown as { XMLHttpRequest?: typeof XMLHttpRequest }
  ).XMLHttpRequest;
  if (!Original) return;

  const originalOpen = Original.prototype.open;
  const originalSend = Original.prototype.send;

  Original.prototype.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    user?: string | null,
    password?: string | null,
  ): void {
    (this as unknown as { __igdlUrl?: string }).__igdlUrl =
      typeof url === "string" ? url : url.href;
    return originalOpen.call(
      this,
      method,
      url as string,
      async ?? true,
      user ?? null,
      password ?? null,
    );
  } as typeof Original.prototype.open;

  Original.prototype.send = function patchedSend(
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const url = (this as unknown as { __igdlUrl?: string }).__igdlUrl;
    if (url) {
      this.addEventListener("load", () => {
        try {
          const contentType = this.getResponseHeader("content-type") ?? "";
          if (!shouldCapture(url, contentType)) return;
          const parsed = JSON.parse(this.responseText);
          onSnapshot({ endpoint: url, body: parsed });
        } catch {
          /* swallow — page scripts must never see our errors */
        }
      });
    }
    return originalSend.call(this, body as XMLHttpRequestBodyInit);
  } as typeof Original.prototype.send;
}

function patchFetch(
  onSnapshot: (s: XhrSnapshot) => void,
  shouldCapture: (endpoint: string, contentType: string) => boolean,
): void {
  const originalFetch = (globalThis as unknown as { fetch?: typeof fetch })
    .fetch;
  if (!originalFetch) return;

  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const response = await originalFetch.call(
        globalThis,
        input as RequestInfo,
        init,
      );
      try {
        const endpoint = resolveEndpoint(input, response);
        const contentType = response.headers.get("content-type") ?? "";
        if (!shouldCapture(endpoint, contentType)) return response;
        const cloned = response.clone();
        // Fire-and-forget — don't await; don't let our work delay the caller.
        cloned.json().then(
          (body) => onSnapshot({ endpoint, body }),
          () => {
            /* swallow */
          },
        );
      } catch {
        /* swallow */
      }
      return response;
    };
}

function resolveEndpoint(input: RequestInfo | URL, response: Response): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return response.url;
}
