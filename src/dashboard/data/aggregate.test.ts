import { beforeEach, expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

import { promoteToApplied, resetConnection, upsertApplication } from "../../lib/db.ts";
import type { JobDraft, JobSource } from "../../lib/types.ts";
import { monthRange, weekRange } from "../time/localDays.ts";
import { appliedDayCounts, countAllApplied, countApplied, latestUpdatedAt } from "./aggregate.ts";
import { buildCatalog, buildCompanyIndex, fetchByIds } from "./catalog.ts";

const COMPANIES = ["Acme Corp", "Globex", "Initech"];
const FRESH = (): boolean => false;

function draft(index: number): JobDraft {
  const source: JobSource = index % 2 === 0 ? "linkedin" : "indeed";
  return {
    source,
    nativeBoardId: `job-${index}`,
    url: `https://www.linkedin.com/jobs/view/${index}`,
    title: `Engineer ${index}`,
    company: COMPANIES[index % COMPANIES.length] as string,
    location: "Remote",
    jobType: "Full-Time",
    modality: "Remote",
    pay: null,
    skills: [],
    requirements: [],
    datePosted: null,
  };
}

/**
 * 20 records on consecutive local days of October 2026, every third promoted to
 * applied. Local noon, so the UTC instant stays on the same local day in any
 * western zone.
 */
beforeEach(async (): Promise<void> => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
  for (let i = 0; i < 20; i += 1) {
    const when = new Date(2026, 9, i + 1, 12, 0, 0).toISOString();
    await upsertApplication(draft(i), when);
    if (i % 3 === 0) await promoteToApplied(`${draft(i).source}:job-${i}`, when);
  }
});

test("only applied records are counted", async (): Promise<void> => {
  expect(await countAllApplied()).toBe(7);
});

test("day counts bucket applied records onto their local day", async (): Promise<void> => {
  const span = monthRange({ year: 2026, month: 9 });
  const counts = await appliedDayCounts(span.lo, span.hi, FRESH);
  expect([...counts.values()].reduce((a: number, b: number): number => a + b, 0)).toBe(7);
  expect(counts.get("2026-10-01")).toBe(1);
  expect(counts.get("2026-10-04")).toBe(1);
  // Oct 2 was never promoted, so it has no bucket at all.
  expect(counts.get("2026-10-02")).toBeUndefined();
});

test("the month range upper bound is exclusive", async (): Promise<void> => {
  const september = monthRange({ year: 2026, month: 8 });
  expect(await countApplied(september.lo, september.hi)).toBe(0);
  const october = monthRange({ year: 2026, month: 9 });
  expect(await countApplied(october.lo, october.hi)).toBe(7);
});

test("a week range counts only its own seven local days", async (): Promise<void> => {
  // Oct 4 2026 is a Sunday; that week covers Oct 4-10, holding applied on 4, 7 and 10.
  const week = weekRange(new Date(2026, 9, 6, 9, 0, 0));
  expect(await countApplied(week.lo, week.hi)).toBe(3);
});

test("the catalog is built from keys alone and ordered newest first", async (): Promise<void> => {
  const catalog = await buildCatalog(FRESH);
  expect(catalog.entries).toHaveLength(20);
  expect(catalog.entries[0]?.id).toBe("indeed:job-19");
  expect(catalog.entries[19]?.id).toBe("linkedin:job-0");
  expect((catalog.entries[0]?.dateApplied ?? "") > (catalog.entries[1]?.dateApplied ?? "")).toBe(
    true,
  );
});

test("source is recovered from the primary key", async (): Promise<void> => {
  const catalog = await buildCatalog(FRESH);
  expect(catalog.entries.filter((e): boolean => e.source === "linkedin")).toHaveLength(10);
  expect(catalog.entries.filter((e): boolean => e.source === "indeed")).toHaveLength(10);
  for (const entry of catalog.entries) {
    expect(entry.id.startsWith(`${entry.source}:`)).toBe(true);
  }
});

test("status comes through the compound key", async (): Promise<void> => {
  const catalog = await buildCatalog(FRESH);
  expect(catalog.entries.filter((e): boolean => e.status === "applied")).toHaveLength(7);
  expect(catalog.entries.filter((e): boolean => e.status === "pending")).toHaveLength(13);
});

test("the company index dedupes by key and keeps the original casing", async (): Promise<void> => {
  const companies = await buildCompanyIndex(FRESH);
  expect(companies.options.map((option): string => option.company)).toEqual([
    "Acme Corp",
    "Globex",
    "Initech",
  ]);
  expect(companies.options.map((option): string => option.companyKey)).toEqual([
    "acme corp",
    "globex",
    "initech",
  ]);
  expect(companies.byId.get("linkedin:job-0")).toBe("acme corp");
});

test("rows are fetched by id in the order requested", async (): Promise<void> => {
  const rows = await fetchByIds(["indeed:job-19", "linkedin:job-0"]);
  expect(rows.map((row): string => row.id)).toEqual(["indeed:job-19", "linkedin:job-0"]);
});

test("a missing id drops out instead of yielding a hole", async (): Promise<void> => {
  const rows = await fetchByIds(["linkedin:job-0", "linkedin:does-not-exist"]);
  expect(rows).toHaveLength(1);
});

test("fetching nothing touches no transaction", async (): Promise<void> => {
  expect(await fetchByIds([])).toEqual([]);
});

test("a stale scan resolves early rather than completing", async (): Promise<void> => {
  const catalog = await buildCatalog((): boolean => true);
  expect(catalog.entries).toHaveLength(0);
});

test("newest updatedAt reflects the latest write", async (): Promise<void> => {
  const newest = await latestUpdatedAt();
  // job-19 is the last upsert in the fixture, and upsert writes updatedAt too.
  expect(newest).toBe(new Date(2026, 9, 20, 12, 0, 0).toISOString());
});

test("newest updatedAt is null on an empty store", async (): Promise<void> => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
  expect(await latestUpdatedAt()).toBe(null);
});
