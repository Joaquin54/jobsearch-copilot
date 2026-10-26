import { beforeEach, expect, test } from "bun:test";

import { extract } from "../content/extract.ts";
import { relativeToIso } from "../content/relativeDate.ts";
import { linkedinAdapter } from "../content/sites/linkedin.ts";

const SEARCH_URL = "https://www.linkedin.com/jobs/search-results/?currentJobId=4012345678";
const VIEW_URL = "https://www.linkedin.com/jobs/view/4098765432/";
const APPLIED_URL = "https://www.linkedin.com/jobs/search-results/?currentJobId=4055555555";

async function fixture(name: string): Promise<string> {
  return Bun.file(`${import.meta.dir}/fixtures/${name}.html`).text();
}

async function render(name: string): Promise<void> {
  document.body.innerHTML = await fixture(name);
}

function control(label: string): Element | null {
  return document.querySelector(`[aria-label="${label}"]`);
}

beforeEach((): void => {
  document.body.innerHTML = "";
});

/* The negative assertions below are only worth anything if the distractors the
   DOM map names are really present, so each fixture is checked first. */

test("fixture A carries the distractors that must not read as apply", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  const root = linkedinAdapter.detailRoot(document);

  const cards = document.querySelectorAll('[componentkey^="job-card-component-ref"]');
  expect(cards).toHaveLength(2);
  for (const card of cards) {
    expect(card.textContent).toContain("Easy Apply");
    expect(root?.contains(card)).toBe(false);
  }

  const pill = document.querySelector('[role="toolbar"] button');
  expect(pill?.textContent).toBe("Easy Apply");
  expect(root?.contains(pill as Element)).toBe(false);

  expect(document.querySelectorAll('a[href*="/company/"]')).toHaveLength(3);
  expect(document.querySelector('[componentkey^="JobDetailsPeopleWhoCanHelpSlot_"]')).not.toBeNull();
  expect(control("Save the job")).not.toBeNull();
  expect(control("More options")).not.toBeNull();
  expect(document.querySelector('button[data-testid="expandable-text-button"]')).not.toBeNull();
});

test("fixture B carries the toolbar and the similar-job cards", async (): Promise<void> => {
  await render("linkedin-sdui-view");
  const root = linkedinAdapter.detailRoot(document);

  const pill = document.querySelector('[role="toolbar"] button');
  // Layout B's screen root wraps the toolbar, so root containment alone is not
  // enough to reject it — the top-card scoping has to do that work.
  expect(root?.contains(pill as Element)).toBe(true);
  expect(document.querySelector("main#workspace")).not.toBeNull();

  const similar = [...document.querySelectorAll('a[href^="/jobs/search-results/"]')];
  expect(similar).toHaveLength(2);
  for (const link of similar) expect(link.textContent).toContain("Easy Apply");
});

test("fixture applied has the status block, no apply control and no Save", async (): Promise<void> => {
  await render("linkedin-sdui-applied");
  const h2 = [...document.querySelectorAll("h2")].find(
    (node: Element): boolean => node.textContent === "Application status",
  );
  expect(h2).toBeDefined();
  expect(h2?.parentElement?.parentElement?.querySelector("p")?.textContent).toBe(
    "Application submitted",
  );
  expect(control("Easy Apply to this job")).toBeNull();
  expect(control("Apply on company website")).toBeNull();
  expect(control("Save the job")).toBeNull();
  expect(document.querySelector('a[href^="/interview-prep/"]')).not.toBeNull();
});

test("detailRoot finds both sdui screens and nothing else", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  expect(linkedinAdapter.detailRoot(document)?.getAttribute("data-sdui-screen")).toBe(
    "com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails",
  );

  await render("linkedin-sdui-view");
  expect(linkedinAdapter.detailRoot(document)?.getAttribute("data-sdui-screen")).toBe(
    "com.linkedin.sdui.flagshipnav.jobs.JobDetails",
  );

  document.body.innerHTML = "<main>nothing here</main>";
  expect(linkedinAdapter.detailRoot(document)).toBeNull();
});

test("the job id comes from the url and from the About marker", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  expect(linkedinAdapter.jobId(new URL(SEARCH_URL), document)).toBe("4012345678");
  // No id in the url at all: the About marker answers.
  expect(linkedinAdapter.jobId(new URL("https://www.linkedin.com/feed/"), document)).toBe(
    "4012345678",
  );

  await render("linkedin-sdui-view");
  expect(linkedinAdapter.jobId(new URL(VIEW_URL), document)).toBe("4098765432");
});

