# Agent codeowners

Canonical map of which agent owns which paths in the `igdl` repo, and how reviews compose. The eight agents in `.claude/agents/*.md` carry their own briefs and escalation rules; this file is the bird's-eye view that a contributor (or any agent) can open to answer **"who has to APPROVE a diff to this path?"**

This file is canonical. Per-agent `## Codeownership` sections are local restatements; if the two ever disagree, this file wins. [`claude-config-reviewer`](./claude-config-reviewer.md) audits drift between the two on every change to `.claude/` (see its "Cross-artifact consistency" check).

## What this is not

- **Not a `.github/CODEOWNERS` file.** GitHub doesn't auto-request reviewers from this map. It's the project's agent equivalent.
- **Not the runtime/code ownership of ambient APIs.** "Storage is owned by `src/services/settings/storage.ts`" lives in [`CLAUDE.md`](../../CLAUDE.md) under "Hard rules" and [`docs/code-style-guide.md`](../../docs/code-style-guide.md) under "Single-owner ambient APIs". Those describe which **module** owns a runtime API. This file describes which **agent** approves a diff. Don't conflate them.

## Agent roster

| Agent | Purpose | Mode | Model |
| --- | --- | --- | --- |
| [`code-reviewer`](./code-reviewer.md) | Five-axis review + igdl invariants. Final merge gate. | review | (default) |
| [`ux-reviewer`](./ux-reviewer.md) | Visual / interaction / design-system parity. | review | (default) |
| [`documentation-reviewer`](./documentation-reviewer.md) | Docs coverage + TSDoc contract. | review | (default) |
| [`extension-auditor`](./extension-auditor.md) | MV3 manifest, SW lifecycle, Chrome/Firefox parity. | review | (default) |
| [`instagram-dom-engineer`](./instagram-dom-engineer.md) | Selector / parent-walk / XHR-bridge fixes. | implement + review | (default) |
| [`service-implementer`](./service-implementer.md) | Scaffold a new service or component. | implement | (default) |
| [`release-engineer`](./release-engineer.md) | Release scripts, version sync, CI workflow. | implement + review | (default) |
| [`claude-config-reviewer`](./claude-config-reviewer.md) | Audits `.claude/` and `CLAUDE.md` for drift. | review (read-only) | sonnet |

## Path → agent table

| Path | Final approver | Co-owner | Notes |
| --- | --- | --- | --- |
| `src/manifest/**` | `extension-auditor` | — | Manifest parity Chrome ↔ Firefox |
| `src/background/**` | `extension-auditor` | — | SW lifecycle, message routing |
| `src/utils/messages.ts` | `extension-auditor` | — | Typed message sender |
| `src/utils/browser.ts` | `extension-auditor` | — | The only `chrome` ↔ `browser` bridge |
| `src/types/messages.ts` | `extension-auditor` | — | Cross-context message discriminated union |
| `src/content/index.ts` | `instagram-dom-engineer` | — | Polling loop, per-route dispatch |
| `src/content/handlers/**` | `instagram-dom-engineer` | — | Per-surface handlers (post, reels, stories, …) |
| `src/content/extractors/**` | `instagram-dom-engineer` | — | API response parsing |
| `src/content/threads/**` | `instagram-dom-engineer` | — | Threads pagelet detection |
| `src/content/selectors.ts` | `instagram-dom-engineer` | — | Centralized SVG path selectors |
| `src/content/button.ts` | `instagram-dom-engineer` | `ux-reviewer` | DOM + click vs visual surface; **both** must APPROVE |
| `src/content/modals/**` | `ux-reviewer` | `documentation-reviewer` (TSDoc block) | Injected modals (Shadow DOM) |
| `src/content/toasts/**` | `ux-reviewer` | `documentation-reviewer` (TSDoc block) | Injected toasts (Shadow DOM) |
| `src/content/tokens.ts` | `ux-reviewer` | — | Injected-UI design tokens |
| `src/options/components/cards/**` | `ux-reviewer` | `documentation-reviewer` (TSDoc block) | Options-page cards (Tailwind) |
| `src/options/components/modals/**` | `ux-reviewer` | `documentation-reviewer` (TSDoc block) | Options-page modals (Tailwind) |
| `src/index.css` | `ux-reviewer` | — | Options-page tokens + global zero-radius reset |
| `src/stories/DesignSystem.stories.tsx` | `ux-reviewer` | — | Design-system source of truth |
| `src/inject.ts` | `instagram-dom-engineer` | — | MAIN-world XHR / fetch interception |
| `src/xhr.ts` | `instagram-dom-engineer` | — | XHR snapshot bridge |
| `src/services/**` | `code-reviewer` | `documentation-reviewer` (TSDoc) | Scaffolded by `service-implementer`; each has a `docs/services/<name>.md` |
| `docs/services/**` | `documentation-reviewer` | — | 1:1 with `src/services/` |
| `docs/architecture.md` (MV3 lifecycle + Storage contract sections) | `extension-auditor` | `documentation-reviewer` (rest of file) | Section-level co-ownership |
| `docs/architecture.md` (everything else) | `documentation-reviewer` | — | |
| `docs/build-and-release.md` (release-flow sections) | `release-engineer` | `documentation-reviewer` (rest) | |
| `docs/build-and-release.md` (everything else) | `documentation-reviewer` | — | |
| `docs/**` (everything else) | `documentation-reviewer` | — | Indexes, code-style, content-script, download-flow, design-system, development, project-readme |
| `README.md` | `documentation-reviewer` (read-only auditor) | — | Voice + scope per [`docs/project-readme.md`](../../docs/project-readme.md). `documentation-reviewer` flags gaps; the main session writes prose. |
| `package.json` (`version` field) | `release-engineer` | — | Synced to both manifests by `scripts/build.mjs` and `scripts/rc-firefox.mjs` |
| `scripts/**` | `release-engineer` | `code-reviewer` (on script refactors) | Build, package, sign, release |
| `.github/workflows/**` | `release-engineer` | — | Only release.yml exists today |
| `web-ext.config.mjs` | `release-engineer` | — | Read by every `web-ext` invocation |
| `.claude/**` | `claude-config-reviewer` (read-only) | — | Audits agents, rules, hooks, settings, skills |
| `CLAUDE.md` | `claude-config-reviewer` (read-only) | — | Audits for path drift, contradictions, stale refs |

