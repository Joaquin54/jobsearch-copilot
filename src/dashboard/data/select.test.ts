import { expect, test } from "bun:test";

import type { Catalog, CatalogEntry, CompanyIndex } from "./catalog.ts";
import {
  clampPageIndex,
  hasActiveFilter,
  pageCount,
  selectAllIds,
  selectMatches,
  selectPageIds,
  type TableFilters,
} from "./select.ts";

/** 20 entries, newest first, alternating source, every third applied. */
function catalog(): Catalog {
  const entries: CatalogEntry[] = [];
  for (let i = 19; i >= 0; i -= 1) {
    const source = i % 2 === 0 ? "linkedin" : "indeed";
    const day = String(i + 1).padStart(2, "0");
    entries.push({
      id: `${source}:job-${i}`,
      status: i % 3 === 0 ? "applied" : "pending",
      source,
      dateApplied: `2026-09-${day}T12:00:00.000Z`,
      day: `2026-09-${day}`,
    });
  }
  return { entries };
}

function filters(overrides: Partial<TableFilters> = {}): TableFilters {
  return { status: "all", source: "all", companyKey: null, ...overrides };
}

const companies: CompanyIndex = {
  options: [{ companyKey: "acme corp", company: "Acme Corp" }],
  byId: new Map<string, string>([
    ["linkedin:job-0", "acme corp"],
    ["indeed:job-1", "globex"],
  ]),
};

test("catalog order is dateApplied descending", (): void => {
  const entries = catalog().entries;
  expect(entries[0]?.dateApplied).toBe("2026-09-20T12:00:00.000Z");
  expect(entries[19]?.dateApplied).toBe("2026-09-01T12:00:00.000Z");
});

test("no filter matches everything", (): void => {
  expect(selectMatches(catalog(), filters(), null)).toHaveLength(20);
  expect(hasActiveFilter(filters())).toBe(false);
});

test("status and source filter independently and together", (): void => {
  const base = catalog();
  expect(selectMatches(base, filters({ status: "applied" }), null)).toHaveLength(7);
  expect(selectMatches(base, filters({ status: "pending" }), null)).toHaveLength(13);
  expect(selectMatches(base, filters({ source: "indeed" }), null)).toHaveLength(10);
  // 7 applied, of which the 4 with an even index are LinkedIn.
  expect(
    selectMatches(base, filters({ status: "applied", source: "linkedin" }), null),
  ).toHaveLength(4);
});

test("a company filter matches nothing until the company index loads", (): void => {
  const base = catalog();
  expect(selectMatches(base, filters({ companyKey: "acme corp" }), null)).toHaveLength(0);
  expect(selectMatches(base, filters({ companyKey: "acme corp" }), companies)).toHaveLength(1);
});

test("any active filter is reported", (): void => {
  expect(hasActiveFilter(filters({ status: "applied" }))).toBe(true);
  expect(hasActiveFilter(filters({ source: "indeed" }))).toBe(true);
  expect(hasActiveFilter(filters({ companyKey: "acme corp" }))).toBe(true);
});

test("paging windows the matches and the total ignores the page", (): void => {
  const matched = selectMatches(catalog(), filters(), null);
  const first = selectPageIds(matched, "desc", { index: 0, size: 5 });
  const second = selectPageIds(matched, "desc", { index: 1, size: 5 });
  expect(first).toHaveLength(5);
  expect(second).toHaveLength(5);
  expect(first[0]).not.toBe(second[0]);
  expect(matched).toHaveLength(20);
});

test("ascending is the exact reverse of descending", (): void => {
  const matched = selectMatches(catalog(), filters(), null);
  const desc = selectPageIds(matched, "desc", { index: 0, size: 20 });
  const asc = selectPageIds(matched, "asc", { index: 0, size: 20 });
  expect(asc).toEqual([...desc].reverse());
});

test("the first ascending page holds the oldest rows", (): void => {
  const matched = selectMatches(catalog(), filters(), null);
  expect(selectPageIds(matched, "asc", { index: 0, size: 3 })).toEqual([
    "linkedin:job-0",
    "indeed:job-1",
    "linkedin:job-2",
  ]);
});

test("a short final page is not padded", (): void => {
  const matched = selectMatches(catalog(), filters(), null);
  expect(selectPageIds(matched, "desc", { index: 2, size: 8 })).toHaveLength(4);
  expect(selectPageIds(matched, "asc", { index: 2, size: 8 })).toHaveLength(4);
});

test("a page past the end is empty", (): void => {
  const matched = selectMatches(catalog(), filters(), null);
  expect(selectPageIds(matched, "desc", { index: 9, size: 25 })).toEqual([]);
});

test("selectAllIds covers every match in display order", (): void => {
  const matched = selectMatches(catalog(), filters(), null);
  const all = selectAllIds(matched, "desc");
  expect(all).toHaveLength(20);
  expect(all[0]).toBe("indeed:job-19");
  expect(selectAllIds(matched, "asc")[0]).toBe("linkedin:job-0");
});

test("page counts and clamping never go out of range", (): void => {
  expect(pageCount(0, 25)).toBe(1);
  expect(pageCount(20, 25)).toBe(1);
  expect(pageCount(26, 25)).toBe(2);
  expect(clampPageIndex(5, 20, 25)).toBe(0);
  expect(clampPageIndex(-3, 100, 25)).toBe(0);
  expect(clampPageIndex(99, 100, 25)).toBe(3);
});
