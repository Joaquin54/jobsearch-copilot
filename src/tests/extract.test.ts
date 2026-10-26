import { beforeEach, expect, test } from "bun:test";

import { extract, pickText } from "../content/extract.ts";
import { resolveAdapter } from "../content/sites/index.ts";
import { linkedinAdapter } from "../content/sites/linkedin.ts";
import { indeedAdapter } from "../content/sites/indeed.ts";

const LINKEDIN_PANE = `
  <div class="jobs-search__job-details--wrapper">
    <h1 class="job-details-jobs-unified-top-card__job-title">Senior Platform Engineer</h1>
    <div class="job-details-jobs-unified-top-card__company-name">Acme Corp</div>
    <div class="job-details-jobs-unified-top-card__primary-description-container">
      Toronto, ON (Hybrid) · 2 days ago
    </div>
    <div class="job-details-preferences-and-skills">Full-time · Mid-Senior level</div>
    <div class="jobs-description__content">
      <p>Own our billing platform.</p>
      <h3>Requirements</h3>
      <ul><li>5+ years with TypeScript and Node.js</li><li>Kubernetes in production</li></ul>
      <h3>Benefits</h3>
      <ul><li>Health coverage</li></ul>
    </div>
  </div>
`;

const INDEED_PANE = `
  <div class="jobsearch-ViewJobLayout-jobDisplay">
    <h1 class="jobsearch-JobInfoHeader-title">Backend Developer</h1>
    <div data-testid="inlineHeader-companyName">Globex</div>
    <div data-testid="inlineHeader-companyLocation">Remote</div>
    <div id="salaryInfoAndJobType">$60/hr - Contract</div>
    <div id="jobDescriptionText">
      <p>Build data pipelines.</p>
      <h3>What you'll need</h3>
      <ul><li>Python and Airflow</li></ul>
    </div>
  </div>
`;

/** The adapters take the URL as an argument, so only the DOM needs staging. */
function render(html: string, _href: string): void {
  document.body.innerHTML = html;
}

beforeEach((): void => {
  document.body.innerHTML = "";
});

test("adapters resolve by hostname", (): void => {
  expect(resolveAdapter(new URL("https://www.linkedin.com/jobs/view/4012345678/"))?.source).toBe(
    "linkedin",
  );
  expect(resolveAdapter(new URL("https://ca.indeed.com/viewjob?jk=abc123"))?.source).toBe("indeed");
  expect(resolveAdapter(new URL("https://boards.greenhouse.io/acme/jobs/1"))).toBeNull();
});

test("linkedin job id comes from the query, the path, then the dom", (): void => {
  render('<div data-job-id="999"></div>', "https://www.linkedin.com/feed/");
  expect(
    linkedinAdapter.jobId(
      new URL("https://www.linkedin.com/jobs/search/?currentJobId=4012345678"),
      document,
    ),
  ).toBe("4012345678");
  expect(
    linkedinAdapter.jobId(new URL("https://www.linkedin.com/jobs/view/777/"), document),
  ).toBe("777");
  expect(linkedinAdapter.jobId(new URL("https://www.linkedin.com/feed/"), document)).toBe("999");
});

test("indeed job id comes from jk, the pressed card, then vjk", (): void => {
  render(
    '<a data-jk="pressed-jk" aria-pressed="true"></a><a data-jk="other-jk"></a>',
    "https://ca.indeed.com/jobs",
  );
  expect(indeedAdapter.jobId(new URL("https://ca.indeed.com/viewjob?jk=abc"), document)).toBe("abc");
  expect(indeedAdapter.jobId(new URL("https://ca.indeed.com/jobs?vjk=def"), document)).toBe(
    "pressed-jk",
  );

  // No pressed card: the url, and never the first card on the page.
  render('<a data-jk="first-jk"></a>', "https://ca.indeed.com/jobs");
  expect(indeedAdapter.jobId(new URL("https://ca.indeed.com/jobs?vjk=def"), document)).toBe("def");
  expect(indeedAdapter.jobId(new URL("https://ca.indeed.com/jobs"), document)).toBeNull();
});

test("a linkedin pane extracts a complete draft", (): void => {
  render(LINKEDIN_PANE, "https://www.linkedin.com/jobs/view/4012345678/");
  const outcome = extract(linkedinAdapter, "4012345678", "https://www.linkedin.com/jobs/view/4012345678/");

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.title).toBe("Senior Platform Engineer");
  expect(outcome.draft.company).toBe("Acme Corp");
  expect(outcome.draft.jobType).toBe("Full-Time");
  expect(outcome.draft.modality).toBe("Hybrid");
  expect(outcome.draft.skills).toEqual(
    expect.arrayContaining(["TypeScript", "Node.js", "Kubernetes"]),
  );
  expect(outcome.draft.requirements).toHaveLength(2);
  expect(outcome.via.title).toBe(0);
});

