import { beforeEach, expect, test } from "bun:test";

import { extract } from "../content/extract.ts";
import { indeedAdapter, readMosaic } from "../content/sites/indeed.ts";

const JOB = "aaaa111122223333";
const OTHER = "cccc777788889999";
const EXTERNAL = "eeee333344445555";
const APPLIED = "gggg555566667777";

const SEARCH_URL = `https://www.indeed.com/jobs?q=engineer&l=Miami&vjk=${JOB}`;

async function fixture(name: string): Promise<string> {
  return Bun.file(`${import.meta.dir}/fixtures/${name}.html`).text();
}

async function render(name: string): Promise<void> {
  document.body.innerHTML = await fixture(name);
}

function testid(id: string): Element | null {
  return document.querySelector(`[data-testid="${id}"]`);
}

beforeEach((): void => {
  document.body.innerHTML = "";
});

/* The negative assertions are only worth anything if the distractors the DOM
   map names are really in the fixture, so the fixture is checked first. */

test("the search fixture carries the cards, the hidden clone and the distractors", async (): Promise<void> => {
  await render("indeed-search-2026");

  expect(document.querySelectorAll("a[data-jk]")).toHaveLength(4);
  const pressed = document.querySelectorAll('a[data-jk][aria-pressed="true"]');
  expect(pressed).toHaveLength(2);
  expect(document.querySelector("#sj_dddd000011112222")?.getAttribute("style")).toContain(
    "display: none",
  );
  expect(testid("vj-job-title-compact")?.closest('[aria-hidden="true"]')).not.toBeNull();
  for (const id of ["vj-saveJobButton", "vj-dislikeJobButton", "desktop-share-dropdown-trigger"]) {
    expect(testid(id)).not.toBeNull();
  }
  expect(document.querySelector(".simple-job-description-html style")).not.toBeNull();
});

test("the detail root is the pane on every page type", async (): Promise<void> => {
  await render("indeed-search-2026");
  expect(indeedAdapter.detailRoot(document)?.getAttribute("data-testid")).toBe(
    "viewjob-main-content",
  );

  await render("indeed-applied-2026");
  expect(indeedAdapter.detailRoot(document)?.getAttribute("data-testid")).toBe(
    "viewjob-main-content",
  );

  // The legacy layout is still reachable, which is what indeed-sample.html needs.
  document.body.innerHTML = '<div class="jobsearch-ViewJobLayout-jobDisplay"><h1>Role</h1></div>';
  expect(indeedAdapter.detailRoot(document)).not.toBeNull();

  document.body.innerHTML = "<main>nothing here</main>";
  expect(indeedAdapter.detailRoot(document)).toBeNull();
});

test("the job id is the visible pressed card, not the url", async (): Promise<void> => {
  await render("indeed-feed-mismatch-2026");
  // The feed's first load: vjk names another job than the one on screen.
  expect(indeedAdapter.jobId(new URL("https://www.indeed.com/?vjk=ffff111122223333"), document)).toBe(
    JOB,
  );
  expect(indeedAdapter.jobId(new URL("https://www.indeed.com/"), document)).toBe(JOB);
});

test("/viewjob takes the job id from the url", async (): Promise<void> => {
  await render("indeed-applied-2026");
  expect(
    indeedAdapter.jobId(new URL(`https://www.indeed.com/viewjob?jk=${APPLIED}`), document),
  ).toBe(APPLIED);
});

test("the hidden pressed clone is ignored and the fallback to the url is logged", async (): Promise<void> => {
  await render("indeed-search-2026");
  const card = document.querySelector(`a[data-jk="${JOB}"]`) as Element;
  card.setAttribute("aria-pressed", "false");

  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]): void => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const url = new URL("https://www.indeed.com/?vjk=zzzz999988887777");
    // The clone's own key is never returned.
    expect(indeedAdapter.jobId(url, document)).toBe("zzzz999988887777");
    expect(indeedAdapter.jobId(url, document)).toBe("zzzz999988887777");
  } finally {
    console.log = original;
  }

  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("[jobsearch-copilot] indeed job id fell back to the url");

  // No pressed card and no vjk: not a job context at all.
  document.querySelector("#sj_dddd000011112222")?.remove();
  expect(indeedAdapter.jobId(new URL("https://www.indeed.com/jobs?q=engineer"), document)).toBeNull();
});

