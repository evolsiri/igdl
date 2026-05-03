# Project README — Voice & Scope

## 1. Scope

This file governs the **top-level `/README.md` only.** Not `docs/README.md`, not per-service docs, not component doc-blocks. The project README is the product's storefront on GitHub — a potential user reads it for under thirty seconds before deciding whether to install. It is not a manual, not an architecture overview, and not a place for contributor instructions.

This rule covers **voice, audience, and what belongs where.** Accuracy of links, structural index sync between `/README.md` and `docs/README.md`, and TSDoc coverage are owned by `documentation-reviewer`. Code review, UX review, and manifest review own their own surfaces.

Every agent that edits `/README.md` applies this rule. There is no separate "project-readme" subagent — the rule travels with `CLAUDE.md`.

## 2. Audience

The reader is **a potential user evaluating whether to install the extension.** They:

- Found the repo via a search, a link, or word of mouth.
- Are reading on GitHub on a phone or a laptop, in a hurry.
- May or may not be technical — but right now they are wearing a *user* hat, not a developer hat.
- Have not installed the extension yet and may not know what an Instagram-content downloader extension is or why they would want one.
- Care about: what it does, what it looks like, how to install it, whether it is safe.

The reader is **not** a contributor, not a reviewer, not the extension author six months from now trying to remember how the build works. Those readers go to `docs/`.

## 3. Voice

- **Plain English.** Second person, active voice. "Grab the latest release" — not "users may obtain releases".
- **Concrete UI nouns.** Say *posts, reels, stories, highlights, carousels* — not "media items", "content", "assets".
- **Friendly but not chatty.** No hedging, no winks at the reader, no "let's dive in".
- **No marketing superlatives.** Banned: *powerful, seamless, blazing fast, lightning fast, industry-leading, revolutionary, next-generation, robust, elegant.*
- **No emoji** except where the OS or UI literally renders one inside an install step (the Firefox add-ons gear `⚙` is the canonical case).
- **Short sentences.** If a sentence has two commas and an "and", split it.
- **Verbs over adjectives.** A README earns trust by saying what the product *does*, not by saying what it *is like*.

## 4. What belongs in the README

A short, fixed shape:

- **Logo** + a one-line description of what the extension does.
- **A visual** (currently `docs/instagram_post_mockup.svg`) showing the buttons in context.
- **Feature list** in user terms, ≤ 5 bullets, written as things the user can do.
- **Install / sideload steps** — one block per browser, ≤ 4 steps each, written for a non-technical reader.
- **One link to `docs/development.md`** for contributors. Just the link, not a section.
- **Credits** — fork attribution, upstream link.
- **License.**

That is the whole shape. New content has to displace existing content; the README does not grow.

## 5. What does NOT belong in the README

- Architecture, internals, "how it works under the hood".
- Build, dev-server, or test commands. Anything that starts with `pnpm`. Those go in `docs/development.md`.
- TSDoc rules, lint rules, code style, naming conventions.
- Per-service contracts (those live in `docs/services/`).
- Manifest details, browser-extension lifecycle notes, packaging steps.
- Decision rationale, ADRs, "why we chose X over Y".
- Roadmaps, TODO lists, "coming soon" sections — they rot fastest and embarrass the project.
- Long privacy / data-handling write-ups. A single sentence is fine; anything longer links out to a dedicated doc.
- Any file path under `src/`.
- Lists of permissions with explanations of each one.
- Screenshots of error states or developer tools.

## 6. Boundary with `docs/` — zero technical jargon

The README is a brochure. `docs/` is the manual. If a sentence in the README would need a glossary entry to be understood by a non-developer, it belongs in `docs/`.

**Banned vocabulary in the README:**

`chrome.downloads`, `chrome.storage`, `chrome.runtime`, `KvStorage`, `SettingsService`, `MediaCacheService`, `DownloadService`, `ZipService`, `MV3`, *manifest v3*, *service worker*, *background script*, *content script*, `Preact`, `React`, `Tailwind`, `pnpm`, `npm`, `Vite`, `Vitest`, *Shadow DOM*, *XHR*, *fetch interception*, *bundler*, *transpile*, any path beginning with `src/`.

**Allowed UI / brand nouns:**

*Chrome*, *Firefox*, *Edge*, *Brave*, *Settings page* (the user actually clicks it), *extension*, *toolbar icon*, *download button*, *Instagram*, *Threads*, file extensions like `.zip`, `.xpi`, `.json`.

For any contributor-shaped question — building, testing, releasing, debugging — link out to `docs/development.md` or `docs/`. One line is enough.

## 7. Smells — stop and rewrite

Any of these means stop editing and reshape the README. Treat them as hard signals, not preferences.

- A sentence contains a code identifier (`SettingsService`, `chrome.runtime.sendMessage`, etc.).
- A sentence starts with *"Internally,"*, *"Under the hood,"*, *"Architecturally,"*, *"Behind the scenes,"*.
- The README grows a "Development", "Architecture", "Build", "Testing", "Contributing details", or "API" section. (A one-line *Contributing* link is fine; a section is not.)
- A bullet list crosses 5 items. Trim or move to `docs/`.
- Marketing superlatives appear (*powerful, seamless, lightning fast, industry-leading*, etc.).
- A non-technical reader would need to look up a word in the sentence.
- A roadmap, TODO list, or "coming soon" section creeps in. Roadmap belongs in GitHub issues, not the README.
- The adjective count of a paragraph exceeds its noun + verb count.
- Install steps for a single browser cross 4 items. Overflow goes to `docs/development.md`.
- Two adjacent paragraphs say the same thing. Cut one.
- A code block contains anything other than install-step copy-paste (no source snippets, no config files, no command sequences).
- A "Permissions" section enumerates each permission with an explanation.

---

This file is a rule, not a subagent. All agents touching `/README.md` apply it. Accuracy and structural index coverage remain with `documentation-reviewer`.
