import { relativeToIso } from "../relativeDate.ts";
import type { FieldContext, SiteAdapter } from "./types.ts";

/**
 * Indeed's 2026 pane is the same on /jobs, / and /viewjob, and its class names
 * are hashed, so every hook here is a data-testid the server names on purpose.
 * The legacy class and id selectors are kept last so the pre-redesign layout
 * still works if it ever comes back.
 */
const PANE = '[data-testid="viewjob-main-content"]';
const LEGACY_ROOTS = ".jobsearch-ViewJobLayout-jobDisplay, .fastviewjob, [class*='ViewJobLayout']";

const TITLE = '[data-testid="vj-job-title"]';
const METADATA = '[data-testid="company-info-metadata"]';
const COMPANY_LINK = 'a[href*="/cmp/"]';
const RATING = '[aria-label$="out of 5 stars"]';
const SUMMARY = '[data-testid="structured-job-summary"]';
const DESCRIPTION = ".simple-job-description-html";
const LEGACY_DESCRIPTION = "#jobDescriptionText";

const APPLY_ACTION = '[data-testid="primary-apply-action"]';
const INDEED_APPLY = '[data-testid="viewjob-indeed-apply"]';
const EXTERNAL_APPLY = '[data-testid="viewjob-apply"]';
const APPLY_CONTROL = `a${INDEED_APPLY}, a${EXTERNAL_APPLY}`;
const DENY =
  '[data-testid="vj-saveJobButton"], [data-testid="vj-dislikeJobButton"], [data-testid="desktop-share-dropdown-trigger"], a[data-jk]';
const LEGACY_APPLY =
  "#indeedApplyButton, [id^='indeedApply'], .indeed-apply-button, [class*='IndeedApplyButton']";
const APPLY_TEXT = /^\s*apply (?:now|on company site)\b/i;
const APPLIED_TEXT = /^\s*applied\s*$/i;

const CARD = "a[data-jk]";
const PRESSED_CARD = 'a[data-jk][aria-pressed="true"]';
const SPONSORED_ID = /^sj_/;
const CARD_TITLE = /^full details of\s+/i;
const VIEWJOB_PATH = /\/viewjob\b/;

const SEPARATORS = /[·•∙|]/;
const MODALITY = /^(?:remote|hybrid(?: work)?|on-?site|in person)$/i;
const MODALITY_PREFIX = /^(remote|hybrid work|hybrid|on-?site)\b/i;
const PAY_ROW = /\$\s?\d/;
const NO_PAY = /^pay information not provided$/i;
const JOB_TYPE =
  /^(?:full[- ]time|part[- ]time|contract|contractor|temporary|temp[- ]to[- ]hire|internship|intern|seasonal|permanent|per diem|apprenticeship|co-?op|freelance|volunteer|subcontract)$/i;
const LOCATION_NOISE = /^(?:add location for commute|show \d+ more)$/i;

// The search page has one `mosaic-provider-jobcards`; the home feed numbers
// them, one per feed section (-1 … -9), and spreads them over several scripts.
const MOSAIC_MARKER = "mosaic-provider-jobcards";
const MOSAIC_ASSIGNMENT = 'providerData\\[\\s*"mosaic-provider-jobcards(?:-\\d+)?"\\s*\\]\\s*=';

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function textOf(element: Element): string {
  return clean(element.textContent ?? "");
}

/**
 * A pressed card can be a zero-size hidden clone mirroring the selected card,
 * and reading its data-jk would file the fields under the wrong job. Layout is
 * the browser's signal; the inline-style and aria-hidden checks are the same
 * test in a DOM with no layout engine.
 */
function isVisible(element: Element): boolean {
  if (element.closest('[aria-hidden="true"]') !== null) return false;
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const style = (node.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
    if (style.includes("display:none") || style.includes("visibility:hidden")) return false;
  }
  return element.getClientRects().length > 0;
}

function pressedCard(doc: Document): Element | null {
  return [...doc.querySelectorAll(PRESSED_CARD)].find(isVisible) ?? null;
}

/** "full details of Backend Developer" → "Backend Developer". */
function cardTitle(card: Element): string {
  const label = card.getAttribute("aria-label") ?? "";
  return CARD_TITLE.test(label) ? clean(label.replace(CARD_TITLE, "")) : "";
}

function paneTitle(doc: Document): string {
  const pane = detailRoot(doc);
  if (pane === null) return "";
  const heading = [...pane.querySelectorAll(TITLE)].find(
    (el: Element): boolean => el.closest('[aria-hidden="true"]') === null,
  );
  return heading === undefined ? "" : textOf(heading);
}

