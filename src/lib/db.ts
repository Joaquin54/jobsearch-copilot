import { dayKeyOfIso, type DayKey } from "./localDays.ts";
import {
  applicationId,
  companyKeyOf,
  type ApplicationQuery,
  type ApplicationStatus,
  type IsoDate,
  type JobApplication,
  type JobDraft,
} from "./types.ts";

export const DB_NAME = "jobsearch-copilot";
export const DB_VERSION = 2;
export const STORE = "applications";

export const IDX_DATE_APPLIED = "by_dateApplied";
export const IDX_STATUS_DATE = "by_status_dateApplied";
export const IDX_UPDATED_AT = "by_updatedAt";
export const IDX_COMPANY_KEY = "by_companyKey";

/** Highest code point: the open upper bound of any string key. */
export const MAX_KEY = "￿";

export type UpsertResult =
  | { kind: "created"; id: string }
  | { kind: "updated"; id: string; changed: readonly (keyof JobApplication)[] };

/**
 * A status equality and/or a half-open dateApplied window: `to` is the first
 * instant NOT included. dateApplied is ISO-8601 UTC, where lexicographic order
 * is chronological, so the bounds go straight into an IDBKeyRange.
 */
export type ScanFilter = {
  status?: ApplicationStatus;
  from?: IsoDate;
  to?: IsoDate;
};

/** What a key-only scan can report without deserializing a record. */
export type ScanKey = {
  id: string;
  status: ApplicationStatus;
  dateApplied: IsoDate;
};

export type CompanyOption = { companyKey: string; company: string };

