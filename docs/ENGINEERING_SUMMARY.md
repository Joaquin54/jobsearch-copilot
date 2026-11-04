# Jobsearch Copilot: Engineering Summary

## What it is

Jobsearch Copilot is a Chrome extension that tracks the jobs I apply to on LinkedIn, Indeed and Handshake. When I click Apply, it reads the job I already have open and saves it on my machine. Later it marks the job as actually submitted. There is no server, no account and no network request to any outside site.

I built it because I needed it for my own job search. It is written in React 19 and TypeScript in strict mode, built with Vite, and tested with Bun.

## Why it is harder than it looks

The hard part is not saving data. It is that I don't control any of the three pages I read.

- LinkedIn and Indeed use class names that are generated at build time and change without notice. Handshake has no class names worth selecting on at all, so I use its `data-hook` and `aria-label` attributes.
- LinkedIn and Indeed change the URL before the job pane catches up. On live pages I measured about 0.5 to 1.8 seconds of lag. If I read the page on the URL change alone, I would save the previous job under the new id.
- Indeed opens its apply flow in a new tab, so there is no confirmation to see in the tab I am watching.

I checked how each site's pages are built against real job pages before writing any code: 47 LinkedIn job panels, about 25 Indeed jobs and 25 Handshake jobs. The rule I settled on is to refuse rather than guess. If the title or company is missing, or the pane still shows the old job, nothing is saved and I see a "Not tracked" message. A wrong row is worse than no row.

## How it is built

The content script runs inside the job page. The service worker is the only part that writes to the database in a normal build. The popup and dashboard ask it for counts and settings. The dashboard also reads the database directly, which keeps its table fast.

- **Typed messages.** Every message is one case of a TypeScript union, and the worker handles them in one `switch` that ends in `assertNever`. A new message type fails to compile until it is handled. Each caller also gets the exact response type for the message it sent.
- **One adapter per board.** Each board has its own adapter behind a shared interface. Each board's page-reading logic lives there, so a LinkedIn redesign can't break Indeed.
- **Two builds.** The popup, dashboard and worker build as ES modules. The content script builds separately as one classic script, because Chrome doesn't load content scripts declared in the manifest as modules.

## What happens when I click Apply

1. The content script listens for `pointerdown` in the capture phase instead of `click`. Indeed can navigate away right after the click, and this runs first.
2. It only counts clicks inside the open job pane. LinkedIn's "Easy Apply" filter and the buttons on result cards look the same, so they would cause false records.
3. It checks that the pane really shows the job it thinks is selected. If it still shows the old job, the capture is refused as stale.
4. It saves the job as `pending`. The id is the board plus the board's own job id, so applying twice updates the same row instead of making a new one.
5. The row becomes `applied` when one of these happens:
   - LinkedIn shows its confirmation dialog
   - the page shows the job as already applied (LinkedIn, and Indeed's disabled "Applied" button)
   - I answer the site's own question (LinkedIn, and Handshake's "Did you apply to this job?" banner)
   - I answer the extension's own question when I move to another job

If I answer no to the extension's question, the row is deleted. If I don't answer, it stays pending so I can be asked again.

## Data and the React side

Everything lives in one IndexedDB store with four indexes. The useful one is a compound index on status and date. One key range gives me "applied jobs in this date window" without reading any other rows.

The dashboard builds its list from index keys only. It filters and pages that list in memory, then loads full records only for the rows on screen. I chose this because reading every full record on each page change would not stay smooth at 5,000 rows.

A few React choices I would make again:

- **Popup.** The data request starts before React mounts, so the round trip overlaps the first render. Both reads go out together, and there is one state update. The loading skeleton comes from the same function that shapes the real data, so nothing jumps when it arrives.
- **Dashboard table.** Filters live in the URL, so a link restores the view. Filter and page changes run inside `startTransition`, so the old page stays visible while the next one loads. A request id and an "alive" flag drop any answer that arrives after a newer request or after the page closes.
- **Where state lives.** The table owns its own state, so paging never re-renders the overview above it.

## Safety and privacy

The extension asks for three permissions: `storage`, `downloads` and `offscreen`. Its host access covers only the three job boards. It asks once per board before it does anything there.

I treat everything read from a job page as untrusted, because someone else controls it.

- Scraped text is shown as text only. There is no `dangerouslySetInnerHTML` in the code and no `innerHTML` outside the tests.
- A job link is shown only if it is `https` and its host is a job board or a subdomain of one. A simple "contains" check would accept `evil-linkedin.com`, so I compare the host exactly.
- The CSV export puts an apostrophe in front of any cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return. Otherwise Excel or Sheets could run it as a formula.
- The in-page card is drawn inside a shadow root, so the site's CSS can't break it.

## Testing

There are 28 test files, run with `bun test`. Bun has no DOM or IndexedDB, so a setup file loads happy-dom and fake-indexeddb.

The tests that matter most use small HTML fixtures I wrote from the verified page maps: three for LinkedIn, four for Indeed and three for Handshake. The adapter suites start by checking that the decoys are really there, like Save buttons, filter pills and result cards. Then it checks that the adapter finds the real Apply button and ignores the decoys, reads the exact field values, and refuses a pane that still shows the old job. When a board changes its layout, a fixture test should fail before I notice bad records.

One small test checks that every board is listed in the manifest. Chrome injects the content script nowhere if a board is missing, and no adapter test can catch that.

## Issues I encountered along the way

- **Chrome was running an old build.** Indeed and Handshake looked broken. I ran the adapters against the live pages and they worked, so I checked the built bundle next. It was fine too. Chrome was still running a copy from before my changes, because it keeps the loaded copy until you reload the extension. That cost me some long debugging rounds. Now every build writes an id, the content script logs it, the dashboard shows it, and in development the background reloads itself if it starts and finds a newer id on disk.
- **The URL was not the job.** On Indeed's home feed, the job id in the URL can name a different job than the one shown on the first load. I now take the id from the selected result card and only fall back to the URL.
- **A modal is not a submission.** Handshake's apply modal is in the page before anything is submitted. Treating it as success would mark applications I never finished, so it is not considred.
