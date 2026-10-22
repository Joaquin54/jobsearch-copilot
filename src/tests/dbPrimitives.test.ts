import { beforeEach, expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

import {
  DB_NAME,
  DB_VERSION,
  IDX_COMPANY_KEY,
  IDX_DATE_APPLIED,
  IDX_STATUS_DATE,
  IDX_UPDATED_AT,
  STORE,
  bulkPut,
  countApplications,
  dayCounts,
  getMany,
  idsForCompany,
  latestUpdatedAt,
  listCompanies,
  openDb,
  promoteToApplied,
  queryApplications,
  resetConnection,
  scanKeys,
  upsertApplication,
} from "../lib/db.ts";
import { dayKeyOfIso } from "../lib/localDays.ts";
import type { ApplicationQuery, JobApplication, JobDraft, JobSource } from "../lib/types.ts";

const COMPANIES = ["Acme Corp", "Globex", "Initech"];

function draft(index: number): JobDraft {
  const source: JobSource = index % 2 === 0 ? "linkedin" : "indeed";
  return {
    source,
    nativeBoardId: `job-${index}`,
    url: `https://example.test/${index}`,
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

function query(overrides: Partial<ApplicationQuery> = {}): ApplicationQuery {
  return { sort: "dateApplied", direction: "desc", limit: 50, offset: 0, ...overrides };
}

/** 20 rows: day N for row N, every third row promoted to applied. */
beforeEach(async (): Promise<void> => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
  for (let i = 0; i < 20; i += 1) {
    const day = String(i + 1).padStart(2, "0");
    const when = `2026-09-${day}T12:00:00.000Z`;
    await upsertApplication(draft(i), when);
    if (i % 3 === 0) await promoteToApplied(`${draft(i).source}:job-${i}`, when);
  }
});

test("the date window bounds the query at both ends, upper bound exclusive", async (): Promise<void> => {
  const windowed = await queryApplications(
    query({ from: "2026-09-05T00:00:00.000Z", to: "2026-09-10T00:00:00.000Z" }),
  );
  // Sep 5 through Sep 9: Sep 10 is the first instant NOT included.
  expect(windowed.total).toBe(5);
  expect(windowed.rows[0]?.dateApplied).toBe("2026-09-09T12:00:00.000Z");
  expect(windowed.rows[4]?.dateApplied).toBe("2026-09-05T12:00:00.000Z");

  const withStatus = await queryApplications(
    query({ status: "applied", from: "2026-09-05T00:00:00.000Z" }),
  );
  expect(withStatus.rows.every((row: JobApplication): boolean => row.status === "applied")).toBe(
    true,
  );
  expect(withStatus.rows.every((row: JobApplication): boolean => row.dateApplied >= "2026-09-05")).toBe(
    true,
  );

  // No window means no behaviour change.
  expect((await queryApplications(query())).total).toBe(20);
});

test("countApplications counts natively, filtered and windowed", async (): Promise<void> => {
  expect(await countApplications()).toBe(20);
  expect(await countApplications({ status: "applied" })).toBe(7);
  expect(await countApplications({ status: "pending" })).toBe(13);
  expect(
    await countApplications({ from: "2026-09-05T00:00:00.000Z", to: "2026-09-10T00:00:00.000Z" }),
  ).toBe(5);
  expect(
    await countApplications({
      status: "applied",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-11T00:00:00.000Z",
    }),
  ).toBe(4);
});

test("dayCounts buckets by local day over the window", async (): Promise<void> => {
  const counts = await dayCounts({ status: "applied" });
  const total = [...counts.values()].reduce((sum: number, n: number): number => sum + n, 0);
  expect(total).toBe(7);
  // Each applied row is on its own day, bucketed locally.
  expect(counts.get(dayKeyOfIso("2026-09-01T12:00:00.000Z"))).toBe(1);
  expect([...counts.values()].every((n: number): boolean => n === 1)).toBe(true);

  const windowed = await dayCounts({
    status: "applied",
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-08T00:00:00.000Z",
  });
  expect([...windowed.values()].reduce((sum: number, n: number): number => sum + n, 0)).toBe(3);
});

test("dayCounts stops early when the caller goes stale", async (): Promise<void> => {
  let seen = 0;
  const counts = await dayCounts({}, (): boolean => {
    seen += 1;
    return seen > 3;
  });
  expect(counts.size).toBeLessThan(20);
});

test("scanKeys returns ids and keys for both statuses without reading records", async (): Promise<void> => {
  const all = await scanKeys();
  expect(all.length).toBe(20);
  expect(all.filter((key): boolean => key.status === "applied").length).toBe(7);
  expect(all.every((key): boolean => key.id.includes(":"))).toBe(true);

  const applied = await scanKeys({ status: "applied" });
  expect(applied.length).toBe(7);
  expect(applied[0]?.dateApplied).toBe("2026-09-01T12:00:00.000Z");
});

test("getMany reads only the ids asked for and drops missing ones", async (): Promise<void> => {
  const rows = await getMany(["linkedin:job-0", "indeed:job-1", "linkedin:nope"]);
  expect(rows.map((row: JobApplication): string => row.id)).toEqual([
    "linkedin:job-0",
    "indeed:job-1",
  ]);
  expect(await getMany([])).toEqual([]);
});

test("latestUpdatedAt is the newest updatedAt in the store", async (): Promise<void> => {
  expect(await latestUpdatedAt()).toBe("2026-09-20T12:00:00.000Z");

  // promoteToApplied bumps only updatedAt, so a late promotion of an old row
  // leads the field — the case the old dateApplied-sampled approximation missed.
  await promoteToApplied("indeed:job-1", "2027-01-01T00:00:00.000Z");
  expect(await latestUpdatedAt()).toBe("2027-01-01T00:00:00.000Z");
});

test("listCompanies is one entry per company, and idsForCompany comes off the index", async (): Promise<void> => {
  const companies = await listCompanies();
  expect(companies.map((option): string => option.companyKey).sort()).toEqual([
    "acme corp",
    "globex",
    "initech",
  ]);
  expect(companies.find((option): boolean => option.companyKey === "acme corp")?.company).toBe(
    "Acme Corp",
  );

  const ids = await idsForCompany("globex");
  expect(ids.length).toBe(7);
  const rows = await getMany(ids);
  expect(rows.every((row: JobApplication): boolean => row.companyKey === "globex")).toBe(true);
  expect(await idsForCompany("nobody")).toEqual([]);
});

test("bulkPut writes every record in one transaction", async (): Promise<void> => {
  const seeded: JobApplication[] = Array.from({ length: 50 }, (_, i: number) => ({
    ...draft(i),
    id: `linkedin:bulk-${i}`,
    nativeBoardId: `bulk-${i}`,
    source: "linkedin",
    companyKey: "bulk co",
    company: "Bulk Co",
    status: "applied",
    dateApplied: "2026-10-01T12:00:00.000Z",
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
  }));

  expect(await bulkPut(seeded)).toBe(50);
  expect(await countApplications({ from: "2026-10-01T00:00:00.000Z" })).toBe(50);
  expect(await bulkPut([])).toBe(0);
});

test("a v1 database upgrades in place, keeping its rows", async (): Promise<void> => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();

  // Build the v1 schema by hand, exactly as DB_VERSION 1 created it.
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (): void => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex(IDX_DATE_APPLIED, "dateApplied");
      store.createIndex(IDX_STATUS_DATE, ["status", "dateApplied"]);
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
  });

  const legacyRow: JobApplication = {
    ...draft(0),
    id: "linkedin:legacy",
    nativeBoardId: "legacy",
    companyKey: "acme corp",
    status: "applied",
    dateApplied: "2026-08-01T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
  };
  await new Promise<void>((resolve, reject) => {
    const tx = legacy.transaction([STORE], "readwrite");
    tx.objectStore(STORE).put(legacyRow);
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error);
  });
  legacy.close();

  const upgraded = await openDb();
  expect(upgraded.version).toBe(DB_VERSION);
  const names = [...upgraded.transaction([STORE], "readonly").objectStore(STORE).indexNames];
  expect(names.sort()).toEqual(
    [IDX_COMPANY_KEY, IDX_DATE_APPLIED, IDX_STATUS_DATE, IDX_UPDATED_AT].sort(),
  );

  // The row survives and is reachable through the new indexes.
  expect(await countApplications({ status: "applied" })).toBe(1);
  expect(await latestUpdatedAt()).toBe("2026-08-02T12:00:00.000Z");
  expect(await idsForCompany("acme corp")).toEqual(["linkedin:legacy"]);
});

test("an open connection yields to a later upgrade instead of blocking it", async (): Promise<void> => {
  // The popup and the dashboard both hold a connection while the worker
  // upgrades; without onversionchange this open would never fire.
  const held = await openDb();
  expect(held.version).toBe(DB_VERSION);

  const next = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION + 1);
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
    request.onblocked = (): void => reject(new Error("blocked by the held connection"));
  });

  expect(next.version).toBe(DB_VERSION + 1);
  // The handler closed the held connection, and the cached promise was dropped
  // so the next openDb reconnects rather than handing back a dead database.
  expect((): IDBTransaction => held.transaction([STORE], "readonly")).toThrow();
  next.close();
});