test("the pane is settled only when the card and the title agree", async (): Promise<void> => {
  await render("indeed-search-2026");
  expect(indeedAdapter.jobSettled?.(document, JOB)).toBe(true);
  expect(indeedAdapter.jobSettled?.(document, OTHER)).toBe(false);

  // Mid-swap: the card is already pressed, the pane title still lags behind.
  (testid("vj-job-title") as Element).textContent = "Platform Engineer";
  expect(indeedAdapter.jobSettled?.(document, JOB)).toBe(false);

  // /viewjob has no cards, so the caller falls back to mutation quiet.
  await render("indeed-applied-2026");
  expect(indeedAdapter.jobSettled?.(document, APPLIED)).toBeNull();
});

test("only the pane's apply control reads as apply", async (): Promise<void> => {
  await render("indeed-search-2026");
  expect(indeedAdapter.isApplyButton(testid("viewjob-indeed-apply"))).toBe(true);
  // Clicks land on the inner span.
  expect(indeedAdapter.isApplyButton(testid("viewjob-indeed-apply")?.querySelector("span") ?? null)).toBe(
    true,
  );

  expect(indeedAdapter.isApplyButton(null)).toBe(false);
  for (const id of ["vj-saveJobButton", "vj-dislikeJobButton", "desktop-share-dropdown-trigger"]) {
    expect(indeedAdapter.isApplyButton(testid(id))).toBe(false);
  }
  expect(indeedAdapter.isApplyButton(document.querySelector(`a[data-jk="${JOB}"]`))).toBe(false);

  await render("indeed-external-2026");
  expect(indeedAdapter.isApplyButton(testid("viewjob-apply"))).toBe(true);

  // The disabled "Applied" button is a state, not a control.
  await render("indeed-applied-2026");
  expect(indeedAdapter.isApplyButton(testid("viewjob-indeed-apply"))).toBe(false);
});

test("the disabled Applied button is the applied signal", async (): Promise<void> => {
  await render("indeed-applied-2026");
  expect(indeedAdapter.isApplied?.(document, APPLIED)).toBe(true);

  await render("indeed-search-2026");
  expect(indeedAdapter.isApplied?.(document, JOB)).toBe(false);
  expect(indeedAdapter.isApplied?.(document, OTHER)).toBe(false);
});

test("sponsored is reported from the pressed card id", async (): Promise<void> => {
  await render("indeed-search-2026");
  const root = indeedAdapter.detailRoot(document) as HTMLElement;
  expect(indeedAdapter.isPromoted(root)).toBe(false);

  await render("indeed-external-2026");
  expect(indeedAdapter.isPromoted(indeedAdapter.detailRoot(document) as HTMLElement)).toBe(true);
});

test("the mosaic snapshot is parsed without eval", async (): Promise<void> => {
  await render("indeed-search-2026");
  const mosaic = readMosaic(document);
  expect(mosaic?.size).toBe(3);
  expect(mosaic?.get(JOB)?.company).toBe("Globex Industries");
  // A brace inside a JSON string must not end the scan, and the assignment that
  // follows must not be swallowed.
  expect(mosaic?.get("bbbb444455556666")?.title).toBe("Data Engineer {not json}");
  expect(mosaic?.get(OTHER)?.formattedRelativeTime).toBe("30+ days ago");
});

