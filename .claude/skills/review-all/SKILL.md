---
name: review-all
description: >
  Run the canonical reviewer fan-out on the current branch's diff. Launches
  code-reviewer, ux-reviewer, documentation-reviewer, and extension-auditor in
  parallel; conditionally adds instagram-dom-engineer when src/content/ is
  touched, storybook-curator when UI components or *.stories.tsx are touched,
  and claude-config-reviewer when .claude/ or CLAUDE.md is touched. Use when
  the user says "run all reviewers", "review the branch", "ship check", or
  invokes /review-all. Use before any non-trivial merge.
---

# /review-all

Compose the project's reviewer fan-out per `.claude/agents/README.md` (the
codeowners README defines the dispatch logic — read it before deviating).

## Step 1 — Determine touched paths

Run `git diff main...HEAD --name-only`. The set of touched paths drives which
agents fire.

## Step 2 — Launch the four base reviewers in parallel

In a single message with multiple Agent tool calls, dispatch all of:

- `code-reviewer` — final merge gate, igdl invariants, five-axis review.
- `ux-reviewer` — visual / interaction / design-system parity.
- `documentation-reviewer` — docs coverage, TSDoc, factual cross-check, API
  ripple.
- `extension-auditor` — MV3 manifest, SW lifecycle, Chrome/Firefox parity.

Each agent gets the diff context it needs (the file list, or a short
summary). Don't sequence them — parallelism is the entire point.

## Step 3 — Conditional additions, same parallel message

- Add `instagram-dom-engineer` if any of: `src/content/**`, `src/inject.ts`,
  `src/xhr.ts`.
- Add `storybook-curator` if any of: `src/options/components/**`,
  `src/content/{modals,toasts}/**`, or any `*.stories.tsx`.
- Add `claude-config-reviewer` if any of: `.claude/**`, `CLAUDE.md`.

These don't replace the base four — they join them.

## Step 4 — Surface results

Once all reviewers return, present their findings as a flat list grouped by
**Critical / Important / Suggestion**. Cite as `agent → file:line`. Don't
summarize an agent's output if it had no findings — just say so in one line.

## Step 5 — Merge gate

`code-reviewer` is the final gate. If any reviewer surfaced **Critical**
findings, the merge is blocked. Surface this explicitly in your output.
Specialist Critical findings become Critical in `code-reviewer`'s summary —
do not mark the branch ready to merge until those are resolved.

## Boundaries

- This skill orchestrates; it doesn't review on its own. Don't substitute
  your own judgement for an agent's output.
- If the diff is trivial (typo, single-line fix, README polish), the user
  may invoke `code-reviewer` alone instead — `/review-all` is for non-trivial
  diffs.
- External-plugin agents (`voltagent-qa-sec:*`, `chrome-devtools-mcp:*`)
  are not part of the default fan-out. The base agents recommend escalating
  to them in their `Escalation` sections; if a base agent surfaces a deep
  WCAG / threat-model / runtime-perf concern, dispatch the external agent
  separately on the relevant subset of the diff.
