import { render } from "preact";
import { ToastStack, type ToastKind } from "../../content/toasts/Toast";
import { createShadowMount, type ShadowMount } from "../../content/modals/mount";

export interface ToastService {
  /**
   * Shows a green success toast on the page. Auto-dismisses after ~4s
   * (PAC-3.3). Returns a dismiss function for early cancellation.
   *
   * @example
   * toastService.success("Downloaded alice-ABC.jpg");
   */
  success(message: string): () => void;

  /**
   * Shows a red failure toast on the page with the error message (PAC-3.2).
   *
   * @example
   * toastService.failure("Download failed: disk full");
   */
  failure(message: string): () => void;

  /**
   * Shows a neutral info toast — used for non-error user actions like a
   * cancelled download. Auto-dismisses after ~4s. Returns a dismiss function.
   *
   * @example
   * toastService.info("Download canceled");
   */
  info(message: string): () => void;

  /** Unmounts the stack and removes the shadow host. Idempotent. */
  dispose(): void;
}

export interface ToastServiceOptions {
  /** Factory for the shadow mount. Injected for tests. */
  mountFactory?: () => ShadowMount;
}

let idCounter = 0;
const nextId = () => `toast-${++idCounter}`;

/**
 * Creates a ToastService backed by a lazily-created shadow-DOM mount. The
 * mount is created on first toast and kept alive across subsequent toasts.
 */
export function createToastService(options: ToastServiceOptions = {}): ToastService {
  const mountFactory = options.mountFactory ?? createShadowMount;
  let mount: ShadowMount | null = null;
  let toasts: Array<{ id: string; kind: ToastKind; message: string }> = [];

  function ensureMount(): ShadowMount {
    if (!mount) mount = mountFactory();
    return mount;
  }

  function rerender(): void {
    if (!mount) return;
    if (toasts.length === 0) {
      // Unmount the component tree but keep the host around; next toast reuses it.
      mount.render(null);
      return;
    }
    mount.render(
      <ToastStack toasts={toasts} onDismiss={(id) => removeToast(id)} />,
    );
  }

  function removeToast(id: string): void {
    toasts = toasts.filter((t) => t.id !== id);
    rerender();
  }

  function push(kind: ToastKind, message: string): () => void {
    ensureMount();
    const id = nextId();
    toasts = [...toasts, { id, kind, message }];
    rerender();
    return () => removeToast(id);
  }

  return {
    success(message) {
      return push("success", message);
    },
    failure(message) {
      return push("failure", message);
    },
    info(message) {
      return push("info", message);
    },
    dispose() {
      toasts = [];
      if (mount) {
        mount.dispose();
        mount = null;
      }
    },
  };
}

// Re-export the Preact `render` so callers using dependency injection (tests)
// can build their own stack. Lint sees `render` as unused otherwise.
void render;
