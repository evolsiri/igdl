import { downloadViaFlow, reportFailure } from "../downloadBridge";
import { openInNewTab } from "../extractors/fn";

export async function profileOnClicked(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  try {
    const localCache = (await chrome.storage.local.get(["user_profile_pic_url"])) as {
      user_profile_pic_url?: Array<[string, string]>;
    };
    const data = new Map(localCache.user_profile_pic_url || []);
    const arr = window.location.pathname.split("/").filter((e) => e);
    const username =
      arr.length === 1 ? arr[0] : document.querySelector("main header h2")?.textContent || "";
    const url =
      data.get(username) ||
      document.querySelector("header img")?.getAttribute("src") ||
      undefined;
    if (typeof url !== "string") return;

    if (target.className.includes("download-btn") || saveAs) {
      await downloadViaFlow({ url, id: username, username, type: "post" }, saveAs);
    } else {
      openInNewTab(url);
    }
  } catch (err) {
    console.warn("[igdl] profileOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "avatar download failed");
  }
}