test("a truncated or missing mosaic script yields null", async (): Promise<void> => {
  const html = await fixture("indeed-search-2026");
  document.body.innerHTML = html.replace(/"results":\[\{"jobkey".*$/s, '"results":[{"jobkey":');
  expect(document.querySelector("script#mosaic-data")).not.toBeNull();
  expect(readMosaic(document)).toBeNull();

  await render("indeed-external-2026");
  expect(readMosaic(document)).toBeNull();
});

test("the search pane extracts a complete draft", async (): Promise<void> => {
  await render("indeed-search-2026");
  const outcome = extract(indeedAdapter, JOB, SEARCH_URL);

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.title).toBe("Backend Developer");
  expect(outcome.draft.company).toBe("Globex Industries");
  expect(outcome.draft.location).toBe("Miami, FL 33131 (Hybrid work)");
  expect(outcome.draft.pay).toBe("$100,000–$120,000 / year");
  expect(outcome.draft.jobType).toBe("Full-Time");
  expect(outcome.draft.modality).toBe("Hybrid");
  expect(outcome.draft.datePosted).toBe("2026-10-20T00:00:00.000Z");
  expect(outcome.draft.skills).toEqual(
    expect.arrayContaining(["Python", "Airflow", "PostgreSQL"]),
  );
  expect(outcome.draft.requirements).toHaveLength(2);

  const description = indeedAdapter.descriptionRoot?.(
    indeedAdapter.detailRoot(document) as HTMLElement,
    { jobId: JOB, doc: document },
  );
  expect(description?.textContent).toContain("Build data pipelines");
  expect(description?.textContent).not.toContain("margin");
});

test("the external-apply pane extracts without a company link or pay", async (): Promise<void> => {
  await render("indeed-external-2026");
  const url = `https://www.indeed.com/jobs?vjk=${EXTERNAL}`;
  const outcome = extract(indeedAdapter, EXTERNAL, url);

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.title).toBe("Warehouse Associate");
  expect(outcome.draft.company).toBe("Initech Logistics");
  expect(outcome.draft.location).toBe("815 NW 57th Avenue, Miami, FL 33126 (Hybrid work)");
  expect(outcome.draft.pay).toBeNull();
  expect(outcome.draft.jobType).toBe("Contract");
  expect(outcome.draft.modality).toBe("Hybrid");
  expect(outcome.draft.datePosted).toBeNull();
});

test("the metadata is segmented by element, not by its collapsed text", async (): Promise<void> => {
  // Live Indeed puts each value in its own element and the "·" between them is
  // optional, so a flattened split glues the company onto the location.
  await render("indeed-feed-mismatch-2026");
  const metadata = testid("company-info-metadata") as Element;
  expect(metadata.textContent?.replace(/\s+/g, " ").trim()).toBe(
    "Globex Industries Miami, FL 33131 • Remote",
  );

  const outcome = extract(indeedAdapter, JOB, "https://www.indeed.com/?vjk=ffff111122223333");
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.company).toBe("Globex Industries");
  expect(outcome.draft.location).toBe("Miami, FL 33131 (Remote)");
  expect(outcome.draft.modality).toBe("Remote");
});

test("the home feed's numbered mosaic providers are merged", async (): Promise<void> => {
  await render("indeed-feed-mismatch-2026");
  // Two scripts, three assignments, one of them not a jobcards provider.
  expect(document.querySelectorAll("script")).toHaveLength(2);
  const mosaic = readMosaic(document);
  expect(mosaic?.size).toBe(2);
  expect(mosaic?.get(JOB)?.company).toBe("Globex Industries");
  expect(mosaic?.get("ffff111122223333")?.formattedRelativeTime).toBe("16 days ago");

  const outcome = extract(indeedAdapter, JOB, "https://www.indeed.com/?vjk=ffff111122223333");
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.datePosted).toBe("2026-10-20T00:00:00.000Z");
});

test("a pane showing another job is refused as stale", async (): Promise<void> => {
  await render("indeed-search-2026");
  expect(extract(indeedAdapter, OTHER, SEARCH_URL)).toEqual({ ok: false, reason: "stale" });
});
