import { beforeEach, expect, test } from "bun:test";

import { extract } from "../content/extract.ts";
import { handshakeAdapter } from "../content/sites/handshake.ts";
import { resolveAdapter } from "../content/sites/index.ts";

const SEARCH_URL = "https://fiu.joinhandshake.com/job-search/11730261?page=1";
const VIEW_URL = "https://fiu.joinhandshake.com/jobs/11730262";
const BANNER_URL = "https://fiu.joinhandshake.com/jobs/11730263";

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
  await render("handshake-search");
  const root = handshakeAdapter.detailRoot(document) as HTMLElement;

  const cards = document.querySelectorAll('[data-hook^="job-result-card"]');
  expect(cards).toHaveLength(3);
  for (const card of cards) expect(root.contains(card)).toBe(false);
  expect([...cards].filter((card: Element): boolean => (card.textContent ?? "").includes("Promoted"))).toHaveLength(1);

  expect(document.querySelector('[data-hook^="job-hide-button"]')).not.toBeNull();
  expect(document.querySelector('[data-hook^="favorite-action"]')).not.toBeNull();
  expect(document.querySelector('[data-hook="similar-job-bookmark-action"]')).not.toBeNull();
  expect(control("More actions for this job")).not.toBeNull();
  expect(document.querySelector('[role="menu"]')).not.toBeNull();

  // Save is the trap the exact-label allow list exists for: it has no label.
  const save = [...root.querySelectorAll("button")].find(
    (button: Element): boolean => button.textContent === "Save",
  );
  expect(save).toBeDefined();
  expect(save?.getAttribute("aria-label")).toBeNull();

  // The employer link comes first; the industry link is also an /e/ link.
  const employers = [...root.querySelectorAll('a[href*="/e/"][aria-label]')];
  expect(employers).toHaveLength(2);
  expect(employers[0]?.getAttribute("aria-label")).toBe("Northwind Labs");
  expect(employers[1]?.getAttribute("aria-label")).toBe("Internet & Software");
});

test("fixture B carries the apply modal shell with no success copy", async (): Promise<void> => {
  await render("handshake-view");
  const root = handshakeAdapter.detailRoot(document) as HTMLElement;
  const modal = document.querySelector('[data-hook="apply-modal-content"]');

  expect(modal).not.toBeNull();
  expect(modal?.textContent).not.toContain("submitted");
  expect(modal?.textContent).not.toContain("sent");
  expect(document.querySelector('[data-hook="apply-modal-close-button"]')).not.toBeNull();

  // Layout B's root wraps the similar-job cards, promoted marker and all.
  const promoted = [...root.querySelectorAll("span")].find(
    (span: Element): boolean => span.textContent === "Promoted",
  );
  expect(promoted).toBeDefined();
  expect(root.contains(promoted as Element)).toBe(true);
});

test("fixture banner carries the yes/no group and a disabled Apply externally", async (): Promise<void> => {
  await render("handshake-banner");

  expect(document.querySelector('[role="alert"][aria-label="Default Banner"]')).not.toBeNull();
  expect(control("Confirm external apply (yes)")).not.toBeNull();
  expect(control("Withdraw external apply (no)")).not.toBeNull();
  expect(control("Apply externally")?.hasAttribute("disabled")).toBe(true);
});

test("detailRoot finds both layouts and never the result list", async (): Promise<void> => {
  await render("handshake-search");
  const list = document.querySelector('[data-hook="left-content"]') as Element;
  const root = handshakeAdapter.detailRoot(document) as HTMLElement;
  expect(root.getAttribute("data-hook")).toBe("right-content");
  expect(root.contains(list)).toBe(false);

  await render("handshake-view");
  expect(handshakeAdapter.detailRoot(document)?.getAttribute("data-hook")).toBe("job-details-page");

  document.body.innerHTML = "<main>nothing here</main>";
  expect(handshakeAdapter.detailRoot(document)).toBeNull();
});

