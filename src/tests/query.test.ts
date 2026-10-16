import { beforeEach, expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

import { promoteToApplied, queryApplications, resetConnection, upsertApplication } from "../lib/db.ts";
import type { ApplicationQuery, JobDraft, JobSource } from "../lib/types.ts";

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

test("default sort is dateApplied descending", async (): Promise<void> => {
  const { rows, total } = await queryApplications(query());
  expect(total).toBe(20);
  expect(rows).toHaveLength(20);
  expect(rows[0]?.dateApplied).toBe("2026-09-20T12:00:00.000Z");
  expect(rows[19]?.dateApplied).toBe("2026-09-01T12:00:00.000Z");
});

test("ascending direction reverses the order", async (): Promise<void> => {
  const { rows } = await queryApplications(query({ direction: "asc" }));
  expect(rows[0]?.dateApplied).toBe("2026-09-01T12:00:00.000Z");
});

test("status filter uses the compound index and stays ordered", async (): Promise<void> => {
  const applied = await queryApplications(query({ status: "applied" }));
  expect(applied.total).toBe(7);
  expect(applied.rows.every((r) => r.status === "applied")).toBe(true);
  expect(applied.rows[0]?.dateApplied).toBe("2026-09-19T12:00:00.000Z");

  const pending = await queryApplications(query({ status: "pending" }));
  expect(pending.total).toBe(13);
});

test("company and source are residual filters", async (): Promise<void> => {
  const byCompany = await queryApplications(query({ companyKey: "globex" }));
  expect(byCompany.total).toBe(7);
  expect(byCompany.rows.every((r) => r.company === "Globex")).toBe(true);

  const bySource = await queryApplications(query({ source: "indeed" }));
  expect(bySource.total).toBe(10);

  const both = await queryApplications(query({ source: "indeed", companyKey: "globex" }));
  expect(both.total).toBe(4);
});

test("limit and offset page through the result set", async (): Promise<void> => {
  const first = await queryApplications(query({ limit: 5 }));
  expect(first.rows).toHaveLength(5);
  expect(first.total).toBe(20);

  const second = await queryApplications(query({ limit: 5, offset: 5 }));
  expect(second.rows).toHaveLength(5);
  expect(second.total).toBe(20);
  expect(second.rows[0]?.id).not.toBe(first.rows[0]?.id);
});

test("total counts matches, not the whole store, when filters are combined", async (): Promise<void> => {
  const result = await queryApplications(query({ status: "applied", companyKey: "acme corp", limit: 2 }));
  expect(result.rows).toHaveLength(2);
  expect(result.total).toBe(7);
  expect(result.rows.every((r) => r.status === "applied" && r.companyKey === "acme corp")).toBe(true);
});
