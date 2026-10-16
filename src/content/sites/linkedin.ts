import type { SiteAdapter } from "./types.ts";

const JOB_PATH = /\/jobs\/view\/(\d+)/;
const PROMOTED = /(^|\s)promoted(\s|$)/i;
const APPLICATION_SENT = /application sent|your application was sent|application submitted/i;

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
    return doc.querySelector("[data-job-id]")?.getAttribute("data-job-id") ?? null;
  },

  detailRoot(doc: Document): HTMLElement | null {
    return doc.querySelector<HTMLElement>(
      ".jobs-search__job-details--wrapper, .job-view-layout, .jobs-details, main [class*='job-details']",
    );
  },

  isPromoted(root: HTMLElement): boolean {
    if (root.querySelector("[class*='promoted']") !== null) return true;
    // "Promoted" sits on its own short node near the top of the pane.
    return [...root.querySelectorAll("span, li, div")]
      .slice(0, 60)
      .some((node: Element): boolean => {
        const text = (node.textContent ?? "").trim();
        return text.length <= 20 && PROMOTED.test(text);
      });
  },

  isApplyButton(element: Element | null): boolean {
    if (!element) return false;
    if (element.closest(".jobs-apply-button, [data-live-test-job-apply-button]") !== null) {
      return true;
    }
    return /^\s*easy apply\b/i.test(element.textContent ?? "");
  },

  successModal(doc: Document): HTMLElement | null {
    for (const dialog of doc.querySelectorAll<HTMLElement>("[role='dialog'], .artdeco-modal")) {
      if (APPLICATION_SENT.test(dialog.textContent ?? "")) return dialog;
    }
    return null;
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
