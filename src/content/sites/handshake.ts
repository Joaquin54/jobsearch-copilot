import { relativeToIso } from "../relativeDate.ts";
import type { SiteAdapter } from "./types.ts";

/**
 * Handshake names every hook on purpose — a data-hook attribute or an
 * aria-label — and uses no class names at all, so nothing here selects on one.
 * There is no embedded job JSON either (no __NEXT_DATA__, no ld+json), so the
 * pane is the only source. Hosts are per school (fiu.joinhandshake.com), hence
 * the hostname suffix match.
 */
const SEARCH_PANE = '[data-hook="right-content"]';
const DETAILS_PAGE = '[data-hook="job-details-page"]';

const JOB_SEARCH_PATH = /\/job-search\/(\d+)/;
const JOB_PATH = /\/jobs\/(\d+)/;

const GLANCE_HEADING = "At a glance";
const DESCRIPTION_HEADING = "Job description";

const EMPLOYER_LINK = 'a[href*="/e/"][aria-label]';
const MORE_BUTTON = 'button[aria-label^="Show more"]';

const APPLY =
  'button[aria-label="Apply"], button[aria-label="Quick apply"], button[aria-label="Apply externally"]';
/** Save carries no aria-label at all, so the exact-label allow list excludes it by itself. */
const DENY = [
  '[data-hook^="job-result-card"]',
  '[data-hook^="job-hide-button"]',
  '[data-hook^="favorite-action"]',
  '[data-hook="similar-job-bookmark-action"]',
  '[data-hook="apply-modal-close-button"]',
  'button[aria-label="More actions for this job"]',
  '[role="menu"]',
].join(", ");

const BANNER = 'div[role="alert"][aria-label="Default Banner"]';
const ANSWER_YES = 'button[aria-label="Confirm external apply (yes)"]';
const ANSWER_NO = 'button[aria-label="Withdraw external apply (no)"]';

const PROMOTED = /(^|\s)promoted(\s|$)/i;
const POSTED = /^Posted\s/;
const PAY_ROW = /\$\s?\d/;
const KIND_ROW = /^(?:job|internship)$/i;
const SCHEDULE_ROW = /^(full-time|part-time)\b/i;
const MODALITY_ROW = /^(onsite|remote|hybrid or onsite|hybrid)\b/i;
/**
 * "Seattle, WA", "Austin, Texas" or "London, United Kingdom". The city class
 * holds a space so "Salt Lake City" matches, which is also why the tail is
 * bounded: a state code or a run of capitalised words ends at the comma that
 * opens the next place, so "Seattle, WA, Madison, WI" yields only Seattle.
 */
