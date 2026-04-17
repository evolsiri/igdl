/**
 * DOM ancestor walkers ported from the reference extension's
 * `src/content/utils/dom.ts`. Used by handlers to find the `<article>` or
 * `<section>` that owns the clicked download button.
 */

export function getParentArticleNode(node: HTMLElement | null): HTMLElement | null {
  if (node === null) return null;
  if (node.tagName === "ARTICLE") return node;
  return getParentArticleNode(node.parentElement);
}

export function getParentSectionNode(node: HTMLElement | null): HTMLElement | null {
  if (node === null) return null;
  if (node.tagName === "SECTION") return node;
  return getParentSectionNode(node.parentElement);
}
