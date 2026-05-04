import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { MOTION, TOKENS } from "../tokens";

export type ToastKind = "success" | "failure" | "info" | "loading";

const TOAST_ACCENT: Record<ToastKind, string> = {
  success: TOKENS.success,
  failure: TOKENS.failure,
  info: TOKENS.info,
  loading: TOKENS.info,
};

const TOAST_ICON: Record<Exclude<ToastKind, "loading">, string> = {
  success: "✓",
  failure: "✕",
  info: "i",
};

const TOAST_ROLE: Record<ToastKind, "status" | "alert"> = {
  success: "status",
  failure: "alert",
  info: "status",
  loading: "status",
};

export interface ToastProps {
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after this many ms. Defaults to 4000 (PAC-3.3). */
  durationMs?: number;
  onDismiss: () => void;
}

/**
 * Use `ToastService` to push toasts — don't mount `Toast` directly outside tests.
 * Each instance manages its own dismiss timer; no external tracking needed.
 */
export function Toast({ kind, message, durationMs = 4000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);
  // Guards so close-button, animationend, and the safety timeout don't double-fire.
  const firedRef = useRef(false);
  const safetyRef = useRef<number | null>(null);

  // Single dismiss path shared by close button and progress-bar animationend.
  function triggerDismiss() {
    if (firedRef.current) return;
    firedRef.current = true;
    if (safetyRef.current !== null) {
      window.clearTimeout(safetyRef.current);
      safetyRef.current = null;
    }
    setVisible(false);
    window.setTimeout(onDismiss, 200);
  }

  useEffect(() => {
    // Animate in on next frame so the transition runs.
    const raf = requestAnimationFrame(() => setVisible(true));
    // Loading toasts are dismissed programmatically — skip the auto-dismiss timers.
    if (!Number.isFinite(durationMs)) {
      return () => cancelAnimationFrame(raf);
    }
    // Safety fallback: if animationend never fires (e.g., JSDOM), still dismiss.
    safetyRef.current = window.setTimeout(() => {
      if (!firedRef.current) onDismiss();
    }, durationMs + 250);
    return () => {
      cancelAnimationFrame(raf);
      if (safetyRef.current !== null) window.clearTimeout(safetyRef.current);
    };
  }, [durationMs, onDismiss]);

  const accent = TOAST_ACCENT[kind];

  return (
    <div
      role={TOAST_ROLE[kind]}
      style={{
        position: "relative",
        minWidth: "240px",
        maxWidth: "360px",
        padding: "12px 16px",
        background: TOKENS.surface,
        color: TOKENS.fg,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 0,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "13px",
        lineHeight: "1.4",
        opacity: visible ? 1 : 0,
        transform: `translateY(${visible ? "0" : "8px"})`,
        transition: `opacity ${MOTION.focus}, transform ${MOTION.focus}`,
        pointerEvents: "auto",
      }}
    >
      <style>{`@keyframes igdl-spin{to{transform:rotate(360deg)}}@keyframes igdl-progress{from{width:100%}to{width:0%}}.igdl-close{transition:color ${MOTION.hover}}.igdl-close:hover{color:${TOKENS.fg}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {kind === "loading" ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            style={{
              width: "14px",
              height: "14px",
              flexShrink: 0,
              animation: "igdl-spin 0.7s linear infinite",
            }}
          >
            <circle cx="8" cy="8" r="5.5" stroke={TOKENS.muted} stroke-width="2.5" stroke-opacity="0.35" />
            <path d="M8 2.5 A5.5 5.5 0 0 1 13.5 8" stroke={accent} stroke-width="2.5" />
          </svg>
        ) : (
          <span style={{ color: accent, flexShrink: 0, fontSize: "16px", lineHeight: "1" }}>
            {TOAST_ICON[kind]}
          </span>
        )}
        <span style={{ flex: 1, wordBreak: "break-word" }}>{message}</span>
        <button
          class="igdl-close"
          aria-label="Dismiss notification"
          onClick={triggerDismiss}
          style={{
            background: "none",
            border: "none",
            color: TOKENS.muted,
            cursor: "pointer",
            padding: "2px 4px",
            flexShrink: 0,
            fontSize: "14px",
            lineHeight: "1",
            borderRadius: 0,
          }}
        >
          ✕
        </button>
      </div>
      {Number.isFinite(durationMs) && (
        <div
          aria-hidden="true"
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "3px" }}
        >
          <div
            style={{
              height: "100%",
              background: "#4a4a4a",
              animation: `igdl-progress ${durationMs}ms linear forwards`,
            }}
            onAnimationEnd={triggerDismiss}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Renders a vertical stack of toasts. Oldest appears at the top, newest at
 * the bottom. Each new toast triggers a spring-bump FLIP animation on the
 * toasts above it.
 */
export interface ToastStackProps {
  toasts: Array<{ id: string; kind: ToastKind; message: string }>;
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(toasts.length);

  useLayoutEffect(() => {
    const prev = prevLengthRef.current;
    prevLengthRef.current = toasts.length;
    if (toasts.length <= prev || !containerRef.current) return;

    const wrappers = Array.from(containerRef.current.children) as HTMLElement[];
    const existing = wrappers.slice(0, -1); // all except the newly appended last
    if (existing.length === 0) return;

    const shift = wrappers[wrappers.length - 1].getBoundingClientRect().height + 8;

    // FLIP: instantly snap existing wrappers back to their visual "before" position
    existing.forEach((el) => {
      el.style.transition = "none";
      el.style.transform = `translateY(${shift}px)`;
    });

    // Spring to natural position — brief overshoot gives the playful bump
    requestAnimationFrame(() => {
      existing.forEach((el) => {
        el.style.transition = "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)";
        el.style.transform = "translateY(0)";
      });
    });
  }, [toasts.length]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "360px",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id}>
          <Toast
            kind={t.kind}
            message={t.message}
            durationMs={t.kind === "loading" ? Infinity : undefined}
            onDismiss={() => onDismiss(t.id)}
          />
        </div>
      ))}
    </div>
  );
}
