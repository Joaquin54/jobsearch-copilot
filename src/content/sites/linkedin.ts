import { relativeToIso } from "../relativeDate.ts";
import type { FieldContext, SiteAdapter } from "./types.ts";

const JOB_PATH = /\/jobs\/view\/(\d+)/;
const PROMOTED = /(^|\s)promoted(\s|$)/i;
const APPLICATION_SENT = /application sent|your application was sent|application submitted/i;

/**
 * LinkedIn job pages are server-driven UI: class names are hashed atomic
 * classes that change between builds, so every hook here is an attribute the
 * server names on purpose — data-sdui-screen, componentkey, data-testid or
 * aria-label. The legacy class selectors are kept last so the pre-SDUI layout
 * still works if it ever comes back.
 */
const SCREEN_SEARCH = '[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"]';
const SCREEN_VIEW = '[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.JobDetails"]';
const LEGACY_ROOTS =
  ".jobs-search__job-details--wrapper, .job-view-layout, .jobs-details, main [class*='job-details']";

const ABOUT = '[componentkey^="JobDetails_AboutTheJob_"]';
const ABOUT_KEY = /^JobDetails_AboutTheJob_(.+)$/;
const DESCRIPTION_BOX = '[data-testid="expandable-text-box"]';
const MORE_BUTTON = 'button[data-testid="expandable-text-button"]';

const EASY_APPLY_LABEL = "Easy Apply to this job";
const EXTERNAL_APPLY_LABEL = "Apply on company website";
const EASY_APPLY_TEXT = /^\s*easy apply\b/i;
const DENY =
  '[componentkey^="job-card-component-ref"], [aria-label^="Save"], [aria-label^="Unsave"], [aria-label="More options"]';

const SEPARATORS_ONLY = /^[\s·•∙ .]*$/;
const APPLICANTS = /applicant|people clicked/i;
const POSTED = /\bago\b|^reposted\b|just now|\byesterday\b/i;
const MODALITY_CHIP = /^(on-?site|hybrid|remote)$/i;
const PAY_CHIP = /\$\s?\d/;
const APPLIED_STATUS = /^application status$/i;
const FINISHED_PROMPT = '[aria-label^="Did you finish applying?"]';
const FINISHED_ANSWER = /\b(yes|no)\s*$/i;
const APPLIED_SUBMITTED = /application submitted/i;

const TOP_CARD_CLIMB = 3;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function textOf(element: Element): string {
  return clean(element.textContent ?? "");
}

/** Only the element's own text nodes, so a wrapper never answers for its children. */
function ownText(element: Element): string {
  return clean(
    [...element.childNodes]
      .filter((node: ChildNode): boolean => node.nodeType === 3)
      .map((node: ChildNode): string => node.textContent ?? "")
      .join(" "),
  );
}

function aboutMarker(root: HTMLElement): Element | null {
  return root.querySelector(ABOUT);
}

function jobIdOf(marker: Element): string | null {
  const key = marker.getAttribute("componentkey") ?? marker.id;
  return ABOUT_KEY.exec(key)?.[1] ?? null;
}

/**
 * The meta line carries location, posting age and applicant count. It is the
 * one <p> in the top card whose own text is nothing but separators and that
 * holds at least two spans.
 */
function isMetaLine(element: Element): boolean {
  if (element.tagName !== "P") return false;
  const spans = [...element.children].filter((c: Element): boolean => c.tagName === "SPAN");
  if (spans.length < 2) return false;
  return SEPARATORS_ONLY.test(ownText(element));
}

function selfAndDescendants(element: Element): Element[] {
  return [element, ...element.querySelectorAll("*")];
}

/**
 * The job's own top card: the part of the pane before the About section.
 * Scoping to the About marker's own container rather than to the whole screen
 * root matters on /jobs/view/<id>/, where the root wraps the toolbar, the global
 * nav and the similar-job cards as well.
 */