### Co-ownership rule

A diff that touches a co-owned path needs **both** agents to APPROVE before `code-reviewer` will merge. Co-ownership comes in two shapes:

**Surface co-ownership** — the two agents own different surfaces of the same file:

- `src/content/button.ts` — `instagram-dom-engineer` owns DOM injection + click delegation; `ux-reviewer` owns the visual surface (fill, border, hover, focus, icon glyph).
- `docs/architecture.md` — `extension-auditor` owns the MV3-lifecycle and Storage-contract sections; `documentation-reviewer` owns the rest of the file.
- `docs/build-and-release.md` — `release-engineer` owns the release-flow sections; `documentation-reviewer` owns the rest.

**TSDoc co-ownership** — `documentation-reviewer` is the final approver of TSDoc blocks, while another agent is the final approver of the file's code:

- `src/services/**` — `code-reviewer` owns the service code; `documentation-reviewer` owns the TSDoc on every exported symbol (with `@example`) and the matching `docs/services/<name>.md`.
- `src/content/{modals,toasts}/**` and `src/options/components/{cards,modals}/**` — `ux-reviewer` owns the component code; `documentation-reviewer` owns the TSDoc-style doc block above each `function ComponentName(...)` declaration.

### Read-only owners

`documentation-reviewer` for `README.md` and `claude-config-reviewer` for `.claude/**` + `CLAUDE.md` are **read-only auditors**. They flag findings and block merge on Critical issues, but they don't write the fix — the file's author or the main session does.

## Merge-gate hierarchy

`code-reviewer` is the final merge gate for any non-trivial diff. Specialist verdicts feed into it; `code-reviewer` does not approve while any specialist has open Critical findings.

```mermaid
flowchart BT
    ux["ux-reviewer<br/>visual / tokens / design-system"]
    ext["extension-auditor<br/>MV3 / SW / parity / message bus"]
    docs["documentation-reviewer<br/>docs / TSDoc / indexes"]
    dom["instagram-dom-engineer<br/>selectors / XHR bridge / DOM walks"]
    cfg["claude-config-reviewer<br/>.claude/ + CLAUDE drift"]
    cr["code-reviewer<br/>final merge gate"]

    ux --> cr
    ext --> cr
    docs --> cr
    dom --> cr
    cfg --> cr
```

On a non-trivial diff, run the relevant specialists in parallel (single message, multiple tool calls), then `code-reviewer`. On a release-candidate diff, run `code-reviewer` + `ux-reviewer` + `documentation-reviewer` + `extension-auditor` in parallel — a release passes all four (see `extension-auditor.md` "Rules").

## Hand-off graph

Each arrow means "agent A explicitly recommends escalating to agent B in its `## Escalation` section."

```
code-reviewer            → ux-reviewer, documentation-reviewer, extension-auditor,
                           instagram-dom-engineer, accessibility-tester, security-auditor,
                           chrome-devtools

ux-reviewer              → code-reviewer, documentation-reviewer, extension-auditor,
                           accessibility-tester, chrome-devtools

documentation-reviewer   → code-reviewer, ux-reviewer, extension-auditor

extension-auditor        → code-reviewer, ux-reviewer, documentation-reviewer,
                           security-auditor, chrome-devtools, instagram-dom-engineer

instagram-dom-engineer   → extension-auditor, ux-reviewer, code-reviewer,
                           documentation-reviewer

service-implementer      → code-reviewer, documentation-reviewer (always),
                           ux-reviewer (UI work), extension-auditor (background-touching)

release-engineer         → extension-auditor, code-reviewer

claude-config-reviewer   → file's original author for fixes; tooling-gap findings
                           feed code-reviewer
```

`service-implementer` and `release-engineer` are the only "implement" agents on this list; everything else is review (or, for `instagram-dom-engineer`, both — it edits the brittle DOM/selector layer it owns).

## Concern → agent table

For the concern-keyed summary (which agent handles which kind of work), see [`CLAUDE.md`](../../CLAUDE.md) "Subagent routing". This README owns the path-keyed map above; `CLAUDE.md` owns the concern-keyed one.

## Dev workflow

Before merging any change to `.claude/` or `CLAUDE.md`, run `claude-config-reviewer` to catch path drift, broken cross-references, stale tool fields, and contradictions between this README and the per-agent files. It is read-only — findings come back as Blocking / Suggestion, and the file's author makes the fix.

For ordinary code diffs, the four reviewers compose: on a non-trivial diff, run `code-reviewer`, `ux-reviewer`, `documentation-reviewer`, and `extension-auditor` in parallel. The hand-off graph above resolves any specialist that needs to fan out further.
