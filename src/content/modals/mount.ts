import { render, type ComponentChildren } from "preact";

/**
 * Creates an isolated mount point for a Preact tree rendered inside a Shadow
 * DOM attached to the page. Used for every modal and toast the content script
 * injects, per TAC-4.2 (Shadow DOM isolation — no Instagram CSS in, no Tailwind
 * styles out).
 *
 * Injected UI uses inline styles sourced from `tokens.ts` rather than Tailwind
 * utility classes, so there's no CSS file to inject into the shadow root.
 *
 * @example
 * const mount = createShadowMount();
 * mount.render(<NoDirPopup ... />);
 * // later
 * mount.dispose();
 */
export interface ShadowMount {
  host: HTMLElement;
  shadow: ShadowRoot;
  /** Renders or re-renders a Preact tree into the shadow root's container. */
  render(tree: ComponentChildren): void;
  /** Unmounts the tree and removes the host element from the document. */
  dispose(): void;
}

export function createShadowMount(): ShadowMount {
  const host = document.createElement("div");
  host.setAttribute("data-igdl-shadow", "");
  // Fixed-position overlay that covers the viewport but doesn't intercept
  // clicks until the rendered tree opts in.
  host.style.cssText = [
    "position: fixed",
    "inset: 0",
    "z-index: 2147483647",
    "pointer-events: none",
  ].join(";");

  (document.documentElement || document.body).appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  container.style.cssText = "pointer-events: auto;";
  shadow.appendChild(container);

  // Keyboard guard — when focus is inside an input or textarea within this
  // shadow root, stop key events from reaching Instagram's global shortcut
  // listeners. Two listeners are needed because Instagram registers some
  // shortcuts (e.g., `n` for new post, arrow keys for story navigation)
  // during the **capture phase** at or near the window level, and others
  // (e.g., `k` / `j` / `l` / `m`) during the **bubble phase** at the document
  // level. One listener per phase covers both.
  //
  // Window-capture stops descent through the light DOM capture phase before
  // it reaches Instagram's capture listeners below window. Target phase still
  // fires on the input, so character insertion, Escape, and Enter all work.
  // The host-bubble listener is defense-in-depth for any same-element capture
  // handlers on window that register after ours (rare, but free to cover).
  const keyboardGuard = (event: KeyboardEvent): void => {
    const active = shadow.activeElement;
    const focusedOnInput =
      active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    if (!focusedOnInput) return;
    // Only intercept events that actually traverse this shadow mount — other
    // ShadowMount instances should manage their own.
    if (!event.composedPath().includes(host)) return;
    event.stopPropagation();
  };

  window.addEventListener("keydown", keyboardGuard, true);
  window.addEventListener("keyup", keyboardGuard, true);
  window.addEventListener("keypress", keyboardGuard, true);
  host.addEventListener("keydown", keyboardGuard);
  host.addEventListener("keyup", keyboardGuard);
  host.addEventListener("keypress", keyboardGuard);

  function renderTree(tree: ComponentChildren): void {
    render(tree, container);
  }

  function dispose(): void {
    render(null, container);
    window.removeEventListener("keydown", keyboardGuard, true);
    window.removeEventListener("keyup", keyboardGuard, true);
    window.removeEventListener("keypress", keyboardGuard, true);
    host.remove();
  }

  return {
    host,
    shadow,
    render: renderTree,
    dispose,
  };
}
