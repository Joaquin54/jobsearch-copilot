import { beforeEach, expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

import {
  deleteApplication,
  getApplication,
  promoteToApplied,
  resetConnection,
  upsertApplication,
  wipeStore,
} from "../lib/db.ts";
import type { JobDraft } from "../lib/types.ts";

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-08T10:00:00.000Z";

function draft(overrides: Partial<JobDraft> = {}): JobDraft {
  return {
    source: "linkedin",
    nativeBoardId: "4012345678",
    url: "https://www.linkedin.com/jobs/view/4012345678/",
    title: "Senior Backend Engineer",
    company: "Acme Corp",
    location: "Toronto, ON",
    jobType: "Full-Time",
    modality: "Hybrid",
    pay: "$120,000–$150,000 / year",
    skills: ["TypeScript", "PostgreSQL"],
    requirements: ["5 years experience"],
    datePosted: "2026-09-28T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach((): void => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
});

test("first upsert creates a pending row", async (): Promise<void> => {
  const result = await upsertApplication(draft(), T1);
  expect(result.kind).toBe("created");
  expect(result.id).toBe("linkedin:4012345678");

  const row = await getApplication("linkedin:4012345678");
  expect(row?.status).toBe("pending");
  expect(row?.dateApplied).toBe(T1);
  expect(row?.createdAt).toBe(T1);
  expect(row?.companyKey).toBe("acme corp");
});

test("re-apply updates dateApplied only, keeping the earlier capture", async (): Promise<void> => {
  await upsertApplication(draft(), T1);
  const result = await upsertApplication(draft({ title: "Backend Eng (rotted selector)" }), T2);

  expect(result.kind).toBe("updated");
  const row = await getApplication("linkedin:4012345678");
  expect(row?.title).toBe("Senior Backend Engineer");
  expect(row?.dateApplied).toBe(T2);
  expect(row?.createdAt).toBe(T1);
  expect(row?.updatedAt).toBe(T2);
});

test("empty fields are backfilled by a later, healthier capture", async (): Promise<void> => {
  await upsertApplication(draft({ pay: null, skills: [], location: "" }), T1);
  await upsertApplication(draft({ pay: "$95/hr", skills: ["Go"], location: "Remote" }), T2);

  const row = await getApplication("linkedin:4012345678");
  expect(row?.pay).toBe("$95/hr");
  expect(row?.skills).toEqual(["Go"]);
  expect(row?.location).toBe("Remote");
});

test("applied never demotes to pending", async (): Promise<void> => {
  await upsertApplication(draft(), T1);
  expect(await promoteToApplied("linkedin:4012345678", T1)).toBe(true);
  await upsertApplication(draft(), T2);

  const row = await getApplication("linkedin:4012345678");
  expect(row?.status).toBe("applied");
  expect(row?.dateApplied).toBe(T2);
});

test("promote is idempotent and a missing row reports false", async (): Promise<void> => {
  await upsertApplication(draft(), T1);
  await promoteToApplied("linkedin:4012345678", T1);
  expect(await promoteToApplied("linkedin:4012345678", T2)).toBe(false);
  expect(await promoteToApplied("indeed:nope", T2)).toBe(false);
});

test("concurrent upserts of one id leave a single row", async (): Promise<void> => {
  await Promise.all([
    upsertApplication(draft(), T1),
    upsertApplication(draft({ title: "Other" }), T2),
  ]);
  expect(await wipeStore()).toBe(1);
});

test("delete removes the row", async (): Promise<void> => {
  await upsertApplication(draft(), T1);
  await deleteApplication("linkedin:4012345678");
  expect(await getApplication("linkedin:4012345678")).toBeNull();
});
