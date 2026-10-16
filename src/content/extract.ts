/* Grab title, company, location, description — then hand the prose to the parsers. */
import type { JobDraft } from "../lib/types.ts";
import { parseJob } from "../parser/index.ts";
import { sectionize } from "./boundaries.ts";
import type { FieldName, Selector, SiteAdapter } from "./sites/index.ts";

export const DEBUG = false;

export type ExtractOutcome =
  | { ok: true; draft: JobDraft; via: Partial<Record<FieldName, number>> }
  | { ok: false; reason: "no-root" | "promoted" | "missing-required" };

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Walks the candidate list in order and returns the first non-empty hit, with
 * the index that produced it. Each candidate is tried in isolation so one bad
 * selector string cannot take down the extraction.
 */
export function pickText(
  root: ParentNode,
  candidates: readonly Selector[],
): { text: string; index: number } {
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index] as Selector;
    try {
      if (candidate.label) {
        const labelled = [...root.querySelectorAll("dt, th, span, strong")].find(
          (node: Element): boolean => candidate.label?.test(clean(node.textContent ?? "")) ?? false,
        );
        const value = labelled?.nextElementSibling?.textContent ?? "";
        if (clean(value) !== "") return { text: clean(value), index };
        continue;
      }

      const element = root.querySelector(candidate.css);
      if (!element) continue;
      const raw = candidate.attr
        ? (element.getAttribute(candidate.attr) ?? "")
        : (element.textContent ?? "");
      if (clean(raw) !== "") return { text: clean(raw), index };
    } catch {
      // Malformed selector or detached node: try the next candidate.
    }
  }
  return { text: "", index: -1 };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function extract(adapter: SiteAdapter, jobId: string, url: string): ExtractOutcome {
  const root = safe((): HTMLElement | null => adapter.detailRoot(document), null);
  if (!root) return { ok: false, reason: "no-root" };

  // An ad must never be parsed, so a thrown check counts as promoted.
  if (safe((): boolean => adapter.isPromoted(root), true)) return { ok: false, reason: "promoted" };

  const via: Partial<Record<FieldName, number>> = {};
  const read = (field: FieldName): string => {
    const hit = pickText(root, adapter.fields[field]);
    if (hit.index >= 0) via[field] = hit.index;
    return hit.text;
  };

  const title = read("title");
  const company = read("company");
  if (title === "" || company === "") return { ok: false, reason: "missing-required" };

  const location = read("location");
  const payRaw = read("pay");
  const jobTypeRaw = read("jobTypeChip");
  const datePosted = read("datePosted");

  const descriptionRoot =
    safe((): Element | null => {
      const hit = adapter.fields.description.find((c: Selector): boolean =>
        Boolean(root.querySelector(c.css)),
      );
      return hit ? root.querySelector(hit.css) : null;
    }, null) ?? root;

  const sections = safe(() => sectionize(descriptionRoot), {
    description: "",
    requirements: [],
    qualifications: [],
    benefits: [],
  });

  const parsed = parseJob({ sections, payRaw, titleRaw: title, locationRaw: location, jobTypeRaw });

  const draft: JobDraft = {
    source: adapter.source,
    nativeBoardId: jobId,
    url,
    title,
    company,
    location,
    jobType: parsed.jobType,
    modality: parsed.modality,
    pay: parsed.pay,
    skills: parsed.skills,
    requirements: parsed.requirements,
    datePosted: toIsoOrNull(datePosted),
  };

  if (DEBUG) console.log("[jobsearch-copilot] extracted via", via, draft);
  return { ok: true, draft, via };
}

function toIsoOrNull(value: string): string | null {
  if (value === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
