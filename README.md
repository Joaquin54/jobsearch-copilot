# Jobsearch Copilot

A Chrome extension that tracks the jobs you apply to across LinkedIn, Indeed and Handshake, built
because I needed it for my own job search.

![Popup](docs/images/popup.png)

![Dashboard](docs/images/dashboard.png)

**Stack:** React 19, TypeScript 5.9 (`strict`), Chrome MV3, IndexedDB, Vite 8, Bun.

## Engineering highlights

- **One adapter per job board behind a shared `SiteAdapter` interface**
  ([src/content/sites/](src/content/sites/)), so a redesign of one board can't break the others.
  Everything board-specific — selectors, job-id source, apply-button recognition, the settle
  signal — lives behind that interface; `resolveAdapter` picks the first adapter whose `matches`
  accepts the URL.
- **Scraped data is treated as untrusted.** A row's link renders only when the URL is `https` and
  its host matches one of the three boards on a full label boundary
  ([src/dashboard/lib/safeUrl.ts](src/dashboard/lib/safeUrl.ts)); every scraped field is rendered as
  React text and never as markup ([src/dashboard/components/ApplicationRow.tsx](src/dashboard/components/ApplicationRow.tsx));
  the CSV export does RFC 4180 escaping and neutralizes leading `=`, `+`, `-`, `@` so a spreadsheet
  can't execute a job description as a formula ([src/lib/export.ts](src/lib/export.ts), written out
  in chunks by [src/dashboard/data/exportCsv.ts](src/dashboard/data/exportCsv.ts)).
- **Fixture tests built from each board's real layouts**
  ([src/tests/fixtures/](src/tests/fixtures/) with [src/tests/linkedinSdui.test.ts](src/tests/linkedinSdui.test.ts),
  [src/tests/indeedPane.test.ts](src/tests/indeedPane.test.ts),
  [src/tests/handshake.test.ts](src/tests/handshake.test.ts)) — both layouts per board, the
  already-applied pane, Indeed's home-feed id mismatch, Handshake's external-apply banner.
- **Dev-only auto-reload when Chrome is running a stale build**
  ([src/background/devReload.ts](src/background/devReload.ts)). The service worker compares the
  build id compiled into it against the one in the extension's own `build.json` on disk and reloads
  if they disagree. A packed install has an `update_url` and is left alone.

Design decisions and trade-offs: [docs/ENGINEERING.md](docs/ENGINEERING.md).

## How it works

- Nothing runs on a job board until you activate it there, and the extension only asks once a real
  job page is open — never on a feed or a search list.
- Clicking Apply / Easy Apply records the posting as `pending`. It becomes `applied` when LinkedIn
  shows its "Application sent" confirmation or you answer its "Did you finish applying?" question,
  when you answer Handshake's own "Did you apply to this job?" banner, or when you confirm on the
  extension's own card after moving to another job.
- A job is identified by its board id (`linkedin:4012345678`, `indeed:abc123`,
  `handshake:11730261`). Applying again to the same posting updates the application date, backfills
  any field that was empty before, and leaves the rest of the record alone.
- On Handshake only the description preview the page already holds is stored: the full text loads
  behind a "More" button, and the extension never clicks it for you.
- Promoted and sponsored listings are tracked like any other: a record only ever appears
  because you clicked Apply on that posting.
- Storage lives in IndexedDB inside the extension. At 80% of the browser's quota you are offered a
  CSV/JSON export, after which the store is cleared.

## Development

```sh
bun install
bun run typecheck
bun test
bun run build     # emits dist/
```

`typecheck` and `build` are scripts in `package.json`; `bun test` is Bun's own runner, configured by
`bunfig.toml` to preload `src/tests/setup.ts`.

Then load `dist/` through `chrome://extensions` → Developer mode → Load unpacked.

### Testing

`bun test` runs 28 suites with no browser: `src/tests/setup.ts` registers happy-dom and
`fake-indexeddb` so the extraction and database tests have a DOM and an IndexedDB.

The fixture suites are the ones that matter when a board ships a redesign. Each fixture is a saved
layout of a real page, and each suite asserts against it that the adapter finds the right detail
root, reads the right job id, recognizes the real apply control and not the decoys beside it,
refuses a capture while the pane still shows the previous job, and produces the expected draft
fields. `src/tests/manifest.test.ts` separately checks that every board is still listed in
`public/manifest.json`, since a board missing there is injected nowhere and no adapter test would
catch it.

To add a fixture when a board changes its markup:

1. Save the page's relevant markup to `src/tests/fixtures/<board>-<layout>.html`, and open the file
   with an HTML comment naming the board, the route and which layout variant it is — the existing
   fixtures all do, and the suites rely on knowing which distractors each one carries.
2. In the suite, load it through that file's local helper, which every content test declares:
   ```ts
   async function fixture(name: string): Promise<string> {
     return Bun.file(`${import.meta.dir}/fixtures/${name}.html`).text();
   }
   async function render(name: string): Promise<void> {
     document.body.innerHTML = await fixture(name);
   }
   ```
   Then `await render("<board>-<layout>")` in the test body.
3. Add the fixture self-check first — assert that the distractors you are about to test against are
   really in the markup. The negative assertions are worth nothing otherwise.
4. Then add the real assertions: detail root, job id, apply-button isolation, settle signal, and the
   extracted draft.

## Terms of service

LinkedIn's User Agreement (§8.2) prohibits accessing the service with "bots or other automated
methods", and Indeed's and Handshake's terms similarly restrict automated collection. This extension
reads only the page you already opened: it issues no requests of its own, automates no part of
applying, and stores data locally. That is materially different from a scraper, but it is not
unambiguously permitted. Publishing this project openly does not shield you from that exposure — use
it knowing the risk is yours.
