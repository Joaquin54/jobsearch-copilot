import type { ApplicationStatus, JobSource } from "../../lib/types.ts";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "../config.ts";
import type { SortDirection, TableFilters } from "../data/select.ts";

export type TableUrlState = {
  filters: TableFilters;
  direction: SortDirection;
  pageIndex: number;
  pageSize: number;
};

/** Longest companyKey worth honouring from a hand-edited link. */
const MAX_COMPANY_KEY = 120;

const STATUSES: readonly string[] = ["applied", "pending"];
const SOURCES: readonly string[] = ["linkedin", "indeed", "handshake"];

export function defaultTableUrlState(): TableUrlState {
  return {
    filters: { status: "all", source: "all", companyKey: null },
    direction: "desc",
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

/**
 * Unknown values are rejected back to the default rather than coerced, so a
 * hand-edited or stale link can never smuggle an unexpected value into an
 * ApplicationQuery-shaped filter.
 */
export function parseTableUrlState(search: string): TableUrlState {
  const params = new URLSearchParams(search);
  const state = defaultTableUrlState();

  const status = params.get("status");
  if (status !== null && STATUSES.includes(status)) {
    state.filters.status = status as ApplicationStatus;
  }

  const source = params.get("source");
  if (source !== null && SOURCES.includes(source)) {
    state.filters.source = source as JobSource;
  }

  const company = params.get("company");
  if (company !== null && company !== "" && company.length <= MAX_COMPANY_KEY) {
    state.filters.companyKey = company;
  }

  if (params.get("dir") === "asc") state.direction = "asc";

  const size = Number(params.get("size"));
  if ((PAGE_SIZES as readonly number[]).includes(size)) state.pageSize = size;

  // The URL is 1-based for humans; state is 0-based.
  const page = Number(params.get("page"));
  if (Number.isInteger(page) && page >= 1) state.pageIndex = page - 1;

  return state;
}

/** Defaults are omitted, so an untouched dashboard has a bare URL. */
export function serializeTableUrlState(state: TableUrlState): string {
  const params = new URLSearchParams();
  if (state.filters.status !== "all") params.set("status", state.filters.status);
  if (state.filters.source !== "all") params.set("source", state.filters.source);
  if (state.filters.companyKey !== null) params.set("company", state.filters.companyKey);
  if (state.direction !== "desc") params.set("dir", state.direction);
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set("size", String(state.pageSize));
  if (state.pageIndex > 0) params.set("page", String(state.pageIndex + 1));
  return params.toString();
}

/** Our own params, and the only ones this module is allowed to touch. */
const OWNED_PARAMS = ["status", "source", "company", "dir", "size", "page"] as const;

/**
 * Applies the table state onto the query string that is already there, setting
 * and clearing only our own keys. Rewriting the whole search instead would
 * silently drop params belonging to anything else on the page.
 */
export function mergeTableUrlState(state: TableUrlState, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  for (const name of OWNED_PARAMS) params.delete(name);
  for (const [name, value] of new URLSearchParams(serializeTableUrlState(state))) {
    params.set(name, value);
  }
  return params.toString();
}
