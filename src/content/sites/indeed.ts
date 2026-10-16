import type { SiteAdapter } from "./types.ts";

const SPONSORED = /(^|\s)sponsored(\s|$)/i;

export const indeedAdapter: SiteAdapter = {
  source: "indeed",
  domain: "indeed.com",

  matches(url: URL): boolean {
    return url.hostname.endsWith("indeed.com");
  },

  jobId(url: URL, doc: Document): string | null {
    const jk = url.searchParams.get("jk");
    if (jk !== null && jk !== "") return jk;
    const vjk = url.searchParams.get("vjk");
    if (vjk !== null && vjk !== "") return vjk;
    return doc.querySelector("[data-jk]")?.getAttribute("data-jk") ?? null;
  },

  detailRoot(doc: Document): HTMLElement | null {
    const direct = doc.querySelector<HTMLElement>(
      ".jobsearch-ViewJobLayout-jobDisplay, .fastviewjob, [class*='ViewJobLayout']",
    );
    if (direct) return direct;
    const description = doc.querySelector("#jobDescriptionText");
    return description?.closest<HTMLElement>("[class*='ViewJob'], main") ?? null;
  },

  isPromoted(root: HTMLElement): boolean {
    if (root.querySelector("[data-testid*='sponsored'], [class*='sponsored']") !== null) return true;
    return [...root.querySelectorAll("span, div")].slice(0, 60).some((node: Element): boolean => {
      const text = (node.textContent ?? "").trim();
      return text.length <= 20 && SPONSORED.test(text);
    });
  },

  isApplyButton(element: Element | null): boolean {
    if (!element) return false;
    if (
      element.closest("#indeedApplyButton, [id^='indeedApply'], .indeed-apply-button, [class*='IndeedApplyButton']") !==
      null
    ) {
      return true;
    }
    return /^\s*apply (?:now|on company site)\b/i.test(element.textContent ?? "");
  },

  /**
   * Indeed Apply leaves for smartapply.indeed.com, a different app with no job
   * detail root, so there is no modal to observe. Promotion happens through the
   * navigate-away question instead.
   */
  successModal(): HTMLElement | null {
    return null;
  },

  fields: {
    title: [
      { css: "h1.jobsearch-JobInfoHeader-title" },
      { css: "[data-testid='jobsearch-JobInfoHeader-title']" },
      { css: "h1" },
    ],
    company: [
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
    description: [{ css: "#jobDescriptionText" }, { css: "[class*='jobsearch-JobComponent-description']" }],
  },
};
