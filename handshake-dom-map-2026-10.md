# Handshake job page DOM map (verified live 2026-10-22, fiu.joinhandshake.com)

**Coverage:**
- Search split view: 25 jobs, 0 failures.
- Standalone `/jobs/<id>`: 1 not-applied job and 3 externally-applied jobs from the Job Tracker.

Only result cards were clicked; Apply, Save and Yes/No were never touched.

Hosts are per school (`fiu.joinhandshake.com`), so match `https://*.joinhandshake.com/*`. There is no embedded job JSON (no `__NEXT_DATA__`, no ld+json, no script containing the job id). Hooks are `data-hook` attributes plus aria-labels; class names are not used.

## Layouts
| Layout | URL | Root |
|---|---|---|
| A, search split | `/job-search/<id>?…filters` | `[data-hook="right-content"]` (list is `[data-hook="left-content"][role=region]`) |
| B, standalone | `/jobs/<id>` | `[data-hook="job-details-page"]` |

The inner structure is identical. `/applications` redirects to `/job-tracker`.

## Job id and settle
- URL path `/job-search/(\d+)` or `/jobs/(\d+)`. Clicking a card updates the path (25/25).
- **Pane cross-check:** the root has exactly one `h1`, wrapped in `a[href="/jobs/<id>"]`, and that id equals the URL id (25/25). It switches 150–250 ms after a card click.
- `document.title` is "Title | Company | Handshake" on `/jobs/<id>` only. On `/job-search/` it stays "Jobs | Handshake", so don't use it there.

## Result cards (layout A)
- `[data-hook="job-result-card | <id>"]` (a div) containing `a[href^="/job-search/<id>"]`.
- Hide control: `[data-hook="job-hide-button-<id>"]`. Bookmark: `[data-hook^="favorite-action"]`.
- **Promoted:** 3/25 cards show a "Promoted" text node. The pane has no promoted marker (0/3). Decision: track them anyway.

## Header (between the h1 and the h3 "At a glance"; ignore anything inside `[role="menu"]`)
- **Employer:** the first `a[href*="/e/<n>"][aria-label]` (wraps the logo), whose aria-label is the employer name (25/25). It precedes the h1. A later `/e/` link's aria-label is the industry ("Internet & Software"), so don't use that one.
- **Title:** the `h1` text.
- **Posted line:** a div whose text starts with "Posted " (25/25): "Posted 1 day ago∙Apply by November 20, 2026 at 11:59 PM". Forms seen: "Posted N hours/day(s)/week(s)/month(s) ago".
- **Buttons:**
  - Save: text "Save", no aria-label.
  - Share: "Share" (aria-expanded).
  - **Apply controls, always `<button>`, never links:**
    - `button[aria-label="Apply"]` (6)
    - `button[aria-label="Quick apply"]` (9)
    - `button[aria-label="Apply externally"]` (10; it can render ~1–2 s after the h1)
  - `button[aria-label="More actions for this job"]` opens a `role=menu` (Follow / Flag employer).
  - An empty `span[role="status"]` follows the apply button.

## "Did you apply?" banner (externally-applied jobs, 3/3)
- `div[role="alert"][aria-label="Default Banner"]` contains:
  - `h2` "Did you apply to this job?"
  - `p` "You started an application on the employer’s website."
  - `a` "View application"
  - a `[role="group"]` with `button[aria-label="Confirm external apply (yes)"]` "Yes" and `button[aria-label="Withdraw external apply (no)"]` "No".
- While the banner is shown, `button[aria-label="Apply externally"]` is **disabled**.
- It's a question, not a confirmation: "Yes" = applied, "No" = not applied.

## At a glance (h3 "At a glance" → h3 "Job description"); unlabelled rows, classify by content
- **Pay:** "$128–148K/yr", "$53K/yr", "$37.01/hr" (en dash ranges, K suffix, /yr or /hr).
- **Benefits (optional):** "Medical, dental, and vision coverage plus paid time off".
- **Modality + location:** "Onsite, based in Seattle, WA, Madison, WI" (plus a "+ 7" span), "Remote", "Hybrid", "Hybrid or onsite".
- **Explanation:** "Work in person from one of the locations".
- **Employment kind:** label "Job" or "Internship", then "Full-time" / "Part-time", optionally "Full-time From May 17, 2027 to August 6, 2027".
- **Work authorization:** `[data-hook="work-auth-title"]` ("US work authorization required") and `[data-hook="work-auth-subtitle"]` ("Open to candidates with OPT/CPT").

## Description
- `h3("Job description").parentElement.nextElementSibling`.
- **Only a PREVIEW is in the DOM** (86–682 chars) plus a `button` "More" with aria-label "Show more (What does a … do at …)" (25/25, both layouts). The full text loads only after "More" is clicked.
- Later sections ("What your school says", "About the employer", "Similar Jobs" with "Promoted" items and `[data-hook="similar-job-bookmark-action"]`, "Alumni …") are out of scope.

## Apply flows
- "Apply" and "Quick apply" open an in-page modal: `[data-hook="apply-modal-content"]`, `[data-hook="apply-modal-close-button"]` exist in the DOM.
- "Apply externally" leaves to the employer's site, and Handshake then asks via the banner above.

## Re-verified live 2026-10-22 (layout A, job 11502591, "Customer Success Specialist" at HelloGov AI)
- `[data-hook="right-content"]` holds exactly **one** `h1`, but the *document* holds six: the other
  five belong to pre-rendered dialog shells ("Add personal email", "Share this job", "Why are you
  reporting this?", "Confirm application withdrawal") and the page's own "Jobs". Scope every title
  read to the root.
- That `h1`'s anchor is `/jobs/11502591?searchId=<uuid>` — the href carries a query string, so match
  the id with a path-anywhere regex rather than an exact href.
- The root holds **two** `button[aria-label="Quick apply"]`: the header control and a sticky footer
  one ("Save / Quick apply"). Both belong to the open job, so matching either is correct.
- Result-card save controls carry `aria-label="Save this job: <title>"`. They never carry an apply
  label, so an exact-label allow list excludes them without a deny entry.
- "Confirm application withdrawal" is in the DOM for a job that has **not** been applied to, just as
  the apply modal's shell is. No modal shell can be read as application state.

## Unverified
- The modal's success state after a real Apply / Quick apply. Because of this the adapter's
  `successModal` returns null: promoting when the modal merely opens would mark an application the
  user may still abandon.
- What a job applied through Handshake's own flow looks like afterwards. No `isApplied` is
  implemented for the same reason — the banner above is a question, not a confirmation.
- `app.joinhandshake.com` (non-school host). `https://*.joinhandshake.com/*` matches it, and if its
  DOM differs `detailRoot` returns null and the extension stays silent.

## Decisions taken from this map (2026-10-22)
- The stored description is the preview only. The full text loads when "More" is clicked and the
  extension never clicks for the user, so 86–682 chars is what `skills` and `requirements` are
  derived from on Handshake.
- Promoted listings are tracked. `isPromoted` reads the result card for the open job, never a text
  scan of the pane — on `/jobs/<id>` the pane holds the "Similar Jobs" promoted items too.