test("an indeed pane extracts pay and contract type", (): void => {
  render(INDEED_PANE, "https://ca.indeed.com/viewjob?jk=abc123");
  const outcome = extract(indeedAdapter, "abc123", "https://ca.indeed.com/viewjob?jk=abc123");

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.company).toBe("Globex");
  expect(outcome.draft.pay).toBe("$60 / hour");
  expect(outcome.draft.jobType).toBe("Contract");
  expect(outcome.draft.modality).toBe("Remote");
  expect(outcome.draft.skills).toEqual(expect.arrayContaining(["Python", "Airflow"]));
});

/* A record only ever exists because the user clicked Apply on that very
   posting, so a promoted or sponsored listing is tracked like any other. */

test("a promoted listing is parsed like any other", (): void => {
  render(
    LINKEDIN_PANE.replace(
      '<h1 class="job-details-jobs-unified-top-card__job-title">',
      '<span>Promoted</span><h1 class="job-details-jobs-unified-top-card__job-title">',
    ),
    "https://www.linkedin.com/jobs/view/1/",
  );
  const outcome = extract(linkedinAdapter, "1", "https://www.linkedin.com/jobs/view/1/");
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.title).toBe("Senior Platform Engineer");
});

test("a sponsored indeed listing is parsed like any other", (): void => {
  render(
    INDEED_PANE.replace("<h1", '<div data-testid="sponsoredJob">Sponsored</div><h1'),
    "https://ca.indeed.com/viewjob?jk=x",
  );
  const outcome = extract(indeedAdapter, "x", "https://ca.indeed.com/viewjob?jk=x");
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.company).toBe("Globex");
});

test("a missing title reports missing-required instead of throwing", (): void => {
  render(
    LINKEDIN_PANE.replace(
      '<h1 class="job-details-jobs-unified-top-card__job-title">Senior Platform Engineer</h1>',
      "",
    ),
    "https://www.linkedin.com/jobs/view/2/",
  );
  expect(extract(linkedinAdapter, "2", "https://www.linkedin.com/jobs/view/2/")).toEqual({
    ok: false,
    reason: "missing-required",
  });
});

test("no detail root reports no-root", (): void => {
  render("<main>nothing here</main>", "https://www.linkedin.com/jobs/view/3/");
  expect(extract(linkedinAdapter, "3", "https://www.linkedin.com/jobs/view/3/")).toEqual({
    ok: false,
    reason: "no-root",
  });
});

test("pickText falls through to the next candidate and survives a bad selector", (): void => {
  render('<div class="wrap"><h1>Fallback Title</h1></div>', "https://www.linkedin.com/jobs/view/4/");
  const hit = pickText(document.body, [{ css: ":::bad:::" }, { css: ".missing" }, { css: "h1" }]);
  expect(hit).toEqual({ text: "Fallback Title", index: 2 });
});

test("apply buttons are matched per site", (): void => {
  render('<button class="jobs-apply-button">Easy Apply</button>', "https://www.linkedin.com/jobs/view/5/");
  expect(linkedinAdapter.isApplyButton(document.querySelector("button"))).toBe(true);
  expect(linkedinAdapter.isApplyButton(null)).toBe(false);

  // The legacy control still counts, but only inside the legacy pane: every
  // apply check is scoped to the open job's detail root.
  render(
    '<div class="jobsearch-ViewJobLayout-jobDisplay"><button id="indeedApplyButton">Apply now</button></div>',
    "https://ca.indeed.com/viewjob?jk=y",
  );
  expect(indeedAdapter.isApplyButton(document.querySelector("button"))).toBe(true);

  render('<button id="indeedApplyButton">Apply now</button>', "https://ca.indeed.com/viewjob?jk=y");
  expect(indeedAdapter.isApplyButton(document.querySelector("button"))).toBe(false);
});

test("linkedin success modal is detected, indeed has none", (): void => {
  render('<div role="dialog">Application sent</div>', "https://www.linkedin.com/jobs/view/6/");
  expect(linkedinAdapter.successModal(document)).not.toBeNull();
  expect(indeedAdapter.successModal(document)).toBeNull();
});
