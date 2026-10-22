import { getMany, idsForCompany, listCompanies, scanKeys } from "../../lib/db.ts";
import type { ApplicationStatus, IsoDate, JobApplication, JobSource } from "../../lib/types.ts";
import { dayKeyOfIso, type DayKey } from "../time/localDays.ts";
import { COMPANY_COLLATOR } from "../time/formats.ts";

/**
 * One row of the in-memory index. Built from index KEYS only — db.scanKeys
 * never touches cursor.value, so no record is deserialized. status and
 * dateApplied come from the compound key, and source is recoverable from the
 * primary key because ids are `${source}:${nativeBoardId}`.
 *
 * This exists because queryApplications computes its `total` by reading
 * cursor.value for every matching record on every call — a full-store
 * deserialize per page change, which cannot meet the frame budget at 5k rows.
 */
export type CatalogEntry = {
  id: string;
  status: ApplicationStatus;
  source: JobSource;
  dateApplied: IsoDate;
  day: DayKey;
};

export type Catalog = {
  /** dateApplied descending. */
  entries: readonly CatalogEntry[];
};

export type CompanyOption = { companyKey: string; company: string };

export type CompanyIndex = {
  options: readonly CompanyOption[];
  /** id -> companyKey, so a company filter can be applied to catalog entries. */
  byId: ReadonlyMap<string, string>;
};

function sourceOf(id: string): JobSource | null {
  const cut = id.indexOf(":");
  if (cut < 0) return null;
  const prefix = id.slice(0, cut);
  return prefix === "linkedin" || prefix === "indeed" ? prefix : null;
}

/** One key-only pass over the store, sorted into dateApplied-descending order. */
export async function buildCatalog(isStale: () => boolean): Promise<Catalog> {
  const keys = await scanKeys({}, isStale);
  const entries: CatalogEntry[] = [];

  for (const key of keys) {
    const source = sourceOf(key.id);
    // A record whose id predates the current scheme cannot be attributed to a
    // board, and the source column would be a guess, so it is left out.
    if (source === null) continue;
    entries.push({
      id: key.id,
      status: key.status,
      source,
      dateApplied: key.dateApplied,
      day: dayKeyOfIso(key.dateApplied),
    });
  }

  // scanKeys walks each status in turn, so a single date ordering has to be
  // imposed here. One sort of 5k scalars is well inside a frame.
  entries.sort((a: CatalogEntry, b: CatalogEntry): number =>
    a.dateApplied < b.dateApplied ? 1 : a.dateApplied > b.dateApplied ? -1 : 0,
  );

  return { entries };
}

/**
 * The company dimension, from the by_companyKey index: one entry per distinct
 * company for the dropdown, then that company's primary keys. Still loaded on
 * demand — the first time the company filter is used — and cached for the life
 * of the page, but no record is deserialized to build it.
 */
export async function buildCompanyIndex(isStale: () => boolean): Promise<CompanyIndex> {
  const companies = await listCompanies();
  const byId = new Map<string, string>();

  for (const option of companies) {
    if (isStale()) break;
    for (const id of await idsForCompany(option.companyKey)) byId.set(id, option.companyKey);
  }

  const options = [...companies].sort((a: CompanyOption, b: CompanyOption): number =>
    COMPANY_COLLATOR.compare(a.company, b.company),
  );

  return { options, byId };
}

/** Reads exactly the rows that are about to be displayed, by primary key. */
export async function fetchByIds(ids: readonly string[]): Promise<JobApplication[]> {
  return await getMany(ids);
}