test("the job id comes from both job paths and is null off a job page", async (): Promise<void> => {
  await render("handshake-search");
  expect(handshakeAdapter.jobId(new URL(SEARCH_URL), document)).toBe("11730261");
  expect(handshakeAdapter.jobId(new URL(VIEW_URL), document)).toBe("11730262");

  // A job pane is rendered, so these prove there is no DOM fallback: the pane's
  // h1 anchor is the settle signal, not an id source.
  for (const path of ["/job-tracker", "/postings", "/e/8821", "/"]) {
    expect(handshakeAdapter.jobId(new URL(`https://fiu.joinhandshake.com${path}`), document)).toBeNull();
  }
});

test("jobSettled cross-checks the h1 anchor against the requested id", async (): Promise<void> => {
  await render("handshake-search");
  expect(handshakeAdapter.jobSettled?.(document, "11730261")).toBe(true);
  expect(handshakeAdapter.jobSettled?.(document, "11739999")).toBe(false);

  // No anchor around the h1: no signal to wait on, so the caller falls back to
  // mutation quiet rather than refusing for good.
  const heading = document.querySelector("h1") as Element;
  heading.closest("a")?.replaceWith(heading);
  expect(handshakeAdapter.jobSettled?.(document, "11730261")).toBeNull();

  document.body.innerHTML = "<main>nothing here</main>";
  expect(handshakeAdapter.jobSettled?.(document, "11730261")).toBeNull();
});

test("a stale pane is refused instead of filed under the new id", async (): Promise<void> => {
  await render("handshake-search");
  expect(extract(handshakeAdapter, "11739999", SEARCH_URL)).toEqual({ ok: false, reason: "stale" });
});

test("promoted is read off this job's result card, never off the pane", async (): Promise<void> => {
  await render("handshake-search");
  const root = handshakeAdapter.detailRoot(document) as HTMLElement;
  expect(handshakeAdapter.isPromoted(root)).toBe(false);

  // The promoted card belongs to another job; point the pane at it instead.
  const anchor = document.querySelector('a[href="/jobs/11730261"]') as Element;
  anchor.setAttribute("href", "/jobs/11730264");
  expect(handshakeAdapter.isPromoted(root)).toBe(true);

  // Layout B has the promoted items of "Similar Jobs" inside the root, and they
  // must not be read as this job's.
  await render("handshake-view");
  const viewRoot = handshakeAdapter.detailRoot(document) as HTMLElement;
  expect(handshakeAdapter.isPromoted(viewRoot)).toBe(false);
});

test("layout A: only Quick apply reads as apply", async (): Promise<void> => {
  await render("handshake-search");
  const quick = control("Quick apply") as Element;

  expect(handshakeAdapter.isApplyButton(quick)).toBe(true);
  expect(handshakeAdapter.isApplyButton(quick.querySelector("span"))).toBe(true);
  expect(handshakeAdapter.isApplyButton(quick.querySelector("svg"))).toBe(true);

  const root = handshakeAdapter.detailRoot(document) as HTMLElement;
  const save = [...root.querySelectorAll("button")].find(
    (button: Element): boolean => button.textContent === "Save",
  );
  for (const other of [
    save,
    [...root.querySelectorAll("button")].find((b: Element): boolean => b.textContent === "Share"),
    control("More actions for this job"),
    document.querySelector('[role="menuitem"]'),
    document.querySelector('[data-hook^="job-result-card"]'),
    document.querySelector('[data-hook^="favorite-action"]'),
    document.querySelector('[data-hook^="job-hide-button"]'),
    document.querySelector('[data-hook="similar-job-bookmark-action"]'),
    document.querySelector('button[aria-label^="Show more"]'),
    null,
  ]) {
    expect(handshakeAdapter.isApplyButton((other ?? null) as Element | null)).toBe(false);
  }
});

test("layout B: Apply externally reads as apply", async (): Promise<void> => {
  await render("handshake-view");
  const external = control("Apply externally") as Element;
  expect(handshakeAdapter.isApplyButton(external)).toBe(true);
  expect(handshakeAdapter.isApplyButton(external.querySelector("span"))).toBe(true);
  expect(handshakeAdapter.isApplyButton(document.querySelector('[data-hook="apply-modal-close-button"]'))).toBe(false);
});

/**
 * A disabled control dispatches no pointer event, so this case cannot arrive
 * from Chrome. It is left as an apply anyway: "Apply externally" renders 1–2 s
 * after the h1 and may be briefly disabled while hydrating, and dropping a real
 * apply is unrecoverable where a spare pending row is not.
 */