const PLACE = /([A-Z][A-Za-z.'\- ]*,\s*(?:[A-Z]{2,3}\b|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*))/;
const SEPARATOR = /[∙·•]/;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function textOf(element: Element): string {
  return clean(element.textContent ?? "");
}

function headingsOf(root: HTMLElement): readonly Element[] {
  return [...root.querySelectorAll("h3")];
}

function headingWithText(headings: readonly Element[], text: string): Element | null {
  return headings.find((node: Element): boolean => textOf(node) === text) ?? null;
}

/**
 * Document order, as a flat list, so a region can be cut by index. Comparing
 * indices rather than ancestry is the point: a wrapper holding both headings
 * sits before the start marker and is therefore excluded, so no reader can grab
 * a whole section's concatenated text.
 */
function regionBetween(
  root: HTMLElement,
  start: Element | null,
  end: Element | null,
): readonly Element[] {
  const all = [...root.querySelectorAll("*")];
  const from = start === null ? -1 : all.indexOf(start);
  const to = end === null ? all.length : all.indexOf(end);
  return all.slice(from + 1, to < 0 ? all.length : to);
}

/** The rows are unlabelled divs of spans, so only the leaves carry a value. */
function leavesOf(region: readonly Element[]): readonly Element[] {
  return region.filter(
    (element: Element): boolean =>
      ![...element.children].some((child: Element): boolean => textOf(child) !== ""),
  );
}

function headerOf(root: HTMLElement): readonly Element[] {
  const glance = headingWithText(headingsOf(root), GLANCE_HEADING);
  // Everything above "At a glance": the employer logo link precedes the h1, so
  // the region starts at the root rather than at the title. The menu behind
  // "More actions for this job" holds Follow / Flag employer and is not header.
  return regionBetween(root, null, glance).filter(
    (element: Element): boolean => element.closest('[role="menu"]') === null,
  );
}

/**
 * Empty when the heading is missing, so every glance reader returns "". Each
 * reader walks the pane for itself, once: extract hands a reader only
 * (root, ctx), so sharing one index across readers would mean widening the
 * SiteAdapter interface all three adapters use. That was judged not worth it
 * for a few extra walks per click, so the repeat across readers is deliberate.
 */
function glanceOf(root: HTMLElement): readonly Element[] {
  const headings = headingsOf(root);
  const glance = headingWithText(headings, GLANCE_HEADING);
  if (glance === null) return [];
  return regionBetween(root, glance, headingWithText(headings, DESCRIPTION_HEADING));
}

/** Takes the leaves, not the root, so a reader reading two rows walks the pane once. */
function glanceRow(leaves: readonly Element[], pattern: RegExp): string {
  const row = leaves.find((element: Element): boolean => pattern.test(textOf(element)));
  return row === undefined ? "" : textOf(row);
}

function detailRoot(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(SEARCH_PANE) ?? doc.querySelector<HTMLElement>(DETAILS_PAGE);
}

/** The pane's one h1 is wrapped in a link to the job it is showing. */
function paneJobId(root: HTMLElement): string | null {
  const heading = root.querySelector("h1");
  const anchor = heading?.closest("a[href]") ?? null;
  if (anchor === null) return null;
  return JOB_PATH.exec(anchor.getAttribute("href") ?? "")?.[1] ?? null;
}

export const handshakeAdapter: SiteAdapter = {
  source: "handshake",
  domain: "joinhandshake.com",

  matches(url: URL): boolean {
    return url.hostname.endsWith("joinhandshake.com");
  },

  /**
   * The path is the only id source. The pane's h1 anchor is deliberately not a
   * fallback: it is the settle signal, and reading the id from the same place
   * jobSettled checks would make that cross-check always agree and defeat the
   * stale guard. Off a job page this is null, which keeps the extension from
   * asking for activation on the job tracker or a feed.
   */
  jobId(url: URL): string | null {
    return (
      JOB_SEARCH_PATH.exec(url.pathname)?.[1] ?? JOB_PATH.exec(url.pathname)?.[1] ?? null
    );
  },

  detailRoot,

  /**
   * The h1's link switches to the new id 150–250 ms after a result card click,
   * which is the window the URL is already ahead in. A missing anchor is null,
   * not false: null degrades to the mutation-quiet wait, while false would
   * refuse every capture for good if this markup ever changed.
   */
  jobSettled(doc: Document, jobId: string): boolean | null {
    const root = detailRoot(doc);
    if (root === null) return null;
    const id = paneJobId(root);
    return id === null ? null : id === jobId;
  },

  /**
   * Information only: promoted listings are tracked like any other. The pane
   * carries no marker (0/3), so the signal is the result card for this job —
   * never a text scan of the root, which on layout B holds the promoted items
   * of the "Similar Jobs" section.
   */
  isPromoted(root: HTMLElement): boolean {
    const id = paneJobId(root);
    if (id === null) return false;
    const card = root.ownerDocument.querySelector(`[data-hook="job-result-card | ${id}"]`);
    return card !== null && PROMOTED.test(textOf(card));
  },

  isApplyButton(element: Element | null): boolean {
    if (!element) return false;
    // Deny before allow: the result cards, their bookmark and hide controls and
    // the similar-job bookmarks all sit in the same document, and the menu
    // behind "More actions for this job" opens beside the real control.
    if (element.closest(DENY) !== null) return false;

    const control = element.closest(APPLY);
    if (control === null) return false;
    const root = detailRoot(element.ownerDocument);
    return root !== null && root.contains(control);
  },

  /**
   * The banner asks "Did you apply to this job?" after an external apply, so
   * the user's answer in the page is the promotion signal. watchApplyClicks
   * checks this before isApplyButton, which is why "Yes" never logs as a
   * rejected apply click.
   */
  applyAnswer(element: Element): "yes" | "no" | null {
    const banner = element.closest(BANNER);
    if (banner === null) return null;
    const root = detailRoot(element.ownerDocument);
    if (root === null || !root.contains(banner)) return null;
    if (element.closest(ANSWER_YES) !== null) return "yes";
    if (element.closest(ANSWER_NO) !== null) return "no";
    return null;
  },

  /**
   * [data-hook="apply-modal-content"] is in the DOM before anything is
   * submitted and its success state was never observed, so returning it would
   * promote a row the moment the modal opens — marking an application the user
   * may still abandon. A false promotion is worse than none: the pending row is
   * resolved by the banner for external applies, and otherwise by the
   * extension's own question on the next job change.
   */
  successModal(): HTMLElement | null {
    return null;
  },

  /**
   * Only a preview (86–682 chars) is in the DOM; the rest loads when "More" is
   * clicked. The extension never clicks for the user, so the preview is what is
   * stored, and the control is stripped from a copy rather than from the page.
   */
  descriptionRoot(root: HTMLElement): Element | null {
    const heading = headingWithText(headingsOf(root), DESCRIPTION_HEADING);
    const box = heading?.parentElement?.nextElementSibling ?? null;
    if (box === null) return null;
    const copy = box.cloneNode(true) as Element;
    for (const button of copy.querySelectorAll(MORE_BUTTON)) button.remove();
    return copy;
  },

  readers: {
    /** The first /e/ link is the logo and names the employer; a later one's aria-label is the industry. */
    company(root: HTMLElement): string {
      const link = headerOf(root).find((element: Element): boolean =>
        element.matches(EMPLOYER_LINK),
      );
      return link === undefined ? "" : clean(link.getAttribute("aria-label") ?? "");
    },

    title(root: HTMLElement): string {
      const heading = root.querySelector("h1");
      return heading === null ? "" : textOf(heading);
    },

    /**
     * Modality plus the first location, e.g. "Seattle, WA (Onsite)", because
     * parseJob reads modality off locationRaw and never off the chip. Jobs
     * listing several places keep only the first — a draft holds one location.
     * TODO: drop the suffix once parseJob matches modality against jobTypeRaw.
     */
    location(root: HTMLElement): string {
      const row = glanceRow(leavesOf(glanceOf(root)), MODALITY_ROW);
      if (row === "") return "";
      const modality = MODALITY_ROW.exec(row)?.[1] ?? "";
      const place = PLACE.exec(row.replace(modality, ""))?.[1] ?? "";
      return place === "" ? modality : `${place} (${modality})`;
    },

    pay(root: HTMLElement): string {
      return glanceRow(leavesOf(glanceOf(root)), PAY_ROW);
    },

    /** "Internship · Part-time": the internship's own dates are left out of the field. */
    jobTypeChip(root: HTMLElement): string {
      const leaves = leavesOf(glanceOf(root));
      const kind = glanceRow(leaves, KIND_ROW);
      const schedule = SCHEDULE_ROW.exec(glanceRow(leaves, SCHEDULE_ROW))?.[1] ?? "";
      return [kind, schedule].filter((part: string): boolean => part !== "").join(" · ");
    },

    /**
     * "Posted 1 day ago∙Apply by November 20, 2026": the deadline is cut off
     * before the age is read, so it can never be mistaken for a post date.
     */
    datePosted(root: HTMLElement): string {
      const line = leavesOf(headerOf(root)).find((element: Element): boolean =>
        POSTED.test(textOf(element)),
      );
      if (line === undefined) return "";
      const age = textOf(line).split(SEPARATOR)[0] ?? "";
      return relativeToIso(age, new Date());
    },
  },

  /**
   * Handshake has no legacy layout and no class names, so there is nothing
   * honest to put in most of these lists — inventing selectors would be
   * guessing. The readers above do the work; an empty list simply yields "".
   */
  fields: {
    title: [{ css: "h1" }],
    company: [{ css: EMPLOYER_LINK, attr: "aria-label" }],
    location: [],
    pay: [],
    jobTypeChip: [],
    datePosted: [],
    description: [],
  },
};
