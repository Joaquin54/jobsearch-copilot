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

export type FieldContext = { jobId: string; doc: Document };

/** Returns "" when its structural anchor is missing, never a guess. */
export type FieldReader = (root: HTMLElement, ctx: FieldContext) => string;

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
  /** Tried before `fields`, for markup no selector list can express. */
  readonly readers?: Readonly<Partial<Record<FieldName, FieldReader>>>;
  descriptionRoot?(root: HTMLElement, ctx: FieldContext): Element | null;
  /** Second promotion signal: the page itself says the application is in. */
  isApplied?(doc: Document, jobId: string): boolean;
  /** null = no such signal on this page; the caller falls back to mutation quiet. */
  jobSettled?(doc: Document, jobId: string): boolean | null;
  /** The site's own post-apply question, answered by the user in the page. */
  applyAnswer?(element: Element): "yes" | "no" | null;
};
