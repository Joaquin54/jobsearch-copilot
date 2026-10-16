import type { JobSource, SupportedDomain } from "../../lib/types.ts";

/** One ordered fallback candidate. Tried in array order; first non-empty wins. */
export type Selector = {
  css: string;
  /** Read this attribute instead of textContent. */
  attr?: string;
  /** Label/value fallback: match the label, take the next sibling's text. */
  label?: RegExp;
};

export type FieldName =
  | "title"
  | "company"
  | "location"
  | "pay"
  | "jobTypeChip"
  | "datePosted"
  | "description";

export type SiteAdapter = {
  readonly source: JobSource;
  readonly domain: SupportedDomain;
  matches(url: URL): boolean;
  /** null means "not a job detail context" — search list, feed or rail. */
  jobId(url: URL, doc: Document): string | null;
  detailRoot(doc: Document): HTMLElement | null;
  isPromoted(root: HTMLElement): boolean;
  isApplyButton(element: Element | null): boolean;
  /** Post-apply confirmation, where the site has an observable one. */
  successModal(doc: Document): HTMLElement | null;
  readonly fields: Readonly<Record<FieldName, readonly Selector[]>>;
};