test("a disabled Apply externally is still an apply control", async (): Promise<void> => {
  await render("handshake-banner");
  expect(handshakeAdapter.isApplyButton(control("Apply externally"))).toBe(true);
});

test("applyAnswer reads the banner's yes/no and nothing else", async (): Promise<void> => {
  await render("handshake-banner");
  const yes = control("Confirm external apply (yes)") as Element;
  const no = control("Withdraw external apply (no)") as Element;

  expect(handshakeAdapter.applyAnswer?.(yes)).toBe("yes");
  expect(handshakeAdapter.applyAnswer?.(yes.querySelector("span") as Element)).toBe("yes");
  expect(handshakeAdapter.applyAnswer?.(no)).toBe("no");
  expect(handshakeAdapter.applyAnswer?.(no.querySelector("span") as Element)).toBe("no");

  for (const other of [
    document.querySelector('a[href="/job-tracker"]'),
    document.querySelector("h2"),
    control("Apply externally"),
    control("More actions for this job"),
  ]) {
    expect(handshakeAdapter.applyAnswer?.(other as Element)).toBeNull();
  }

  // A confirmation is not an apply click.
  expect(handshakeAdapter.isApplyButton(yes)).toBe(false);
});

test("successModal never promotes, and there is no applied detector", async (): Promise<void> => {
  for (const name of ["handshake-search", "handshake-view", "handshake-banner"]) {
    await render(name);
    expect(handshakeAdapter.successModal(document)).toBeNull();
  }
  expect(handshakeAdapter.isApplied).toBeUndefined();
});

test("layout A extracts a complete draft", async (): Promise<void> => {
  await render("handshake-search");
  const outcome = extract(handshakeAdapter, "11730261", SEARCH_URL);

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const draft = outcome.draft;
  expect(draft.source).toBe("handshake");
  expect(draft.nativeBoardId).toBe("11730261");
  expect(draft.title).toBe("Staff Platform Engineer");
  expect(draft.company).toBe("Northwind Labs");
  expect(draft.location).toBe("Seattle, WA (Onsite)");
  expect(draft.modality).toBe("On-site");
  expect(draft.jobType).toBe("Full-Time");
  expect(draft.pay).toBe("$128,000–$148,000 / year");
  expect(draft.skills).toEqual(expect.arrayContaining(["TypeScript", "Node.js", "Kubernetes"]));
  expect(draft.requirements).toEqual([
    "5+ years with TypeScript and Node.js",
    "Kubernetes in production",
  ]);

  const posted = draft.datePosted === null ? 0 : Date.parse(draft.datePosted);
  expect(Math.abs(posted - (Date.now() - 24 * 60 * 60 * 1000))).toBeLessThan(60_000);

  // The overflow count and the work-authorisation rows belong to no field.
  expect(draft.location).not.toContain("+ 7");
  expect(draft.location).not.toContain("Madison");
  expect(draft.pay).not.toContain("authorization");
  expect(draft.title).not.toContain("Posted");
});

test("the industry link never answers for the employer", async (): Promise<void> => {
  await render("handshake-search");
  const outcome = extract(handshakeAdapter, "11730261", SEARCH_URL);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.company).toBe("Northwind Labs");
  expect(outcome.draft.company).not.toBe("Internet & Software");
});

test("layout B extracts an internship paid by the hour", async (): Promise<void> => {
  await render("handshake-view");
  const outcome = extract(handshakeAdapter, "11730262", VIEW_URL);

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  const draft = outcome.draft;
  expect(draft.title).toBe("Data Engineering Intern");
  expect(draft.company).toBe("Meridian Systems");
  expect(draft.location).toBe("Remote");
  expect(draft.modality).toBe("Remote");
  expect(draft.jobType).toBe("Internship");
  expect(draft.pay).toBe("$37.01 / hour");
  expect(draft.skills).toEqual(expect.arrayContaining(["Python", "Airflow"]));

  const posted = draft.datePosted === null ? 0 : Date.parse(draft.datePosted);
  expect(Math.abs(posted - (Date.now() - 3 * 24 * 60 * 60 * 1000))).toBeLessThan(60_000);
});

