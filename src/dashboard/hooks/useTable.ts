import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { ApplicationStatus, JobApplication, JobSource } from "../../lib/types.ts";
import { fetchByIds, type Catalog, type CatalogEntry, type CompanyIndex } from "../data/catalog.ts";
import {
  clampPageIndex,
  selectAllIds,
  selectMatches,
  selectPageIds,
  type SortDirection,
  type TableFilters,
} from "../data/select.ts";
import {
  defaultTableUrlState,
  mergeTableUrlState,
  parseTableUrlState,
  type TableUrlState,
} from "../lib/urlState.ts";

export type TableState = {
  filters: TableFilters;
  direction: SortDirection;
  pageIndex: number;
  pageSize: number;
  rows: readonly JobApplication[];
  total: number;
  /** True while the shown rows belong to a superseded query. */
  stale: boolean;
  pending: boolean;
  setStatus: (status: ApplicationStatus | "all") => void;
  setSource: (source: JobSource | "all") => void;
  setCompanyKey: (companyKey: string | null) => void;
  toggleDirection: () => void;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;
  clearFilters: () => void;
  /** Ids for every match, in display order — used by the export. */
  allIds: () => readonly string[];
};

const EMPTY_ROWS: { ids: readonly string[]; rows: readonly JobApplication[] } = {
  ids: [],
  rows: [],
};

export function useTable(catalog: Catalog | null, companies: CompanyIndex | null): TableState {
  // Reading the URL in the initializer restores state on the very first render,
  // so there is no default-then-correct flash.
  const [urlState, setUrlState] = useState<TableUrlState>((): TableUrlState =>
    parseTableUrlState(window.location.search),
  );
  const [loaded, setLoaded] = useState(EMPTY_ROWS);
  const [pending, startTransition] = useTransition();

  const requestIdRef = useRef<number>(0);
  const aliveRef = useRef<boolean>(true);

  useEffect((): (() => void) => {
    aliveRef.current = true;
    return (): void => {
      aliveRef.current = false;
    };
  }, []);

  const matched = useMemo((): readonly CatalogEntry[] => {
    if (catalog === null) return [];
    return selectMatches(catalog, urlState.filters, companies);
  }, [catalog, urlState.filters, companies]);

  const total = matched.length;
  const pageIndex = clampPageIndex(urlState.pageIndex, total, urlState.pageSize);

  const ids = useMemo((): readonly string[] => {
    return selectPageIds(matched, urlState.direction, {
      index: pageIndex,
      size: urlState.pageSize,
    });
  }, [matched, urlState.direction, pageIndex, urlState.pageSize]);

  useEffect((): void => {
    if (catalog === null) return;
    const requestId = (requestIdRef.current += 1);

    void fetchByIds(ids).then((rows: JobApplication[]): void => {
      // Two guards: the page may have unmounted, or a newer query may already
      // have been issued, in which case this answer is discarded outright.
      if (!aliveRef.current || requestId !== requestIdRef.current) return;
      setLoaded({ ids, rows });
    });
  }, [catalog, ids]);

  const serialized = useMemo(
    (): string => mergeTableUrlState(urlState, window.location.search),
    [urlState],
  );

  useEffect((): void => {
    const next =
      serialized === ""
        ? window.location.pathname
        : `${window.location.pathname}?${serialized}`;
    // replaceState is not React state: it runs after the transition commits and
    // schedules no render, so it cannot interleave with a pending transition.
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [serialized]);

  const update = useCallback((patch: (current: TableUrlState) => TableUrlState): void => {
    startTransition((): void => {
      setUrlState(patch);
    });
  }, []);

  const setStatus = useCallback(
    (status: ApplicationStatus | "all"): void => {
      update((current: TableUrlState): TableUrlState => ({
        ...current,
        filters: { ...current.filters, status },
        pageIndex: 0,
      }));
    },
    [update],
  );

  const setSource = useCallback(
    (source: JobSource | "all"): void => {
      update((current: TableUrlState): TableUrlState => ({
        ...current,
        filters: { ...current.filters, source },
        pageIndex: 0,
      }));
    },
    [update],
  );

  const setCompanyKey = useCallback(
    (companyKey: string | null): void => {
      update((current: TableUrlState): TableUrlState => ({
        ...current,
        filters: { ...current.filters, companyKey },
        pageIndex: 0,
      }));
    },
    [update],
  );

  const toggleDirection = useCallback((): void => {
    update((current: TableUrlState): TableUrlState => ({
      ...current,
      direction: current.direction === "desc" ? "asc" : "desc",
      pageIndex: 0,
    }));
  }, [update]);

  const setPageIndex = useCallback(
    (index: number): void => {
      update((current: TableUrlState): TableUrlState => ({ ...current, pageIndex: index }));
    },
    [update],
  );

  const setPageSize = useCallback(
    (size: number): void => {
      update((current: TableUrlState): TableUrlState => ({
        ...current,
        pageSize: size,
        pageIndex: 0,
      }));
    },
    [update],
  );

  const clearFilters = useCallback((): void => {
    update((current: TableUrlState): TableUrlState => ({
      ...defaultTableUrlState(),
      direction: current.direction,
      pageSize: current.pageSize,
    }));
  }, [update]);

  const allIds = useCallback((): readonly string[] => {
    return selectAllIds(matched, urlState.direction);
  }, [matched, urlState.direction]);

  return {
    filters: urlState.filters,
    direction: urlState.direction,
    pageIndex,
    pageSize: urlState.pageSize,
    rows: loaded.rows,
    total,
    stale: loaded.ids !== ids,
    pending,
    setStatus,
    setSource,
    setCompanyKey,
    toggleDirection,
    setPageIndex,
    setPageSize,
    clearFilters,
    allIds,
  };
}
