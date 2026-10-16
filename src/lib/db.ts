import {
  applicationId,
  companyKeyOf,
  type ApplicationQuery,
  type IsoDate,
  type JobApplication,
  type JobDraft,
} from "./types.ts";

export const DB_NAME = "jobsearch-copilot";
export const DB_VERSION = 1;
export const STORE = "applications";

const IDX_DATE_APPLIED = "by_dateApplied";
const IDX_STATUS_DATE = "by_status_dateApplied";

export type UpsertResult =
  | { kind: "created"; id: string }
  | { kind: "updated"; id: string; changed: readonly (keyof JobApplication)[] };

let connection: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: IDBVersionChangeEvent): void => {
      const db = request.result;
      if (event.oldVersion < 1) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex(IDX_DATE_APPLIED, "dateApplied");
        store.createIndex(IDX_STATUS_DATE, ["status", "dateApplied"]);
      }
    };
    request.onsuccess = (): void => resolve(request.result);
    // A cached rejected promise would wedge every later call for the life of
    // the worker, so the connection is dropped on failure and retried.
    request.onerror = (): void => {
      connection = null;
      reject(request.error);
    };
    request.onblocked = (): void => {
      connection = null;
      reject(new Error("indexedDB open blocked by another connection"));
    };
  });
  return connection;
}

/** Test seam: drops the cached connection so a fresh indexedDB can be opened. */
export function resetConnection(): void {
  connection = null;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error);
    tx.onabort = (): void => reject(tx.error);
  });
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Existing wins on every field, with three exceptions: dateApplied and
 * updatedAt take `now`, and status only ever moves pending -> applied. Empty
 * existing fields are backfilled from the draft, so a capture taken through
 * rotted selectors can never degrade a healthier earlier one.
 */
function merge(
  existing: JobApplication,
  draft: JobDraft,
  now: IsoDate,
): { record: JobApplication; changed: (keyof JobApplication)[] } {
  const changed: (keyof JobApplication)[] = ["dateApplied", "updatedAt"];
  const record: JobApplication = { ...existing, dateApplied: now, updatedAt: now };

  const backfillable = [
    "url",
    "title",
    "company",
    "location",
    "jobType",
    "modality",
    "pay",
    "skills",
    "requirements",
    "datePosted",
  ] as const;

  for (const key of backfillable) {
    if (!isEmpty(record[key]) || isEmpty(draft[key])) continue;
    // Assigning field-by-field keeps each value's own type; the union of all
    // ten would otherwise widen to never.
    Object.assign(record, { [key]: draft[key] });
    changed.push(key);
  }

  if (!isEmpty(record.company) && record.companyKey !== companyKeyOf(record.company)) {
    record.companyKey = companyKeyOf(record.company);
    changed.push("companyKey");
  }

  return { record, changed };
}

export async function upsertApplication(draft: JobDraft, now: IsoDate): Promise<UpsertResult> {
  const db = await openDb();
  const id = applicationId(draft.source, draft.nativeBoardId);
  const tx = db.transaction([STORE], "readwrite");
  const store = tx.objectStore(STORE);

  const existing = await wrap<JobApplication | undefined>(store.get(id));

  if (!existing) {
    const record: JobApplication = {
      ...draft,
      id,
      companyKey: companyKeyOf(draft.company),
      status: "pending",
      dateApplied: now,
      createdAt: now,
      updatedAt: now,
    };
    await wrap(store.put(record));
    await done(tx);
    return { kind: "created", id };
  }

  const { record, changed } = merge(existing, draft, now);
  await wrap(store.put(record));
  await done(tx);
  return { kind: "updated", id, changed };
}

export async function promoteToApplied(id: string, now: IsoDate): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction([STORE], "readwrite");
  const store = tx.objectStore(STORE);
  const existing = await wrap<JobApplication | undefined>(store.get(id));
  if (!existing || existing.status === "applied") {
    tx.abort();
    return false;
  }
  await wrap(store.put({ ...existing, status: "applied", updatedAt: now }));
  await done(tx);
  return true;
}

export async function getApplication(id: string): Promise<JobApplication | null> {
  const db = await openDb();
  const store = db.transaction([STORE], "readonly").objectStore(STORE);
  const record = await wrap<JobApplication | undefined>(store.get(id));
  return record ?? null;
}

export async function deleteApplication(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE], "readwrite");
  await wrap(tx.objectStore(STORE).delete(id));
  await done(tx);
}

export async function listAll(): Promise<JobApplication[]> {
  const db = await openDb();
  const store = db.transaction([STORE], "readonly").objectStore(STORE);
  return await wrap<JobApplication[]>(store.getAll());
}

export async function countAll(): Promise<number> {
  const db = await openDb();
  const store = db.transaction([STORE], "readonly").objectStore(STORE);
  return await wrap<number>(store.count());
}

/**
 * Ordering is always by dateApplied, so the cursor runs over an index whose key
 * starts with it: by_status_dateApplied when status is filtered, by_dateApplied
 * otherwise. company/source are residual filters applied during the scan.
 */
export async function queryApplications(
  query: ApplicationQuery,
): Promise<{ rows: JobApplication[]; total: number }> {
  const db = await openDb();
  const store = db.transaction([STORE], "readonly").objectStore(STORE);
  const direction: IDBCursorDirection = query.direction === "desc" ? "prev" : "next";

  const index =
    query.status === undefined
      ? store.index(IDX_DATE_APPLIED)
      : store.index(IDX_STATUS_DATE);
  const range =
    query.status === undefined
      ? null
      : IDBKeyRange.bound([query.status, ""], [query.status, "￿"]);

  const rows: JobApplication[] = [];
  let total = 0;

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(range, direction);
    request.onerror = (): void => reject(request.error);
    request.onsuccess = (): void => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const record = cursor.value as JobApplication;
      const matches =
        (query.source === undefined || record.source === query.source) &&
        (query.companyKey === undefined || record.companyKey === query.companyKey);
      if (matches) {
        if (total >= query.offset && rows.length < query.limit) rows.push(record);
        total += 1;
      }
      cursor.continue();
    };
  });

  return { rows, total };
}

export async function wipeStore(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction([STORE], "readwrite");
  const store = tx.objectStore(STORE);
  const deleted = await wrap<number>(store.count());
  await wrap(store.clear());
  await done(tx);
  return deleted;
}
