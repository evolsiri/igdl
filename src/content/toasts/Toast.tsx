import { useEffect, useState } from "preact/hooks";
import { MOTION, TOKENS } from "../tokens";

export type ToastKind = "success" | "failure" | "info";

const TOAST_ACCENT: Record<ToastKind, string> = {
  success: TOKENS.success,
  failure: TOKENS.failure,
  info: TOKENS.info,
};

const TOAST_ICON: Record<ToastKind, string> = {
  success: "✓",
  failure: "✕",
  info: "i",
};

const TOAST_ROLE: Record<ToastKind, "status" | "alert"> = {
  success: "status",
  failure: "alert",
  info: "status",
};

export interface ToastProps {
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after this many ms. Defaults to 4000 (PAC-3.3). */
  durationMs?: number;
  onDismiss: () => void;
}

export function Toast({ kind, message, durationMs = 4000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in on next frame so the transition runs.
    const raf = requestAnimationFrame(() => setVisible(true));
    const fade = window.setTimeout(() => setVisible(false), durationMs);
    const remove = window.setTimeout(onDismiss, durationMs + 200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, [durationMs, onDismiss]);

  const accent = TOAST_ACCENT[kind];

  return (
    <div
      role={TOAST_ROLE[kind]}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
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
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ color: accent, flexShrink: 0, fontSize: "16px", lineHeight: "1" }}>
          {TOAST_ICON[kind]}
        </span>
        <span style={{ flex: 1, wordBreak: "break-word" }}>{message}</span>
      </div>
    </div>
  );
}

/**
 * Renders a vertical stack of toasts. Newer toasts appear at the bottom and
 * push older ones upward — stacking matches PAC-3.3's "stack gracefully".
 */
export interface ToastStackProps {
  toasts: Array<{ id: string; kind: ToastKind; message: string }>;
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        display: "flex",
        flexDirection: "column-reverse",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t, i) => (
        <div
          key={t.id}
          style={{
            position: "relative",
            bottom: `${i * 4}px`,
            right: 0,
          }}
        >
          <Toast
            kind={t.kind}
            message={t.message}
            onDismiss={() => onDismiss(t.id)}
          />
        </div>
      ))}
    </div>
  );
}