test("the banner layout still extracts, hybrid and all", async (): Promise<void> => {
  await render("handshake-banner");
  const outcome = extract(handshakeAdapter, "11730263", BANNER_URL);

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.title).toBe("Data Analyst");
  expect(outcome.draft.company).toBe("Harbour Analytics");
  expect(outcome.draft.location).toBe("Miami, FL (Hybrid)");
  expect(outcome.draft.modality).toBe("Hybrid");
  expect(outcome.draft.pay).toBe("$53,000 / year");
});

/* The fixtures only ever listed US places, so the glance row is rewritten here:
   the place pattern has to keep the first place of any shape, and stop where
   the next capitalised place begins. */
async function locationFor(row: string): Promise<string> {
  await render("handshake-banner");
  const span = [...document.querySelectorAll("span")].find((node: Element): boolean =>
    (node.textContent ?? "").startsWith("Hybrid, based in"),
  ) as Element;
  span.textContent = row;
  const outcome = extract(handshakeAdapter, "11730263", BANNER_URL);
  expect(outcome.ok).toBe(true);
  return outcome.ok ? outcome.draft.location : "";
}

test("a non-US place is kept instead of collapsing to the modality", async (): Promise<void> => {
  expect(await locationFor("Onsite, based in London, United Kingdom")).toBe(
    "London, United Kingdom (Onsite)",
  );
  expect(await locationFor("Hybrid, based in Toronto, Ontario")).toBe("Toronto, Ontario (Hybrid)");
});

test("a state spelled out in full is kept, and only the first place of several", async (): Promise<void> => {
  expect(await locationFor("Onsite, based in Austin, Texas")).toBe("Austin, Texas (Onsite)");
  const several = await locationFor(
    "Onsite, based in London, United Kingdom, Paris, France, Madison, WI",
  );
  expect(several).toBe("London, United Kingdom (Onsite)");
  expect(several).not.toContain("Paris");
  expect(several).not.toContain("Madison");
});

test("the combined hybrid or onsite modality is read whole", async (): Promise<void> => {
  expect(await locationFor("Hybrid or onsite, based in Denver, CO")).toBe(
    "Denver, CO (Hybrid or onsite)",
  );
});

test("the description keeps the preview and drops the More control", async (): Promise<void> => {
  await render("handshake-search");
  const root = handshakeAdapter.detailRoot(document) as HTMLElement;
  const description = handshakeAdapter.descriptionRoot?.(root, {
    jobId: "11730261",
    doc: document,
  });

  expect(description?.textContent).toContain("Own the billing platform");
  expect(description?.textContent).not.toContain("More");
  // Stripped from a copy: nothing on the page was clicked or changed.
  expect(document.querySelector('button[aria-label^="Show more"]')).not.toBeNull();
});

test("the glance readers return empty when their heading is gone", async (): Promise<void> => {
  await render("handshake-search");
  const glance = [...document.querySelectorAll("h3")].find(
    (node: Element): boolean => node.textContent === "At a glance",
  ) as Element;
  glance.remove();

  const outcome = extract(handshakeAdapter, "11730261", SEARCH_URL);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.draft.location).toBe("");
  expect(outcome.draft.pay).toBeNull();
  expect(outcome.draft.title).toBe("Staff Platform Engineer");
});

/* Every school gets its own host, and the extension is expected to work on all
   of them, so the suffix is the contract — not a list of known schools. */
const SCHOOL_HOSTS = [
  "fiu.joinhandshake.com",
  "ucla.joinhandshake.com",
  "uw.joinhandshake.com",
  "cal-poly.joinhandshake.com",
  "app.joinhandshake.com",
  "joinhandshake.com",
];

test("resolveAdapter picks handshake for any school host", (): void => {
  expect(resolveAdapter(new URL(SEARCH_URL))?.source).toBe("handshake");
  for (const host of SCHOOL_HOSTS) {
    expect(resolveAdapter(new URL(`https://${host}/job-search/11730261`))?.source).toBe("handshake");
  }
  expect(resolveAdapter(new URL("https://joinhandshake.com.evil.net/jobs/1"))?.source).not.toBe(
    "handshake",
  );
});
