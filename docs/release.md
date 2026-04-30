# Release checklist

Source of truth for cutting an `igdl` release. Follow top-to-bottom. The
`pnpm run` commands assume pnpm 9+ on Node 20+.

## 1. Pre-flight

- [ ] Working tree is clean: `git status` shows no uncommitted changes.
- [ ] `main` is up to date with the remote (if one is configured).

## 2. Quality gates

- [ ] `pnpm install --frozen-lockfile` completes without warnings.
- [ ] `pnpm run lint` — zero errors, zero warnings.
- [ ] `pnpm exec tsc -b` — zero errors.
- [ ] `pnpm run test` — all suites green (currently 230+ tests).
- [ ] `pnpm run build:chrome` and `pnpm run build:firefox` both succeed.
- [ ] `pnpm exec web-ext lint --source-dir=dist/firefox` — zero errors.

## 3. Manual smoke tests (both Chrome + Firefox)

Load the unpacked build, open Instagram with a signed-in account, and walk
through each of these. All must pass in both browsers.

- [ ] Button appears on a home-feed post, a post-detail view, a reel
      (`/reel/` detail + `/reels/` feed), a story, a highlight, a carousel,
      a profile avatar, and a profile-grid video-cover tile.
- [ ] Left-click on a new-to-you profile → NoDirPopup with the three
      expected buttons.
- [ ] "Set directory" → input pre-populated with `<prefix>/` + autofocus →
      save → download completes → green toast → new row in Profile Download
      Directories card.
- [ ] Left-click on a configured profile → silent download + green toast +
      downloadCount increments + lastDownloadAt updates.
- [ ] Right-click the button → OS Save As dialog appears immediately (no
      modal); file downloads to the chosen location.
- [ ] Induce a failure (offline) → red toast with the JS error message.
- [ ] Video download (post video, reel, story) → actual video downloaded
      (proves the XHR-interception layer is live).
- [ ] ZIP a carousel → single `.zip` lands. Both browsers zip in the content
      script via `ZipService` + anchor-click — background is uninvolved.
- [ ] Options page search in Downloads card filters, zero-match shows all
      (PAC-4.3).
- [ ] Add + edit + delete flows in Profile Download Directories.
- [ ] Never-Ask flow: popup → "Never ask" → silent default download →
      entry appears in Never-Ask Profiles card → remove it → popup returns.
- [ ] Always-prompt Save As toggle → native dialog on subsequent downloads.
- [ ] Appearance switcher (system / light / dark) → updates instantly.
- [ ] Reset all settings → every toggle / table / list resets.
- [ ] Repeat feed + post + reel flows on threads.com.

## 4. Release

Cutting a release is one click:

- [ ] GitHub → **Actions** → **Release** → **Run workflow** on `main`.
- [ ] Enter the target version in the `version` field (semver, no leading
      `v` — e.g. `1.2.3`) and click **Run workflow**.

The workflow then:

1. Validates the version is semver and the tag `v<version>` isn't already taken.
2. Syncs `package.json`, `src/manifest/chrome.manifest.json`, and
   `src/manifest/firefox.manifest.json` to the target version (no-op if
   already bumped).
3. Runs all quality gates: `pnpm run lint`, `tsc -b`, `vitest run`,
   `build:chrome`, `build:firefox`, `web-ext lint`, `package:chrome`,
   `package:firefox`.
4. Commits the version sync (if any) as `github-actions[bot]` with
   message `chore: release <version>` and pushes to the dispatched branch.
5. Tags that commit `v<version>` and pushes the tag.
6. Publishes a GitHub Release with `igdl-chrome-<version>.zip` and
   `igdl-firefox-<version>.zip` attached.

**Alternative (local tag):** bump all three versions by hand, commit, then
`git tag v<version> && git push origin v<version>`. The tag push triggers
the same workflow, which verifies the three versions match the tag (no
auto-sync in that path) and skips straight to the build + release.

## 5. Artifacts

The Release workflow produces and attaches:

- `igdl-chrome-<version>.zip` — Chrome Web Store upload.
- `igdl-firefox-<version>.zip` — Mozilla AMO upload (`.zip` accepted as-is).

Download them from the GitHub Release page. Sanity-check each by loading it
into a clean browser profile and running at least the first three smoke-test
items.

## 6. Distribution

### Chrome Web Store

- [ ] Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
- [ ] Upload `igdl-chrome-<version>.zip` from the GitHub Release.
- [ ] Update listing text if features changed. Take fresh screenshots if
      the UI changed materially.
- [ ] Submit for review.

### Mozilla AMO

- [ ] Sign in to [addons.mozilla.org Developer Hub](https://addons.mozilla.org/developers/).
- [ ] Upload `igdl-firefox-<version>.zip` from the GitHub Release.
- [ ] Update listing text + screenshots.
- [ ] Submit for review.

### Mozilla AMO — signed XPI for self-distribution (alternative)

For builds you want to ship outside the public AMO catalog (sideload, direct
download from a private link), sign locally instead of uploading the `.zip`:

1. Generate AMO API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/>.
2. Export them, or place them in `.env` at the repo root (gitignored
   via `*.local`):

   ```dotenv
   FIREFOX_API_KEY=user:12345678:42 # fake api key for the sake of this example
   FIREFOX_API_SECRET=mysecrethere
   ```

   Env vars are intentionally browser-prefixed (`FIREFOX_*`) — the wrapper
   script translates them to `web-ext`'s native `WEB_EXT_API_KEY` /
   `WEB_EXT_API_SECRET` only inside the child process.

3. Build then sign:

   ```sh
   pnpm run build:firefox
   pnpm run sign:firefox                       # unlisted (self-distribution, default)
   pnpm run sign:firefox -- --channel=listed   # public AMO listing (queued for review)
   ```

4. The signed file lands at `artifacts/igdl-firefox-<version>.xpi` and can be
   installed permanently in Firefox via `about:addons → ⚙ → Install Add-on
From File…`.

`gecko.id = igdl@evolsiri.local` is what AMO uses to identify the addon — do
not change it between releases (see Notes below).

## 7. Post-release

- [ ] Verify the auto-update picks up the new version on an already-installed
      extension (or manual reload).
- [ ] Monitor store reviews for 48 hours for install failures or regressions.
- [ ] If shipping hot, prepare a rollback: every prior GitHub Release
      retains its `igdl-chrome-*.zip` and `igdl-firefox-*.zip` — download
      the previous version's zip and re-upload it to the store listing to
      revert.

## Notes

- Local `artifacts/` is git-ignored; it's only populated when you run
  `pnpm run package:chrome` / `package:firefox` for smoke tests. The
  source of truth for shipped zips is the GitHub Releases page.
- `browser_specific_settings.gecko.id` is pinned in `src/manifest/firefox.manifest.json`
  as `igdl@evolsiri.local`. Don't change it between releases — Firefox uses
  it to recognize an update vs a new install.
- Chrome doesn't require an extension id in source — the id is assigned by
  the Web Store on first submission. Keep the submission slot stable.