function topCardOf(root: HTMLElement): readonly Element[] {
  const about = aboutMarker(root);
  if (!about) return [...root.querySelectorAll("*")];

  let container: Element | null = about.parentElement;
  let widest: readonly Element[] = [];
  for (let depth = 0; depth < TOP_CARD_CLIMB && container !== null; depth += 1) {
    const children = [...container.children];
    const cut = children.findIndex((c: Element): boolean => c === about || c.contains(about));
    const slice = (cut < 0 ? children : children.slice(0, cut)).flatMap(selfAndDescendants);
    if (slice.some(isMetaLine)) return slice;
    if (slice.length > widest.length) widest = slice;
    if (container === root) break;
    container = container.parentElement;
  }
  return widest;
}

function companyElement(card: readonly Element[]): Element | null {
  return (
    card.find((el: Element): boolean =>
      (el.getAttribute("aria-label") ?? "").startsWith("Company, "),
    ) ?? null
  );
}

function companyLink(card: readonly Element[]): Element | null {
  return (
    card.find(
      (el: Element): boolean =>
        el.tagName === "A" &&
        (el.getAttribute("href") ?? "").includes("/company/") &&
        textOf(el) !== "",
    ) ?? null
  );
}

type Meta = { location: string; posted: string };

/** Classified, not indexed: a job with no applicant count has one span fewer. */
function metaOf(card: readonly Element[]): Meta {
  const line = card.find(isMetaLine);
  if (!line) return { location: "", posted: "" };

  const values = [...line.children]
    .filter((c: Element): boolean => c.tagName === "SPAN")
    .map(textOf)
    .filter((t: string): boolean => t !== "" && !SEPARATORS_ONLY.test(t));

  let location = "";
  let posted = "";
  for (const value of values) {
    if (APPLICANTS.test(value)) continue;
    if (POSTED.test(value)) {
      if (posted === "") posted = value;
      continue;
    }
    if (location === "") location = value;
  }
  return { location, posted };
}

const APPLY_CONTROL = [
  `[aria-label="${EASY_APPLY_LABEL}"]`,
  `[aria-label="${EXTERNAL_APPLY_LABEL}"]`,
  // Structural co-signal for the external control, which is locale-independent.
  'a[href*="/safety/go/"][target="_blank"]',
].join(", ");

function isApplyControl(element: Element): boolean {
  return element.matches(APPLY_CONTROL);
}

/** Clicks land on the control's inner span or svg, which carry no label. */
function applyControlOf(element: Element): Element | null {
  return element.closest(APPLY_CONTROL);
}

function chipPath(element: Element): string {
  const href = element.getAttribute("href") ?? "";
  return (href.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0] ?? "").trim();
}

/** Filter by href, not by position: other links sit in the same range. */
function isChipLink(element: Element): boolean {
  if (element.tagName !== "A") return false;
  const path = chipPath(element);
  return /^\/jobs\/search-results\//.test(path) || /^\/jobs\/view\/\d+\/?$/.test(path);
}

function chipsOf(card: readonly Element[]): readonly string[] {
  const metaIndex = card.findIndex(isMetaLine);
  if (metaIndex < 0) return [];
  const applyIndex = card.findIndex(
    (el: Element, index: number): boolean => index > metaIndex && isApplyControl(el),
  );
  const end = applyIndex > metaIndex ? applyIndex : card.length;
  return card
    .slice(metaIndex + 1, end)
    .filter(isChipLink)
    .map(textOf)
    .filter((t: string): boolean => t !== "");
}

function detailRoot(doc: Document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>(SCREEN_SEARCH) ??
    doc.querySelector<HTMLElement>(SCREEN_VIEW) ??
    doc.querySelector<HTMLElement>(LEGACY_ROOTS)
  );
}

