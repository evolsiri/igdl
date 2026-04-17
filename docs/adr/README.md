# Architecture Decision Records

Short, append-only records of load-bearing decisions. ADRs capture **why**, not the current **what** — for that, read `architecture.md` and the service/component docs.

## Convention

We use a MADR-lite template. Each ADR is a single markdown file named `NNNN-kebab-title.md` where `NNNN` is a zero-padded sequential number.

Structure:

```markdown
# NNNN — Title

- Status: accepted | superseded | deprecated
- Date: YYYY-MM-DD
- Supersedes: ADR #___ (optional)
- Superseded by: ADR #___ (optional)

## Context

What prompted this decision? What constraints applied? What was the alternative reality look like?

## Decision

What we chose. Prefer present tense — "We mount every injected UI in a Shadow DOM."

## Consequences

What this unlocks, what it costs, and what other code now depends on it.
```

Keep them short — 30 to 80 lines. The goal is a searchable decision log, not an essay. When a decision changes, write a new ADR that supersedes the old one; don't edit history.

## Active ADRs

| #    | Title                                                                              | Status   |
| ---- | ---------------------------------------------------------------------------------- | -------- |
| 0001 | [Zero border-radius across all extension UI](./0001-zero-border-radius.md)         | accepted |
| 0002 | [Shadow DOM isolation for all injected UI](./0002-shadow-dom-isolation.md)         | accepted |
| 0003 | [Page-world XHR / fetch patching](./0003-xhr-main-world-patching.md)               | accepted |
| 0004 | [Service-owner pattern (one ambient API, one owner)](./0004-service-owner-pattern.md) | accepted |
| 0005 | [Co-located tests and stories](./0005-co-located-tests-and-stories.md)             | accepted |
| 0006 | [Two manifests in lockstep (Chrome + Firefox)](./0006-manifest-lockstep-chrome-firefox.md) | accepted |

## When to write a new ADR

Write one when you make a choice that:

- Is visible in the code structure (affects file layout, ownership, or module boundaries).
- Has non-obvious tradeoffs (future-me will ask "why did we do this?").
- Would be hard to reverse later.
- Involves a third-party tool, library, or protocol pattern you had to evaluate.

Skip it for routine implementation choices with a clear "best way" — those belong in TSDoc or a regular doc.
