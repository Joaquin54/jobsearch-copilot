# Indeed job page DOM map (verified live 2026-10-22)

**Coverage:**
- Search split view: 2 searches. One was fully verified, 25 jobs with 0 failures. The other had 8 jobs probed plus 4 external-apply jobs.
- Home feed (`/?vjk=`): 5 job switches.
- Standalone `/viewjob?jk=`: 1 already-applied job.

Only result cards were clicked; Apply and Save were never touched.

The legacy markup the current adapter targets (`#jobDescriptionText`, `.jobsearch-ViewJobLayout-jobDisplay`, `h1.jobsearch-JobInfoHeader-title`, `#indeedApplyButton`, `[class*='ViewJobLayout']`) is ABSENT on every page type. There is no `<h1>` in the job pane; the only h1 on the home feed is the "Hello, NAME" greeting.

## Page types: all use the same pane
| Page | URL | Notes |
|---|---|---|
| Search (split) | `/jobs?q=…&l=…&vjk=<jk>` | Pane inside `.jobsearch-RightPane` |
| Home feed (split) | `/?vjk=<jk>` or `/` | On first load the URL `vjk` can name a job that is NOT the one displayed (observed: URL `f166…`, pane showed `6fce…`); one load had no `vjk` at all |
| Standalone | `/viewjob?jk=<jk>` | Direct navigation triggered a Cloudflare "verify you are human" page once |

**Pane root:** `[data-testid="viewjob-main-content"]` on all three.

## Current job id
- **Search / home feed:** the visible result card with `a[data-jk][aria-pressed="true"]`; its `data-jk` is the job key. The URL `vjk` matched it on 25/25 search jobs and 4/4 feed switches, but NOT on the feed's first load.
- **Hidden clone:** once seen, a zero-size `a#sj_abcdef0123456789[data-jk="abcdef0123456789"][aria-pressed="true"]`, a hidden clone mirroring the selected card's title. Always filter pressed cards by visibility (`getClientRects().length > 0` / non-zero rect).
- **Standalone:** URL `jk`.
- **Inside the pane:** the job key only appears inside the external apply href (`/applystart?jk=<jk>…`) and inside the Indeed Apply href's `pingbackUrl` param. Nowhere else.

## Result cards
- `a[data-jk]`, `aria-label="full details of <Title>"`, `aria-pressed="true"` when selected.
- Card ids: `job_<jk>` = organic, `sj_<jk>` = sponsored. `sj_` ⇔ mosaic `sponsored: true` matched on 27/27 and 25/25. **Sponsored share: 23/27 and 24/25 results**, with NO visible "Sponsored" label anywhere.
- Decision (2026-10-22): track sponsored/promoted listings. The README rule "never stored" is dropped.

## Settle signal
After a card click, the pane title `[data-testid="vj-job-title"]` equals the pressed card's aria-label minus "full details of " and the apply control is present. This took 0.5–1.3 s (25/25, 0 timeouts). No " - job post" suffix observed (0/25).

## Pane hooks (all `data-testid`)
- **Title:** `vj-job-title` (`h5[role=heading]`). The duplicate `vj-job-title-compact` sits under an `[aria-hidden="true"]` sticky header (25/25), so ignore it.
- **Metadata:** `company-info-metadata`.
  - Company = `a[href*="/cmp/"]` text, with aria-label "<Company> (opens in a new tab)" (24/25). One job had no link; the company was the first plain text node.
  - Then an optional rating `[aria-label$="out of 5 stars"]` + "·" separators.
  - Then the location ("Miami, FL 33131", "815 NW 57th Avenue, Miami, FL 33126"), optionally followed by "•" and "Remote" / "Hybrid work".
  - The mosaic `formattedLocation` appears verbatim in metadata on 21/25 jobs.
- **Header actions:** `job-header-actions` contains:
  - `primary-apply-action`, which holds:
    - Indeed Apply: `a[data-testid="viewjob-indeed-apply"]`, text "Apply now", href `smartapply.indeed.com/beta/indeedapply/…`, target=_blank (opens a NEW TAB; the job tab stays). 40 of 52.
    - External: `a[data-testid="viewjob-apply"]`, text "Apply on company site", href `www.indeed.com/applystart?jk=<jk>…`, target=_blank. 12 of 52.
    - Already applied: `button[data-testid="viewjob-indeed-apply"]` with `disabled` + `aria-disabled="true"`, text "Applied" (1 sample on /viewjob; confirmed again 2026-10-25 on a search page, jk `6ff425f4ffe5e511`, minutes after a real Indeed Apply in the other tab).
    - Shape of the control itself (2026-10-25): `<a role="link" target="_blank" data-testid="viewjob-indeed-apply">` with **no aria-label**, its label in a nested `div[dir="ltr"]`. So a click lands on that leaf div and `closest("button, a, [role='button']")` is what reaches the anchor, and any console line describing it prints `aria-label=""`.
  - Save: `button[data-testid="vj-saveJobButton"]`, aria "Save job".
  - Not interested: `vj-dislikeJobButton`.
  - Share: `desktop-share-dropdown-trigger`.
- **Job details:** `structured-job-summary`: `h4` "Job details", then UNLABELLED rows (icons are aria-hidden), so classify by content:
  - Pay: "$100,000 - $120,000 a year", "$18 - $25 an hour", "From $85,000 a year", or "Pay information not provided" (= null).
  - Benefits (optional): "Health insurance, Paid time off, …".
  - Job types: "Full-time", "Part-time, Full-time, Contract", "Temporary, Full-time, Contract, Internship".
  - Schedule (optional): "Monday to Friday".
  - Location: "Miami, FL 33131", "Remote in Miami, FL", "Hybrid work in 5701 Stirling Road, Davie, FL".
  - UI noise: "Add location for commute", "Show 1 more".
- **Description:** heading `vj-job-description-heading` ("Full job description"), then `.simple-job-description-html` (a readable, non-hashed class). It contains a `<style>` element on 25/25, so strip style/script before reading text. 1.4k–9.4k chars of p / ul / div / b.
- No posted date anywhere in the pane DOM.

## Embedded data (search + home feed)
- `script#mosaic-data` contains `window.mosaic.providerData["mosaic-provider-jobcards"]=<JSON>;` followed by other assignments.
- Parse with a string-aware bracket scan starting at the first `{` after the marker. A naive split on ";window.mosaic" fails because the separator is ";\n    window.mosaic". Then `JSON.parse`; no eval needed.
- `.metaData.mosaicProviderJobCardsModel.results[]` (25–27 per page), one per card, each with:
  - `jobkey`, `title`, `displayTitle`, `company`, `formattedLocation`
  - `jobTypes` (often [])
  - `salarySnippet` (`{currency, salaryTextFormatted, text?}`)
  - **`pubDate` (epoch ms)**, `formattedRelativeTime` ("Just posted", "16 days ago", "30+ days ago")
  - `indeedApplyEnabled` (matched the apply control kind 25/25), `sponsored`, `expired`
- Mosaic company and title matched the DOM 25/25.
- It's a snapshot of the initial page load, so use it to enrich, keyed by jobkey, never as the only source.
- `/viewjob` instead has an inline script with `_initialData` (`jobInfoWrapperModel`, `appliedStateBannerModel`). Not explored.

## Unverified
- Whether the control flips to "Applied" without a reload of the job tab (2026-10-25 saw it flipped on a fresh load, not live).
- smartapply.indeed.com's success screen.
- Sponsored markup beyond `sj_` (no visible label exists).
