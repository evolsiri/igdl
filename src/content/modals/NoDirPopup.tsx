import { useEffect, useRef, useState } from "preact/hooks";
import { MOTION, TOKENS } from "../tokens";

export type NoDirAction =
  | { kind: "setDirectory"; directory: string }
  | { kind: "default" }
  | { kind: "neverAsk" };

export interface NoDirPopupProps {
  username: string;
  /** Pre-populates the "Set directory" input (typically `<prefix>/`). */
  initialDirectory: string;
  defaultDirectory: string;
  onChoice: (action: NoDirAction) => void;
  onCancel: () => void;
}

/**
 * On-page popup shown when the user clicks the download button on a profile
 * that has no configured directory AND isn't on the never-ask list
 * (PAC-2.4). Presents exactly three buttons per PAC-2.5 / 2.6 / 2.7.
 */
export function NoDirPopup({
  username,
  initialDirectory,
  defaultDirectory,
  onChoice,
  onCancel,
}: NoDirPopupProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialDirectory);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape" || e.key === "Backspace") onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  function submit(): void {
    const value = draft.trim();
    if (!value) return;
    onChoice({ kind: "setDirectory", directory: value });
  }

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-labelledby="igdl-no-dir-title" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={panel}>
        <button type="button" aria-label="Close" onClick={onCancel} style={closeButton}>×</button>
        <h2 id="igdl-no-dir-title" style={title}>
          Download from @{username}?
        </h2>
        <p style={body}>
          No directory set for this profile yet.
        </p>

        {editing ? (
          <form
            style={editRow}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // Window-level Escape listener can't fire once the shadow
                  // host guard stops propagation, so handle it here too.
                  e.preventDefault();
                  onCancel();
                }
              }}
              placeholder={`${initialDirectory}${username}`}
              style={input}
            />
            <div style={btnRow}>
              <button type="button" onClick={() => setEditing(false)} style={btnGhost}>
                Back
              </button>
              <button type="submit" style={btnPrimary}>
                Save &amp; download
              </button>
            </div>
          </form>
        ) : (
          <div style={choiceColumn}>
            <button type="button" onClick={() => setEditing(true)} style={btnPrimary}>
              Set directory for @{username}
            </button>
            <button
              type="button"
              onClick={() => onChoice({ kind: "default" })}
              style={btnGhostRow}
            >
              <span style={btnTextCell}>
                Download to{" "}
                <code style={code}>{defaultDirectory || "(browser default)"}</code>
              </span>
              <InfoGlyphSpan
                testId="info-tooltip-default"
                text={`Saves to the default directory. Change it under Settings → Downloads.`}
              />
            </button>
            <button
              type="button"
              onClick={() => onChoice({ kind: "neverAsk" })}
              style={btnGhostRow}
            >
              <span style={btnTextCell}>Never ask for @{username}</span>
              <InfoGlyphSpan
                testId="info-tooltip-neverask"
                text={`Adds @${username} to the never-ask list. Future downloads from this profile go straight to the default directory. Remove them under Settings → Never-Ask Profiles to bring this popup back.`}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const backdrop: preact.JSX.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.5)",
  backdropFilter: "blur(2px)",
  pointerEvents: "auto",
};

const panel: preact.JSX.CSSProperties = {
  position: "relative",
  background: TOKENS.surface,
  color: TOKENS.fg,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 0,
  padding: "20px 22px",
  minWidth: "380px",
  maxWidth: "460px",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

const title: preact.JSX.CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: "16px",
  fontWeight: 600,
};

const body: preact.JSX.CSSProperties = {
  margin: "0 0 16px 0",
  fontSize: "13px",
  color: TOKENS.muted,
  lineHeight: 1.45,
};

const choiceColumn: preact.JSX.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const btnBase: preact.JSX.CSSProperties = {
  padding: "10px 14px",
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 0,
  fontSize: "13px",
  fontWeight: 500,
  textAlign: "left",
  cursor: "pointer",
  transition: `background-color ${MOTION.hover}, color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.hover}`,
  fontFamily: "inherit",
};

const btnPrimary: preact.JSX.CSSProperties = {
  ...btnBase,
  background: TOKENS.accent,
  color: TOKENS.accentContrast,
  borderColor: TOKENS.accent,
};

const btnGhost: preact.JSX.CSSProperties = {
  ...btnBase,
  background: TOKENS.bg,
  color: TOKENS.fg,
};

const editRow: preact.JSX.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const input: preact.JSX.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 0,
  background: TOKENS.bg,
  color: TOKENS.fg,
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

const btnRow: preact.JSX.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
};

const closeButton: preact.JSX.CSSProperties = {
  position: "absolute",
  top: "8px",
  right: "8px",
  width: "28px",
  height: "28px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  background: "transparent",
  color: TOKENS.muted,
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: "20px",
  lineHeight: 1,
  fontFamily: "inherit",
  transition: `color ${MOTION.hover}, background-color ${MOTION.hover}, transform ${MOTION.hover}`,
};

const code: preact.JSX.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: "12px",
  background: TOKENS.bg,
  padding: "1px 4px",
  border: `1px solid ${TOKENS.border}`,
  color: TOKENS.fg,
};

const btnGhostRow: preact.JSX.CSSProperties = {
  ...btnBase,
  background: TOKENS.bg,
  color: TOKENS.fg,
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const btnTextCell: preact.JSX.CSSProperties = {
  flex: 1,
  minWidth: 0,
  textAlign: "left",
};

// Subtle grey for decorative info glyphs — darker / dimmer than TOKENS.muted
// so the icon reads as secondary on the dark panel.
const INFO_ICON_COLOR = "#7a7a7a";
const INFO_ICON_COLOR_HOVER = TOKENS.fg;

const infoGlyphWrap: preact.JSX.CSSProperties = {
  position: "relative",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginLeft: "auto",
  color: INFO_ICON_COLOR,
  cursor: "help",
  transition: `color ${MOTION.hover}`,
};

const tooltipBox: preact.JSX.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "calc(100% + 10px)",
  minWidth: "220px",
  maxWidth: "300px",
  padding: "10px 12px",
  background: TOKENS.surface,
  color: TOKENS.fg,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 0,
  fontSize: "14px",
  lineHeight: 1.5,
  textAlign: "left",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
  zIndex: 2,
  pointerEvents: "none",
  whiteSpace: "normal",
  fontWeight: 400,
};

interface InfoGlyphSpanProps {
  text: string;
  testId: string;
}

/**
 * Non-focusable, hover-activated info glyph that lives *inside* an action
 * button. Clicking the glyph bubbles to the outer button (consistent with
 * "inside the button" visual); hovering surfaces a tooltip to the right.
 * aria-hidden prevents the glyph's tooltip text from polluting the parent
 * button's accessible name.
 */
function InfoGlyphSpan({ text, testId }: InfoGlyphSpanProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      style={{
        ...infoGlyphWrap,
        color: visible ? INFO_ICON_COLOR_HOVER : INFO_ICON_COLOR,
      }}
    >
      <InfoGlyph style={{ color: "currentColor" }} />
      <span
        role="tooltip"
        style={{
          ...tooltipBox,
          opacity: visible ? 1 : 0,
          transform: `translateY(-50%) translateX(${visible ? "0" : "-4px"})`,
          transition: `opacity ${MOTION.focus}, transform ${MOTION.focus}`,
          visibility: visible ? "visible" : "hidden",
        }}
      >
        {text}
      </span>
    </span>
  );
}

function InfoGlyph({ style }: { style?: preact.JSX.CSSProperties }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      style={style}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" />
    </svg>
  );
}
