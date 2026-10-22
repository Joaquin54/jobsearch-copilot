import type { ApplicationStatus, JobSource } from "../../lib/types.ts";
import type { Catalog, CatalogEntry, CompanyIndex } from "./catalog.ts";

export type TableFilters = {
  status: ApplicationStatus | "all";
  source: JobSource | "all";
  companyKey: string | null;
};

export type SortDirection = "asc" | "desc";

export type PageRef = { index: number; size: number };

export function hasActiveFilter(filters: TableFilters): boolean {
  return filters.status !== "all" || filters.source !== "all" || filters.companyKey !== null;
}

export function matches(
  entry: CatalogEntry,
  filters: TableFilters,
  companies: CompanyIndex | null,
): boolean {
  if (filters.status !== "all" && entry.status !== filters.status) return false;
  if (filters.source !== "all" && entry.source !== filters.source) return false;
  if (filters.companyKey !== null) {
    // Until the company index has loaded no row can be attributed to a company,
    // so the filter matches nothing rather than silently matching everything.
    if (companies === null) return false;
    if (companies.byId.get(entry.id) !== filters.companyKey) return false;
  }
  return true;
}

/** Entries that pass the filters, still in catalog order (dateApplied desc). */
export function selectMatches(
  catalog: Catalog,
  filters: TableFilters,
  companies: CompanyIndex | null,
): readonly CatalogEntry[] {
  return catalog.entries.filter((entry: CatalogEntry): boolean =>
    matches(entry, filters, companies),
  );
}

/**
 * The matched list is descending. Ascending order is served by indexing from
 * the tail rather than reversing the whole array, so only the page-sized window
 * is ever copied.
 */
export function selectPageIds(
  matched: readonly CatalogEntry[],
  direction: SortDirection,
  page: PageRef,
): readonly string[] {
  const total = matched.length;
  const from = page.index * page.size;
  if (from >= total) return [];
  const to = Math.min(from + page.size, total);

  const window: string[] = [];
  if (direction === "desc") {
    for (let i = from; i < to; i += 1) {
      const entry = matched[i];
      if (entry) window.push(entry.id);
    }
    return window;
  }
  for (let i = total - 1 - from; i >= total - to; i -= 1) {
    const entry = matched[i];
    if (entry) window.push(entry.id);
  }
  return window;
}

export function selectAllIds(
  matched: readonly CatalogEntry[],
  direction: SortDirection,
): readonly string[] {
  const ids = matched.map((entry: CatalogEntry): string => entry.id);
  return direction === "desc" ? ids : ids.reverse();
}

export function pageCount(total: number, size: number): number {
  return total === 0 ? 1 : Math.ceil(total / size);
}

export function clampPageIndex(index: number, total: number, size: number): number {
  return Math.min(Math.max(index, 0), pageCount(total, size) - 1);
}