test("jobSettled cross-checks the About marker against the requested id", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  expect(linkedinAdapter.jobSettled?.(document, "4012345678")).toBe(true);
  expect(linkedinAdapter.jobSettled?.(document, "4099999999")).toBe(false);

  // Legacy markup has no marker, so there is no signal to wait on.
  document.body.innerHTML = '<div class="jobs-details"><h1>Role</h1></div>';
  expect(linkedinAdapter.jobSettled?.(document, "1")).toBeNull();
});

test("a stale pane is refused instead of filed under the new id", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  expect(extract(linkedinAdapter, "4099999999", SEARCH_URL)).toEqual({
    ok: false,
    reason: "stale",
  });
});

test("nothing in the sdui layout reads as promoted", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  const root = linkedinAdapter.detailRoot(document) as HTMLElement;
  expect(linkedinAdapter.isPromoted(root)).toBe(false);

  root.insertAdjacentHTML("afterbegin", '<span class="kxhlhd">Promoted</span>');
  expect(linkedinAdapter.isPromoted(root)).toBe(false);
});

test("layout A: only the Easy Apply button reads as apply", async (): Promise<void> => {
  await render("linkedin-sdui-search");

  const easyApply = control("Easy Apply to this job") as Element;
  expect(linkedinAdapter.isApplyButton(easyApply)).toBe(true);
  // Clicks land on the inner span or the svg.
  expect(linkedinAdapter.isApplyButton(easyApply.querySelector("span"))).toBe(true);
  expect(linkedinAdapter.isApplyButton(easyApply.querySelector("svg"))).toBe(true);

  for (const rejected of [
    control("Save the job"),
    control("More options"),
    document.querySelector('[componentkey="job-card-component-ref-1101"]'),
    document.querySelector('[role="toolbar"] button'),
    document.querySelector('a[href*="keywords=hybrid"]'),
    document.querySelector('a[href*="/company/"]'),
    document.querySelector('button[data-testid="expandable-text-button"]'),
    null,
  ]) {
    expect(linkedinAdapter.isApplyButton(rejected)).toBe(false);
  }
});

test("layout B: the external apply button reads as apply, the rest does not", async (): Promise<void> => {
  await render("linkedin-sdui-view");

  const external = control("Apply on company website") as Element;
  expect(linkedinAdapter.isApplyButton(external)).toBe(true);
  expect(linkedinAdapter.isApplyButton(external.querySelector("span"))).toBe(true);

  for (const rejected of [
    control("Save the job"),
    control("More options"),
    document.querySelector('[role="toolbar"] button'),
    document.querySelector('a[href^="/jobs/search-results/"]'),
  ]) {
    expect(linkedinAdapter.isApplyButton(rejected)).toBe(false);
  }
});

test("an external apply anchor is matched structurally, not by label text", async (): Promise<void> => {
  await render("linkedin-sdui-view");
  const button = control("Apply on company website") as Element;
  button.insertAdjacentHTML(
    "afterend",
    '<a href="https://www.linkedin.com/safety/go/?url=example" target="_blank" class="qpzrtp">Postuler</a>',
  );
  expect(linkedinAdapter.isApplyButton(document.querySelector('a[href*="/safety/go/"]'))).toBe(true);
});

test("applyAnswer reads LinkedIn's post-apply question and nothing else", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  const pane = linkedinAdapter.detailRoot(document) as HTMLElement;
  pane.insertAdjacentHTML(
    "beforeend",
    '<a aria-label="Did you finish applying? Yes" href="#"><span>Yes</span></a>' +
      '<a aria-label="Did you finish applying? No" href="#">No</a>',
  );

  const yes = document.querySelector('[aria-label="Did you finish applying? Yes"]') as Element;
  expect(linkedinAdapter.applyAnswer?.(yes)).toBe("yes");
  // Clicks land on the inner span.
  expect(linkedinAdapter.applyAnswer?.(yes.querySelector("span") as Element)).toBe("yes");
  expect(
    linkedinAdapter.applyAnswer?.(
      document.querySelector('[aria-label="Did you finish applying? No"]') as Element,
    ),
  ).toBe("no");

  for (const other of [
    control("Easy Apply to this job"),
    control("Save the job"),
    control("More options"),
  ]) {
    expect(linkedinAdapter.applyAnswer?.(other as Element)).toBeNull();
  }

  // A confirmation is not an apply click.
  expect(linkedinAdapter.isApplyButton(yes)).toBe(false);
});