function detailRoot(doc: Document): HTMLElement | null {
  const pane = doc.querySelector<HTMLElement>(PANE);
  if (pane !== null) return pane;
  const legacy = doc.querySelector<HTMLElement>(LEGACY_ROOTS);
  if (legacy !== null) return legacy;
  const description = doc.querySelector(LEGACY_DESCRIPTION);
  return description?.closest<HTMLElement>("[class*='ViewJob'], main") ?? null;
}

/* ---------- metadata: company, location, modality ---------- */

/** The icons are aria-hidden and the rows unlabelled, so the texts are read as leaves. */
function leafTexts(root: Element): string[] {
  const found: string[] = [];
  const walk = (node: Element): void => {
    const children = [...node.children].filter((child: Element): boolean => textOf(child) !== "");
    if (children.length === 0) {
      const text = textOf(node);
      if (text !== "") found.push(text);
      return;
    }
    for (const child of children) walk(child);
  };
  for (const child of root.children) walk(child);
  return found;
}

type Metadata = { company: string; location: string; modality: string };

const EMPTY_METADATA: Metadata = { company: "", location: "", modality: "" };

function metadataOf(root: HTMLElement): Metadata {
  const metadata = root.querySelector(METADATA);
  if (metadata === null) return EMPTY_METADATA;

  const link = metadata.querySelector(COMPANY_LINK);
  // Each value is its own element and a "·" between two of them is optional, so
  // the segments come from the element leaves: collapsing the metadata to one
  // string glues the company onto the location.
  const copy = metadata.cloneNode(true) as Element;
  // The rating sits between the company and the location, and the company's own
  // leaf would otherwise read as the location.
  for (const rating of copy.querySelectorAll(RATING)) rating.remove();
  if (link !== null) for (const own of copy.querySelectorAll(COMPANY_LINK)) own.remove();

  const leaves = leafTexts(copy);
  const segments = (leaves.length > 0 ? leaves : [textOf(copy)])
    .flatMap((leaf: string): string[] => leaf.split(SEPARATORS))
    .map(clean)
    .filter((part: string): boolean => part !== "");

  const company = link === null ? (segments[0] ?? "") : textOf(link);
  const rest = link === null ? segments.slice(1) : segments;
  return {
    company,
    location: rest.find((part: string): boolean => !MODALITY.test(part)) ?? "",
    modality: rest.find((part: string): boolean => MODALITY.test(part)) ?? "",
  };
}

/* ---------- job details summary: unlabelled rows, classified by content ---------- */

type Summary = { pay: string; jobTypes: string; modality: string };

const EMPTY_SUMMARY: Summary = { pay: "", jobTypes: "", modality: "" };

function isJobTypes(text: string): boolean {
  const parts = text.split(",").map(clean);
  return parts.length > 0 && parts.every((part: string): boolean => JOB_TYPE.test(part));
}

function summaryOf(root: HTMLElement): Summary {
  const summary = root.querySelector(SUMMARY);
  if (summary === null) return EMPTY_SUMMARY;

  let pay = "";
  const types: string[] = [];
  let modality = "";
  for (const text of leafTexts(summary)) {
    if (LOCATION_NOISE.test(text)) continue;
    if (NO_PAY.test(text)) continue;
    if (pay === "" && PAY_ROW.test(text)) {
      pay = text;
      continue;
    }
    if (isJobTypes(text)) {
      types.push(text);
      continue;
    }
    // "Remote in Miami, FL" / "Hybrid work in 5701 Stirling Road, Davie, FL":
    // the location row is the only other place the modality is stated.
    const prefix = MODALITY_PREFIX.exec(text)?.[1];
    if (modality === "" && prefix !== undefined && / in /i.test(text)) modality = clean(prefix);
  }
  return { pay, jobTypes: types.join(", "), modality };
}

/* ---------- embedded mosaic data: enrichment only ---------- */

export type MosaicCard = {
  jobkey?: string;
  title?: string;
  displayTitle?: string;
  company?: string;
  formattedLocation?: string;
  pubDate?: number;
  formattedRelativeTime?: string;
  indeedApplyEnabled?: boolean;
  sponsored?: boolean;
  expired?: boolean;
};

type Mosaic = ReadonlyMap<string, MosaicCard>;

const mosaicCache = new WeakMap<Element, Mosaic | null>();

/**
 * Takes the object literal that follows `from` with a string-aware bracket
 * scan. Splitting on the next assignment fails: the separator is ";\n    window
 * .mosaic", and a brace can sit inside a JSON string.
 */
