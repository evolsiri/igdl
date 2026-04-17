import { afterEach, describe, expect, it, vi } from "vitest";
import { createToastService } from "../toast";
import type { ShadowMount } from "../../../content/modals/mount";

function fakeMount(): ShadowMount {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.appendChild(container);
  const renderFn = vi.fn();
  return {
    host,
    shadow,
    render: (tree) => {
      renderFn(tree);
      // Replicate Preact's behavior only enough for test inspection.
    },
    dispose: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ToastService", () => {
  it("lazily creates the mount on first toast", () => {
    const factory = vi.fn(fakeMount);
    const service = createToastService({ mountFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    service.success("hello");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("reuses the mount across multiple toasts", () => {
    const factory = vi.fn(fakeMount);
    const service = createToastService({ mountFactory: factory });
    service.success("one");
    service.failure("two");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("dispose tears down the mount", () => {
    const mountInstance = fakeMount();
    const service = createToastService({ mountFactory: () => mountInstance });
    service.success("hello");
    service.dispose();
    expect(mountInstance.dispose).toHaveBeenCalled();
  });

  it("dispose is idempotent", () => {
    const service = createToastService({ mountFactory: fakeMount });
    service.dispose();
    expect(() => service.dispose()).not.toThrow();
  });

  it("returns a dismiss function for each toast", () => {
    const service = createToastService({ mountFactory: fakeMount });
    const dismiss = service.success("x");
    expect(typeof dismiss).toBe("function");
    dismiss();
  });
});