test("the applied detector fires only for the pending job and only with no apply control", async (): Promise<void> => {
  await render("linkedin-sdui-applied");
  expect(linkedinAdapter.isApplied?.(document, "4055555555")).toBe(true);
  expect(linkedinAdapter.isApplied?.(document, "4012345678")).toBe(false);

  await render("linkedin-sdui-search");
  expect(linkedinAdapter.isApplied?.(document, "4012345678")).toBe(false);
});

test("layout A extracts a complete draft", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  const outcome = extract(linkedinAdapter, "4012345678", SEARCH_URL);

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const draft = outcome.draft;
  expect(draft.title).toBe("Staff Platform Engineer");
  expect(draft.company).toBe("Northwind Labs");
  expect(draft.location).toBe("Boca Raton, FL (Hybrid)");
  expect(draft.modality).toBe("Hybrid");
  expect(draft.jobType).toBe("Full-Time");
  expect(draft.pay).toBe("$100,000–$110,000 / year");
  expect(draft.skills).toEqual(expect.arrayContaining(["TypeScript", "Node.js", "Kubernetes"]));
  expect(draft.requirements).toEqual([
    "5+ years with TypeScript and Node.js",
    "Kubernetes in production",
  ]);

  const posted = draft.datePosted === null ? 0 : Date.parse(draft.datePosted);
  const nineHoursAgo = Date.now() - 9 * 60 * 60 * 1000;
  expect(Math.abs(posted - nineHoursAgo)).toBeLessThan(60_000);
});

test("layout B extracts a title containing a pipe and no pay", async (): Promise<void> => {
  await render("linkedin-sdui-view");
  const outcome = extract(linkedinAdapter, "4098765432", VIEW_URL);

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const draft = outcome.draft;
  expect(draft.title).toBe("Software Engineer | Talent Community");
  expect(draft.company).toBe("Meridian Systems");
  expect(draft.location).toBe("Miami, FL (On-site)");
  expect(draft.modality).toBe("On-site");
  expect(draft.jobType).toBe("Full-Time");
  expect(draft.pay).toBeNull();
  expect(draft.skills).toEqual(expect.arrayContaining(["Python", "Airflow"]));

  const posted = draft.datePosted === null ? 0 : Date.parse(draft.datePosted);
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  expect(Math.abs(posted - twoWeeksAgo)).toBeLessThan(60_000);
});

test("the description drops the '… more' control and the applicant count never lands in a field", async (): Promise<void> => {
  await render("linkedin-sdui-search");
  const root = linkedinAdapter.detailRoot(document) as HTMLElement;
  const description = linkedinAdapter.descriptionRoot?.(root, { jobId: "4012345678", doc: document });

  expect(description?.textContent).toContain("Own the billing platform");
  expect(description?.textContent).not.toContain("more");
  expect(document.querySelector('button[data-testid="expandable-text-button"]')).not.toBeNull();

  const outcome = extract(linkedinAdapter, "4012345678", SEARCH_URL);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.location).not.toContain("applicants");
  expect(outcome.draft.title).not.toContain("applicants");
});

test("an applied pane still extracts, with no pay and no apply control", async (): Promise<void> => {
  await render("linkedin-sdui-applied");
  const outcome = extract(linkedinAdapter, "4055555555", APPLIED_URL);

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.title).toBe("Data Analyst");
  expect(outcome.draft.company).toBe("Harbour Analytics");
  expect(outcome.draft.location).toBe("Miami, FL (On-site)");
  expect(outcome.draft.pay).toBeNull();
});

test("relative posting ages become approximate iso stamps", (): void => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  expect(relativeToIso("9 hours ago", now)).toBe("2026-10-22T03:00:00.000Z");
  expect(relativeToIso("1 week ago", now)).toBe("2026-10-15T12:00:00.000Z");
  expect(relativeToIso("Reposted 2 weeks ago", now)).toBe("2026-10-08T12:00:00.000Z");
  expect(relativeToIso("6 months ago", now)).toBe("2026-04-25T12:00:00.000Z");
  expect(relativeToIso("46 applicants", now)).toBe("");
  expect(relativeToIso("", now)).toBe("");
});
