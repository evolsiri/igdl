import { Card } from "../Card";

interface Section {
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    title: "What the extension does",
    body: "igdl injects a download button into Instagram and Threads posts, reels, stories, highlights, feed items, profile avatars, and profile video covers. Clicking the button downloads the media directly to your Downloads folder, optionally routed into a per-profile subdirectory.",
  },
  {
    title: "How the button is placed",
    body: "The extension polls the page every 3 seconds during idle time and injects a download button next to Instagram's own action icons.",
  },
  {
    title: "How directories resolve",
    body: "If the post's author is in your Profile Download Directories table, content downloads to that directory. Otherwise you see a popup with three choices: set a directory, download to the default directory, or never ask for this profile again.",
  },
  {
    title: "Always prompt Save As",
    body: "Turning this on globally forces the browser's native Save As dialog before each download. Otherwise downloads land silently in the resolved directory.",
  },
  {
    title: "Threads.com support",
    body: "When enabled, igdl also handles Threads.com posts, feed items, and profile surfaces.",
  },
  {
    title: "Per-profile opt-out",
    body: "Clicking 'Never ask for this profile' in the no-directory popup adds the profile to the Never-Ask Profiles card. Future downloads from that profile go to the default directory silently. Remove the entry from the Never-Ask card to restore the popup.",
  },
];

export function HowItWorksCard() {
  return (
    <Card
      title="How it works"
      subtitle="Quick explainers for each core behavior."
      id="how-it-works"
      testId="how-it-works-card"
    >
      <div>
        {SECTIONS.map((section) => (
          <details
            key={section.title}
            class="border-t border-border first:border-t-0 group"
          >
            <summary class="flex items-center gap-2 py-3 cursor-pointer text-sm font-medium text-fg hover:bg-surface-hover px-2 -mx-2 transition-colors duration-150 list-none [&::-webkit-details-marker]:hidden">
              <Chevron />
              <span>{section.title}</span>
            </summary>
            <p class="text-sm text-muted px-2 pb-4">{section.body}</p>
          </details>
        ))}
      </div>
    </Card>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="shrink-0 text-muted transition-transform duration-150 group-open:rotate-90"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