function jsonAfter(text: string, from: number): string | null {
  const start = text.indexOf("{", from);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/** Every jobcards assignment in one script, truncated or unexpected ones skipped. */
function collectMosaic(source: string, cards: Map<string, MosaicCard>): void {
  const pattern = new RegExp(MOSAIC_ASSIGNMENT, "g");
  let match: RegExpExecArray | null = pattern.exec(source);
  for (; match !== null; match = pattern.exec(source)) {
    const json = jsonAfter(source, match.index + match[0].length);
    if (json === null) continue;
    try {
      const payload = JSON.parse(json) as {
        metaData?: { mosaicProviderJobCardsModel?: { results?: unknown } };
      };
      const results: unknown = payload?.metaData?.mosaicProviderJobCardsModel?.results;
      if (!Array.isArray(results)) continue;
      for (const card of results as MosaicCard[]) {
        if (typeof card?.jobkey === "string" && card.jobkey !== "") cards.set(card.jobkey, card);
      }
    } catch {
      // A provider whose payload is not the snapshot shape: try the next one.
    }
  }
}

/**
 * Parsed once per page load. The cache is keyed on the first script that
 * carries the data rather than on the document: the scripts are a snapshot and
 * never change in place, but a search navigated to in the same document
 * replaces them, and a new element then misses the cache by itself.
 */
export function readMosaic(doc: Document): Mosaic | null {
  const sources: string[] = [];
  let first: Element | null = null;
  for (const script of doc.querySelectorAll("script")) {
    const source = script.textContent ?? "";
    if (!source.includes(MOSAIC_MARKER)) continue;
    if (first === null) first = script;
    sources.push(source);
  }
  if (first === null) return null;

  const cached = mosaicCache.get(first);
  if (cached !== undefined) return cached;

  const cards = new Map<string, MosaicCard>();
  for (const source of sources) collectMosaic(source, cards);
  const parsed = cards.size === 0 ? null : cards;
  mosaicCache.set(first, parsed);
  return parsed;
}

function mosaicCardFor(doc: Document, jobId: string): MosaicCard | null {
  if (jobId === "") return null;
  return readMosaic(doc)?.get(jobId) ?? null;
}

/* ---------- diagnostics ---------- */

const logged = new Set<string>();

function logOnce(key: string, line: string): void {
  if (logged.has(key)) return;
  logged.add(key);
  console.log(`[jobsearch-copilot] ${line}`);
}

export const indeedAdapter: SiteAdapter = {
  source: "indeed",
  domain: "indeed.com",

  matches(url: URL): boolean {
    return url.hostname.endsWith("indeed.com");
  },

  /**
   * The pane names no job id, so the open job is the pressed result card. The
   * URL comes first only on /viewjob, which has no cards: on the home feed's
   * first load `vjk` can name a job other than the one displayed.
   */
  jobId(url: URL, doc: Document): string | null {
    if (VIEWJOB_PATH.test(url.pathname)) {
      const jk = url.searchParams.get("jk");
      if (jk !== null && jk !== "") return jk;
    }

    const card = pressedCard(doc);
    const key = card?.getAttribute("data-jk") ?? "";
    if (key !== "") return key;

    const vjk = url.searchParams.get("vjk");
    if (vjk === null || vjk === "") return null;
    const cards = doc.querySelectorAll(CARD).length;
    logOnce(
      `jobid-fallback:${vjk}`,
      `indeed job id fell back to the url (vjk ${vjk}, no visible pressed card among ${cards})`,
    );
    return vjk;
  },

  detailRoot,

  /**
   * The pane catches up 0.5–1.3 s after a card click, so "showing job X" is the
   * pressed card naming X and the pane title already matching that card.
   * /viewjob has no cards at all, where null hands the caller back to the
   * mutation-quiet wait.
   */
  jobSettled(doc: Document, jobId: string): boolean | null {
    const card = pressedCard(doc);
    if (card === null) return null;
    if ((card.getAttribute("data-jk") ?? "") !== jobId) return false;
    const expected = cardTitle(card);
    if (expected === "") return false;
    return paneTitle(doc) === expected;
  },

  /** Information only: sponsored listings are tracked like any other. */
  isPromoted(root: HTMLElement): boolean {
    const doc = root.ownerDocument;
    const card = pressedCard(doc);
    return card !== null && SPONSORED_ID.test(card.id);
  },

  isApplyButton(element: Element | null): boolean {
    if (!element) return false;

    const doc = element.ownerDocument;
    const root = doc === null ? null : detailRoot(doc);
    if (root === null || !root.contains(element)) return false;
    // Deny before allow: Save, Not interested and Share sit beside the control,
    // and a result card's own text can read as apply.
    if (element.closest(DENY) !== null) return false;

    const action = element.closest(APPLY_ACTION);
    if (action !== null) {
      const control = element.closest(APPLY_CONTROL);
      // The disabled "Applied" button is a button, not a link: it is the
      // already-applied state, never a control to click.
      if (control !== null) return true;
      return false;
    }

    if (element.closest(LEGACY_APPLY) !== null) return true;
    if (element.closest("button[disabled], [aria-disabled='true']") !== null) return false;
    return APPLY_TEXT.test(element.textContent ?? "");
  },

  /** Second promotion signal: the pane itself says the application is in. */
  isApplied(doc: Document, jobId: string): boolean {
    if (this.jobSettled?.(doc, jobId) === false) return false;
    const root = detailRoot(doc);
    if (root === null) return false;
    const applied = root.querySelector(`${APPLY_ACTION} button${INDEED_APPLY}`);
    if (applied === null) return false;
    return applied.hasAttribute("disabled") && APPLIED_TEXT.test(textOf(applied));
  },

  /**
   * Indeed Apply opens smartapply.indeed.com in a NEW TAB and leaves the job
   * tab as it was, so there is no modal here to observe. Promotion happens
   * through the navigate-away question instead.
   */
  successModal(): HTMLElement | null {
    return null;
  },

  descriptionRoot(root: HTMLElement): Element | null {
    const box = root.querySelector(DESCRIPTION) ?? root.querySelector(LEGACY_DESCRIPTION);
    if (box === null) return null;
    // Every sample embeds a <style> inside the description, which would
    // otherwise land in the prose as CSS text.
    const copy = box.cloneNode(true) as Element;
    for (const node of copy.querySelectorAll("style, script")) node.remove();
    return copy;
  },

  readers: {
    title(root: HTMLElement): string {
      return paneTitle(root.ownerDocument);
    },

    company(root: HTMLElement): string {
      return metadataOf(root).company;
    },

    /**
     * Location plus the modality, e.g. "Miami, FL 33131 (Hybrid work)", because
     * parseJob reads modality off locationRaw and never off the chip. Same shape
     * the LinkedIn reader produces.
     */
    location(root: HTMLElement, ctx: FieldContext): string {
      const metadata = metadataOf(root);
      const location =
        metadata.location !== ""
          ? metadata.location
          : (mosaicCardFor(ctx.doc, ctx.jobId)?.formattedLocation ?? "");
      if (location === "") return "";
      const modality = metadata.modality !== "" ? metadata.modality : summaryOf(root).modality;
      return modality === "" ? location : `${location} (${modality})`;
    },

    pay(root: HTMLElement): string {
      return summaryOf(root).pay;
    },

    jobTypeChip(root: HTMLElement): string {
      const summary = summaryOf(root);
      const modality = metadataOf(root).modality !== "" ? metadataOf(root).modality : summary.modality;
      return [summary.jobTypes, modality].filter((part: string): boolean => part !== "").join(" · ");
    },

    /** The pane carries no posted date at all; only the mosaic snapshot does. */
    datePosted(_root: HTMLElement, ctx: FieldContext): string {
      const card = mosaicCardFor(ctx.doc, ctx.jobId);
      if (card === null) return "";
      if (typeof card.pubDate === "number" && Number.isFinite(card.pubDate)) {
        const date = new Date(card.pubDate);
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      }
      return relativeToIso(card.formattedRelativeTime ?? "", new Date());
    },
  },

  fields: {
    title: [
      { css: TITLE },
      { css: "h1.jobsearch-JobInfoHeader-title" },
      { css: "[data-testid='jobsearch-JobInfoHeader-title']" },
      { css: "h1" },
    ],
    company: [
      { css: `${METADATA} ${COMPANY_LINK}` },
      { css: "[data-testid='inlineHeader-companyName']" },
      { css: "[data-company-name]" },
      { css: ".jobsearch-CompanyInfoWithoutHeaderImage a" },
    ],
    location: [
      { css: "[data-testid='inlineHeader-companyLocation']" },
      { css: "[data-testid='job-location']" },
      { css: "#jobLocationText" },
    ],
    pay: [
      { css: "#salaryInfoAndJobType" },
      { css: "[class*='salary-snippet']" },
      { css: "[data-testid='attribute_snippet_testid']" },
    ],
    jobTypeChip: [
      { css: "#salaryInfoAndJobType" },
      { css: "[data-testid='attribute_snippet_testid']" },
      { css: "#jobDetailsSection" },
    ],
    datePosted: [
      { css: "[data-testid='myJobsStateDate']" },
      { css: ".jobsearch-JobMetadataFooter" },
    ],
    description: [
      { css: DESCRIPTION },
      { css: LEGACY_DESCRIPTION },
      { css: "[class*='jobsearch-JobComponent-description']" },
    ],
  },
};
