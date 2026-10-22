# LinkedIn job page DOM map (inspected live 2026-10-22)

LinkedIn moved job pages to server-driven UI (SDUI). Class names are hashed atomic classes (`kxhlgj kxhlgi …`) and change between builds — never select on them. There is no `<h1>` on either layout. All legacy selectors in `src/content/sites/linkedin.ts` (`.jobs-search__job-details--wrapper`, `.job-view-layout`, `.jobs-details`, `.job-details-jobs-unified-top-card__*`, `.jobs-apply-button`) match nothing.

## Layouts
| Layout | URL | Panel root |
|---|---|---|
| Search results (split view) | `/jobs/search-results/?currentJobId=<id>` | `[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"]` — result cards are OUTSIDE it |
| Standalone | `/jobs/view/<id>/` | `[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.JobDetails"]` — wraps the whole page (role=toolbar, main#workspace, similar-jobs links) |

## Stable hooks
- **About section / job-id cross-check:** `[componentkey^="JobDetails_AboutTheJob_"]`; the suffix equals the current job id (verified). Also `id="JobDetails_AboutTheJob_<id>"`.
- **Description:** `[componentkey^="JobDetails_AboutTheJob_"] [data-testid="expandable-text-box"]`. The full text is in the DOM (~4k chars) despite CSS line-clamp: 3, so there's no need to click "more". Children: p, ul, strong, a, span, plus the "…more" `button[data-testid="expandable-text-button"]` (exclude it).
- **Company:** `[aria-label^="Company, "]` → "Company, Compass." (strip prefix and trailing "."), or the first non-empty `a[href*="/company/"]` in the top card. Later /company/ links ("Compass390,116 followers", "Show Premium Insights") must be ignored.
- **Title:**
  - Search layout: `a[href*="/jobs/view/<id>/"]` in the top card, text = title.
  - Standalone layout: a plain `<p>`, not a link. There, `/jobs/view/<id>/` links are the Hybrid / Full-time chips.
  - `document.title` = "Title | Company | LinkedIn" (may carry a "(N) " notification prefix). It LAGS during SPA job switches (observed), so use it only as a cross-check.
- **Meta line:** a `<p>` whose own text is "· ·", with spans in order: location ("Boca Raton, FL"), relative posted time ("1 week ago"; no `<time>` element), applicants ("46 applicants").
- **Chips:** links right after the meta line, `span` text "Hybrid" / "On-site" / "Remote", "Full-time" / …. href is `/jobs/search-results/…` (search) or `/jobs/view/<id>/` (standalone). No `f_` filter params.
- **Pay:** not present on the inspected jobs. One result card showed "$100K…", so it likely appears as a chip; use a `$\d` regex on top-card spans/chips.
- **Easy Apply:** `button[aria-label="Easy Apply to this job"]`, text "Easy Apply", inner span + svg.
- **External apply:** `a[aria-label="Apply on company website"]`, text "Apply", href `linkedin.com/safety/go/…`, target=_blank.
- **Save:** `button[aria-label="Save the job"]` (must not count as apply).
- **More options:** `button[aria-label="More options"]`.
- **Already applied:** the panel shows `h2` "Application status" + `p` "Application submitted" and no apply button.
- **Result cards:** `div[role="button"][componentkey^="job-card-component-ref-<jobId>"]`. Card text can include "Easy Apply".
- **People section:** `[componentkey^="JobDetailsPeopleWhoCanHelpSlot_"]`.
- Button `componentkey` values are otherwise random UUIDs, so they're not stable.

## Not verified
- Easy Apply modal / "Application sent" confirmation (nothing was submitted).
- Promoted listing markup (0 promoted cards in the 25 inspected).
