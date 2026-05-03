import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { SETTINGS_DEFAULTS } from "../../../services/settings/schema";
import type { Settings } from "../../../types/settings";
import { matchesQuery } from "../../../utils/search";
import { Card } from "../Card";
import { SearchInput } from "../SearchInput";
import { TextField } from "../TextField";
import { Toggle } from "../Toggle";

export interface DownloadsCardProps {
  settings: Settings;
  onPatch: (partial: Partial<Settings>) => Promise<unknown> | void;
}

interface SettingItem {
  key: string;
  tokens: string;
  render: () => preact.JSX.Element;
}

export function DownloadsCard({ settings, onPatch }: DownloadsCardProps) {
  const [query, setQuery] = useState("");

  // Local state buffers for directory-path fields so trailing slashes are
  // preserved while the user is typing and stripped only on blur.
  const [localDefaultDir, setLocalDefaultDir] = useState(settings.defaultDownloadDirectory);
  const [localPrefix, setLocalPrefix] = useState(settings.prefix);

  // Sync when settings change externally (Reset All, import).
  useEffect(() => { setLocalDefaultDir(settings.defaultDownloadDirectory); }, [settings.defaultDownloadDirectory]);
  useEffect(() => { setLocalPrefix(settings.prefix); }, [settings.prefix]);

  const items: SettingItem[] = [
    {
      key: "defaultDownloadDirectory",
      tokens: "default download directory folder destination",
      render: () => (
        <TextField
          label="Default download directory"
          description="Where downloads land when no per-profile directory is set. Relative to the browser's Downloads folder."
          value={localDefaultDir}
          onChange={setLocalDefaultDir}
          onBlur={() => {
            const stripped = localDefaultDir.replace(/\/+$/, "");
            setLocalDefaultDir(stripped);
            onPatch({ defaultDownloadDirectory: stripped });
          }}
          resetValue={SETTINGS_DEFAULTS.defaultDownloadDirectory}
          onReset={() => {
            setLocalDefaultDir(SETTINGS_DEFAULTS.defaultDownloadDirectory);
            onPatch({ defaultDownloadDirectory: SETTINGS_DEFAULTS.defaultDownloadDirectory });
          }}
        />
      ),
    },
    {
      key: "prefix",
      tokens: "prefix popup right-click on-page modal",
      render: () => (
        <TextField
          label="Prefix"
          description="Prefills the directory input in the Instagram download popup."
          value={localPrefix}
          onChange={setLocalPrefix}
          onBlur={() => {
            const stripped = localPrefix.replace(/\/+$/, "");
            setLocalPrefix(stripped);
            onPatch({ prefix: stripped });
          }}
          resetValue={SETTINGS_DEFAULTS.prefix}
          onReset={() => {
            setLocalPrefix(SETTINGS_DEFAULTS.prefix);
            onPatch({ prefix: SETTINGS_DEFAULTS.prefix });
          }}
        />
      ),
    },
    {
      key: "alwaysPromptSaveAs",
      tokens: "always prompt save as dialog native browser",
      render: () => (
        <Toggle
          label="Always prompt Save As"
          description="Show the browser's native Save As dialog on every download."
          checked={settings.alwaysPromptSaveAs}
          onChange={(v) => onPatch({ alwaysPromptSaveAs: v })}
          resetValue={SETTINGS_DEFAULTS.alwaysPromptSaveAs}
        />
      ),
    },
    {
      key: "filenameTemplate",
      tokens: "filename template name format username id datetime type placeholder",
      render: () => (
        <TextField
          label="Filename template"
          description="Supports {username}, {id}, {datetime}, {type} placeholders."
          value={settings.filenameTemplate}
          onChange={(v) => onPatch({ filenameTemplate: v })}
          resetValue={SETTINGS_DEFAULTS.filenameTemplate}
        />
      ),
    },
    {
      key: "datetimeFormat",
      tokens: "datetime format date time dayjs YYYY MM DD HH mm ss",
      render: () => (
        <TextField
          label="Datetime format"
          description={
            <>
              <a
                href="https://day.js.org/docs/en/display/format"
                target="_blank"
                rel="noreferrer noopener"
                class="text-accent underline underline-offset-2 hover:text-accent-hover transition-colors duration-150"
              >
                Day.js tokens
              </a>{" "}
              — applied wherever {"{datetime}"} appears in the filename template.
            </>
          }
          value={settings.datetimeFormat}
          onChange={(v) => onPatch({ datetimeFormat: v })}
          resetValue={SETTINGS_DEFAULTS.datetimeFormat}
        />
      ),
    },
    {
      key: "enableDatetimeFormat",
      tokens: "enable datetime format toggle timestamp filename",
      render: () => (
        <Toggle
          label="Include datetime in filenames"
          description="When off, {datetime} is omitted from filenames."
          checked={settings.enableDatetimeFormat}
          onChange={(v) => onPatch({ enableDatetimeFormat: v })}
          resetValue={SETTINGS_DEFAULTS.enableDatetimeFormat}
        />
      ),
    },
    {
      key: "replaceJpegWithJpg",
      tokens: "replace jpeg with jpg extension images",
      render: () => (
        <Toggle
          label="Replace .jpeg with .jpg"
          description="Normalises the file suffix on downloaded images."
          checked={settings.replaceJpegWithJpg}
          onChange={(v) => onPatch({ replaceJpegWithJpg: v })}
          resetValue={SETTINGS_DEFAULTS.replaceJpegWithJpg}
        />
      ),
    },
    {
      key: "useCarouselIndexing",
      tokens: "carousel indexing index slideshow multiple items",
      render: () => (
        <Toggle
          label="Index carousel items"
          description="Appends _1, _2, … to each file in a carousel post."
          checked={settings.useCarouselIndexing}
          onChange={(v) => onPatch({ useCarouselIndexing: v })}
          resetValue={SETTINGS_DEFAULTS.useCarouselIndexing}
        />
      ),
    },
    {
      key: "showOpenInNewTabIcon",
      tokens: "show open in new tab icon link out",
      render: () => (
        <Toggle
          label='Show "open in new tab" icon'
          description="Adds a link-out icon next to the download button."
          checked={settings.showOpenInNewTabIcon}
          onChange={(v) => onPatch({ showOpenInNewTabIcon: v })}
          resetValue={SETTINGS_DEFAULTS.showOpenInNewTabIcon}
        />
      ),
    },
    {
      key: "showZipDownloadIcon",
      tokens: "show zip download icon carousel bundle",
      render: () => (
        <Toggle
          label='Show "ZIP download" icon'
          description="On carousel posts, adds a zip-download icon that bundles every item into one .zip."
          checked={settings.showZipDownloadIcon}
          onChange={(v) => onPatch({ showZipDownloadIcon: v })}
          resetValue={SETTINGS_DEFAULTS.showZipDownloadIcon}
        />
      ),
    },
    {
      key: "enableThreadsSupport",
      tokens: "enable threads.com support meta experimental",
      render: () => (
        <Toggle
          label="Threads.com support"
          badge={<ExperimentalBadge />}
          description="Shows the download button on Threads.com posts, feeds, and profiles."
          checked={settings.enableThreadsSupport}
          onChange={(v) => onPatch({ enableThreadsSupport: v })}
          resetValue={SETTINGS_DEFAULTS.enableThreadsSupport}
        />
      ),
    },
    {
      key: "enableVideoControls",
      tokens: "enable enhanced video controls stories reels native html5",
      render: () => (
        <Toggle
          label="Enhanced video controls"
          description="Adds playback controls and mute-aware volume to stories and reels."
          checked={settings.enableVideoControls}
          onChange={(v) => onPatch({ enableVideoControls: v })}
          resetValue={SETTINGS_DEFAULTS.enableVideoControls}
        />
      ),
    },
    {
      key: "enableExploreVideoClickthrough",
      tokens: "explore video clickthrough navigate post experimental",
      render: () => (
        <Toggle
          label="Explore video clickthrough"
          badge={<ExperimentalBadge />}
          description="Clicking a video on the Explore page opens its post."
          checked={settings.enableExploreVideoClickthrough}
          onChange={(v) => onPatch({ enableExploreVideoClickthrough: v })}
          resetValue={SETTINGS_DEFAULTS.enableExploreVideoClickthrough}
        />
      ),
    },
  ];

  const matches = items.filter((item) => matchesQuery(item.tokens, query));
  const visible = matches.length === 0 ? items : matches;

  return (
    <Card
      title="Downloads"
      subtitle="Configure how you want to download content."
      id="downloads"
      testId="downloads-card"
      collapsible={true}
    >
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search downloads settings…"
        ariaLabel="Search downloads settings"
      />
      <div data-testid="downloads-list">
        {visible.map((item) => (
          <Fragment key={item.key}>{item.render()}</Fragment>
        ))}
      </div>
    </Card>
  );
}

function ExperimentalBadge() {
  return (
    <span
      title="This feature is experimental — it may not be fully tested and could be incomplete or subject to change."
      class="inline-flex items-center gap-1 ml-2 text-xs text-amber-500 cursor-help select-none"
    >
      <FlaskIcon />
      Experimental
    </span>
  );
}

function FlaskIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M10 3h4M10 3v6L5 20h14L14 9V3" />
    </svg>
  );
}