export const linkedinAdapter: SiteAdapter = {
  source: "linkedin",
  domain: "linkedin.com",

  matches(url: URL): boolean {
    return url.hostname.endsWith("linkedin.com");
  },

  jobId(url: URL, doc: Document): string | null {
    const fromQuery = url.searchParams.get("currentJobId");
    if (fromQuery !== null && fromQuery !== "") return fromQuery;
    const fromPath = JOB_PATH.exec(url.pathname);
    if (fromPath?.[1]) return fromPath[1];
    const marker = doc.querySelector(ABOUT);
    if (marker) return jobIdOf(marker);
    return doc.querySelector("[data-job-id]")?.getAttribute("data-job-id") ?? null;
  },

  detailRoot,

  /**
   * The About marker switches to the new id 0.7–1.8 s after a result card is
   * clicked, so it is the reliable "the pane is showing job X" signal.
   */
  jobSettled(doc: Document, jobId: string): boolean | null {
    const marker = doc.querySelector(ABOUT);
    if (!marker) return null;
    return jobIdOf(marker) === jobId;
  },

  /**
   * Promoted markup is unverified on the SDUI layout, and a false positive
   * silently drops a real application while a false negative costs nothing. So
   * the text scan runs only on the legacy pane, which it was written against.
   */
  isPromoted(root: HTMLElement): boolean {
    if (aboutMarker(root) !== null) return false;
    if (root.querySelector("[class*='promoted']") !== null) return true;
    return [...root.querySelectorAll("span, li, div")]
      .slice(0, 60)
      .some((node: Element): boolean => {
        const text = (node.textContent ?? "").trim();
        return text.length <= 20 && PROMOTED.test(text);
      });
  },

  isApplyButton(element: Element | null): boolean {
    if (!element) return false;

    // Deny before allow: result cards carry "Easy Apply" in their own text, and
    // Save / More options sit beside the real control.
    if (element.closest(DENY) !== null) return false;

    const doc = element.ownerDocument;
    const root = doc === null ? null : detailRoot(doc);
    if (root !== null) {
      const about = aboutMarker(root);
      if (about !== null && (about === element || about.contains(element))) return false;
      const card = topCardOf(root);
      const control = applyControlOf(element);
      if (control !== null && card.includes(control)) return true;
      if (card.includes(element) && EASY_APPLY_TEXT.test(element.textContent ?? "")) return true;
    }

    return element.closest(".jobs-apply-button, [data-live-test-job-apply-button]") !== null;
  },

  /**
   * Second promotion signal: an applied job shows its status and has no apply
   * control at all. Keyed on the absence of the control rather than on the
   * wrapper shape around the status text, which is hashed and unstable.
   */
  isApplied(doc: Document, jobId: string): boolean {
    const root = detailRoot(doc);
    if (!root) return false;
    const marker = aboutMarker(root);
    if (marker === null || jobIdOf(marker) !== jobId) return false;

    const card = topCardOf(root);
    const says = card.some((el: Element): boolean => {
      const own = ownText(el);
      return APPLIED_STATUS.test(own) || APPLIED_SUBMITTED.test(own);
    });
    if (!says) return false;
    return !card.some(isApplyControl);
  },

  /**
   * An external apply has no confirmation modal; LinkedIn asks "Did you finish
   * applying?" in the pane when the tab comes back instead. That answer is the
   * promotion signal for those jobs.
   */
  applyAnswer(element: Element): "yes" | "no" | null {
    const prompt = element.closest(FINISHED_PROMPT);
    if (prompt === null) return null;
    const doc = element.ownerDocument;
    const root = doc === null ? null : detailRoot(doc);
    if (root === null || !root.contains(prompt)) return null;
    const answer = FINISHED_ANSWER.exec(prompt.getAttribute("aria-label") ?? "")?.[1];
    if (answer === undefined) return null;
    return answer.toLowerCase() === "yes" ? "yes" : "no";
  },

  successModal(doc: Document): HTMLElement | null {
    for (const dialog of doc.querySelectorAll<HTMLElement>("[role='dialog'], .artdeco-modal")) {
      if (APPLICATION_SENT.test(dialog.textContent ?? "")) return dialog;
    }
    return null;
  },

  descriptionRoot(root: HTMLElement): Element | null {
    const box = root.querySelector(`${ABOUT} ${DESCRIPTION_BOX}`);
    if (!box) return null;
    // The whole text is already in the DOM — the clamp is CSS only — so the
    // "… more" control is stripped from a copy instead of being clicked.
    const copy = box.cloneNode(true) as Element;
    for (const button of copy.querySelectorAll(MORE_BUTTON)) button.remove();
    // Section headings arrive as <strong> directly inside the box, and
    // sectionize reads a bolded line as a heading only when it is alone in its
    // parent, so give each one a wrapper.
    for (const child of [...copy.children]) {
      if (child.tagName !== "STRONG" && child.tagName !== "B") continue;
      const wrapper = copy.ownerDocument.createElement("div");
      copy.replaceChild(wrapper, child);
      wrapper.appendChild(child);
    }
    return copy;
  },

  readers: {
    company(root: HTMLElement): string {
      const card = topCardOf(root);
      const labelled = companyElement(card);
      if (labelled) {
        const name = /^Company,\s*(.+?)\.?$/.exec(labelled.getAttribute("aria-label") ?? "")?.[1];
        if (name !== undefined && name.trim() !== "") return name.trim();
      }
      const link = companyLink(card);
      return link === null ? "" : textOf(link);
    },

    title(root: HTMLElement, ctx: FieldContext): string {
      const card = topCardOf(root);
      const metaIndex = card.findIndex(isMetaLine);
      if (metaIndex < 0) return "";
      const head = card.slice(0, metaIndex);

      const marker = aboutMarker(root);
      const id = (marker === null ? null : jobIdOf(marker)) ?? ctx.jobId;

      // Layout A puts the title inside a link to the job itself. Only above the
      // meta line: layout B's chips link to /jobs/view/<id>/ as well.
      if (id !== "") {
        const link = head.find(
          (el: Element): boolean =>
            el.tagName === "A" && (el.getAttribute("href") ?? "").includes(`/jobs/view/${id}/`),
        );
        if (link && textOf(link) !== "") return textOf(link);
      }

      // Layout B: the last element with its own text before the meta line.
      const company = companyElement(card);
      let found = "";
      for (const el of head) {
        const own = ownText(el);
        if (own === "") continue;
        if (el.closest("button") !== null) continue;
        if (el.closest('a[href*="/company/"]') !== null) continue;
        if (company !== null && (el === company || company.contains(el))) continue;
        found = own;
      }
      return found;
    },

    /**
     * Location plus the modality chip, e.g. "Boca Raton, FL (Hybrid)", because
     * parseJob reads modality off locationRaw and never off the chip. This is
     * the shape the pre-SDUI adapter produced too.
     * TODO: drop the suffix once parseJob matches modality against jobTypeRaw.
     */
    location(root: HTMLElement): string {
      const card = topCardOf(root);
      const { location } = metaOf(card);
      if (location === "") return "";
      const modality = chipsOf(card).find((chip: string): boolean => MODALITY_CHIP.test(chip));
      return modality === undefined ? location : `${location} (${modality})`;
    },

    pay(root: HTMLElement): string {
      return chipsOf(topCardOf(root)).find((chip: string): boolean => PAY_CHIP.test(chip)) ?? "";
    },

    jobTypeChip(root: HTMLElement): string {
      return chipsOf(topCardOf(root))
        .filter((chip: string): boolean => !PAY_CHIP.test(chip))
        .join(" · ");
    },

    datePosted(root: HTMLElement): string {
      const { posted } = metaOf(topCardOf(root));
      return posted === "" ? "" : relativeToIso(posted, new Date());
    },
  },

  fields: {
    title: [
      { css: ".job-details-jobs-unified-top-card__job-title" },
      { css: "h1.jobs-unified-top-card__job-title" },
      { css: "h1" },
    ],
    company: [
      { css: ".job-details-jobs-unified-top-card__company-name" },
      { css: ".jobs-unified-top-card__company-name" },
      { css: "a[href*='/company/']" },
    ],
    location: [
      { css: ".job-details-jobs-unified-top-card__primary-description-container" },
      { css: ".jobs-unified-top-card__bullet" },
      { css: "[class*='primary-description']" },
    ],
    pay: [
      { css: "[class*='salary']" },
      { css: "[class*='compensation']" },
      { css: ".job-details-preferences-and-skills__pill-text" },
    ],
    jobTypeChip: [
      { css: ".job-details-preferences-and-skills" },
      { css: "[class*='job-criteria']" },
      { css: "[class*='workplace-type']" },
    ],
    datePosted: [
      { css: "time", attr: "datetime" },
      { css: "[class*='posted-date']" },
    ],
    description: [
      { css: ".jobs-description__content" },
      { css: "#job-details" },
      { css: "[class*='jobs-box__html-content']" },
    ],
  },
};
