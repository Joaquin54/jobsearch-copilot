# Jobsearch Copilot

Project made to help navigate the doomer job market.

A Chrome extension (MV3) that tracks the jobs you apply to on LinkedIn and Indeed. It asks
permission per job board before doing anything, records a posting when you click Apply, and keeps
everything on your machine — no backend, no accounts, no cost to run.

## How it works

- Nothing runs on a job board until you activate it there. Until then the extension only asks.
- Clicking Apply / Easy Apply records the posting as `pending`. It becomes `applied` when LinkedIn
  shows its "Application sent" confirmation, or when you confirm after moving to another job.
- A job is identified by its board id (`linkedin:4012345678`, `indeed:abc123`). Applying again to
  the same posting updates the application date and leaves the rest of the record alone.
- Promoted and sponsored listings are never parsed or stored.
- Storage lives in IndexedDB inside the extension. At 80% of the browser's quota you are offered a
  CSV/JSON export, after which the store is cleared.

## Development

```sh
bun install
bun run typecheck
bun test
bun run build     # emits dist/
```

Then load `dist/` through `chrome://extensions` → Developer mode → Load unpacked.

## Terms of service

LinkedIn's User Agreement (§8.2) prohibits accessing the service with "bots or other automated
methods", and Indeed's terms similarly restrict automated collection. This extension reads only the
page you already opened: it issues no requests of its own, automates no part of applying, and stores
data locally. That is materially different from a scraper, but it is not unambiguously permitted.
Publishing this project openly does not shield you from that exposure — use it knowing the risk is
yours.
