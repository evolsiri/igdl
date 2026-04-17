import { handleThreadsPost } from "./post";

function findContainerNode(target: HTMLAnchorElement): HTMLElement | null {
  let node: HTMLElement | null = target.parentElement;
  while (node && node.getAttribute("data-pressable-container") !== "true") {
    node = node.parentElement;
  }
  return node;
}

export function handleThreadsButton(target: HTMLAnchorElement, saveAs = false): void {
  const action = saveAs ? "saveAs" : target.className.includes("download-btn") ? "download" : "open";
  const container = findContainerNode(target);
  if (container instanceof HTMLDivElement) {
    handleThreadsPost(container, action);
  }
}