let connection: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: IDBVersionChangeEvent): void => {
      const db = request.result;
      // On an upgrade the store already exists, so it comes from the
      // version-change transaction rather than being created again.
      const store =
        event.oldVersion < 1
          ? db.createObjectStore(STORE, { keyPath: "id" })
          : request.transaction!.objectStore(STORE);
      if (event.oldVersion < 1) {
        store.createIndex(IDX_DATE_APPLIED, "dateApplied");
        store.createIndex(IDX_STATUS_DATE, ["status", "dateApplied"]);
      }
      if (event.oldVersion < 2) {
        store.createIndex(IDX_UPDATED_AT, "updatedAt");
        store.createIndex(IDX_COMPANY_KEY, "companyKey");
      }
    };
    request.onsuccess = (): void => {
      const db = request.result;
      // Three contexts hold a connection (worker, popup, dashboard). Without
      // this, the next upgrade is blocked by whichever page happens to be open
      // and every openDb in it rejects; yielding lets the upgrade through.
      db.onversionchange = (): void => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
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

/**
 * The index and key range for a filter. A compound [status, dateApplied] key
 * compares element-wise, so an identical status in both bounds collapses the
 * range to that status plus the date window — one bound does both jobs.
 */
function scanTarget(
  store: IDBObjectStore,
  filter: ScanFilter,
): { index: IDBIndex; range: IDBKeyRange } {
  const from = filter.from ?? "";
  const to = filter.to ?? MAX_KEY;
  if (filter.status === undefined) {
    return {
      index: store.index(IDX_DATE_APPLIED),
      range: IDBKeyRange.bound(from, to, false, true),
    };
  }
  return {
    index: store.index(IDX_STATUS_DATE),
    range: IDBKeyRange.bound([filter.status, from], [filter.status, to], false, true),
  };
}

function readIndex(db: IDBDatabase, filter: ScanFilter): { index: IDBIndex; range: IDBKeyRange } {
  return scanTarget(db.transaction([STORE], "readonly").objectStore(STORE), filter);
}

/**
 * Walks index keys only. cursor.value is never touched, so no record is
 * deserialized, and each step is its own task — the scan never forms one long
 * task however large the store is.
 */
function walkKeys(
  index: IDBIndex,
  range: IDBKeyRange | null,
  direction: IDBCursorDirection,
  onKey: (key: IDBValidKey, primaryKey: IDBValidKey) => void,
  isStale?: () => boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = index.openKeyCursor(range, direction);
    request.onerror = (): void => reject(request.error);
    request.onsuccess = (): void => {
      const cursor = request.result;
      if (!cursor || isStale?.()) {
        resolve();
        return;
      }
      onKey(cursor.key, cursor.primaryKey);
      cursor.continue();
    };
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

/** dateApplied out of either index key shape: [status, dateApplied] or plain. */
function isoOf(key: IDBValidKey): IsoDate {
  return Array.isArray(key) ? String(key[1]) : String(key);
}

/**
 * A native count over the index — no cursor stepping and no deserialization,
 * so a whole-store total costs single-digit milliseconds at 5k records.
 */
export async function countApplications(filter: ScanFilter = {}): Promise<number> {
  const db = await openDb();
  const { index, range } = readIndex(db, filter);
  return await wrap<number>(index.count(range));
}

/** Per-local-day counts over one window, from index keys alone. */
export async function dayCounts(
  filter: ScanFilter = {},
  isStale?: () => boolean,
): Promise<Map<DayKey, number>> {
  const db = await openDb();
  const { index, range } = readIndex(db, filter);
  const counts = new Map<DayKey, number>();

  await walkKeys(
    index,
    range,
    "next",
    (key: IDBValidKey): void => {
      const day = dayKeyOfIso(isoOf(key));
      counts.set(day, (counts.get(day) ?? 0) + 1);
    },
    isStale,
  );

  return counts;
}

/**
 * Id, status and dateApplied for every matching record, without reading one.
 * Both statuses are walked separately when none is given, because the compound
 * index orders by status first and a single range cannot span the two.
 */
export async function scanKeys(
  filter: ScanFilter = {},
  isStale?: () => boolean,
): Promise<ScanKey[]> {
  const db = await openDb();
  const statuses: ApplicationStatus[] =
    filter.status === undefined ? ["applied", "pending"] : [filter.status];
  const rows: ScanKey[] = [];

  for (const status of statuses) {
    const { index, range } = readIndex(db, { ...filter, status });
    await walkKeys(
      index,
      range,
      "next",
      (key: IDBValidKey, primaryKey: IDBValidKey): void => {
        rows.push({ id: String(primaryKey), status, dateApplied: isoOf(key) });
      },
      isStale,
    );
  }

  return rows;
}

/** Reads exactly the rows asked for, by primary key. Missing ids drop out. */
export async function getMany(ids: readonly string[]): Promise<JobApplication[]> {
  if (ids.length === 0) return [];
  const db = await openDb();
  const store = db.transaction([STORE], "readonly").objectStore(STORE);
  const records = await Promise.all(
    ids.map((id: string): Promise<JobApplication | undefined> =>
      wrap<JobApplication | undefined>(store.get(id)),
    ),
  );
  return records.filter((record: JobApplication | undefined): record is JobApplication => {
    return record !== undefined;
  });
}

/** Newest updatedAt in the store: the last key of the index, exact and O(1). */
export async function latestUpdatedAt(): Promise<IsoDate | null> {
  const db = await openDb();
  const index = db.transaction([STORE], "readonly").objectStore(STORE).index(IDX_UPDATED_AT);
  const cursor = await wrap<IDBCursor | null>(index.openKeyCursor(null, "prev"));
  return cursor === null ? null : String(cursor.key);
}

/**
 * One entry per distinct companyKey, with the spelling of one of its records
 * for display. "nextunique" visits each key once, so the cost is the number of
 * companies, not the number of records.
 */
export async function listCompanies(): Promise<CompanyOption[]> {
  const db = await openDb();
  const index = db.transaction([STORE], "readonly").objectStore(STORE).index(IDX_COMPANY_KEY);
  const sample: { companyKey: string; id: string }[] = [];

  await walkKeys(index, null, "nextunique", (key: IDBValidKey, primaryKey: IDBValidKey): void => {
    sample.push({ companyKey: String(key), id: String(primaryKey) });
  });

  const records = await getMany(sample.map((entry): string => entry.id));
  const labels = new Map<string, string>();
  for (const record of records) labels.set(record.companyKey, record.company);

  return sample.map((entry): CompanyOption => ({
    companyKey: entry.companyKey,
    company: labels.get(entry.companyKey) ?? entry.companyKey,
  }));
}

/** Primary keys of one company's records, straight from the index. */
export async function idsForCompany(companyKey: string): Promise<string[]> {
  const db = await openDb();
  const index = db.transaction([STORE], "readonly").objectStore(STORE).index(IDX_COMPANY_KEY);
  const keys = await wrap<IDBValidKey[]>(index.getAllKeys(companyKey));
  return keys.map(String);
}

/**
 * Writes many records in one transaction. A seeder that awaited
 * upsertApplication per record would open one transaction each, turning a
 * fixture into a minutes-long job.
 */
export async function bulkPut(records: readonly JobApplication[]): Promise<number> {
  if (records.length === 0) return 0;
  const db = await openDb();
  const tx = db.transaction([STORE], "readwrite");
  const store = tx.objectStore(STORE);
  for (const record of records) store.put(record);
  await done(tx);
  return records.length;
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

  const { index, range } = scanTarget(store, {
    status: query.status,
    from: query.from,
    to: query.to,
  });

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
