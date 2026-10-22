import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { loadOverview, type Overview } from "../data/aggregate.ts";
import { addMonths, monthOf, sameMonth, type MonthRef } from "../time/localDays.ts";

export type OverviewState = {
  overview: Overview | null;
  month: MonthRef;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  pending: boolean;
};

export function useOverview(): OverviewState {
  // "Now" is captured once so a page left open past local midnight cannot have
  // its today-outline and its streak disagree mid-session.
  const now = useMemo((): Date => new Date(), []);
  const currentMonth = useMemo((): MonthRef => monthOf(now), [now]);

  const [month, setMonth] = useState<MonthRef>(currentMonth);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pending, startTransition] = useTransition();

  const requestIdRef = useRef<number>(0);
  const aliveRef = useRef<boolean>(true);

  useEffect((): (() => void) => {
    aliveRef.current = true;
    return (): void => {
      aliveRef.current = false;
    };
  }, []);

  useEffect((): void => {
    const requestId = (requestIdRef.current += 1);
    const isStale = (): boolean => !aliveRef.current || requestId !== requestIdRef.current;

    void loadOverview(month, now, isStale).then((next: Overview): void => {
      // A superseded month must never overwrite a newer one.
      if (isStale()) return;
      setOverview(next);
    });
  }, [month, now]);

  const goPrev = useCallback((): void => {
    startTransition((): void => {
      setMonth((current: MonthRef): MonthRef => addMonths(current, -1));
    });
  }, []);

  const goNext = useCallback((): void => {
    startTransition((): void => {
      setMonth((current: MonthRef): MonthRef => addMonths(current, 1));
    });
  }, []);

  return {
    overview,
    month,
    canGoNext: !sameMonth(month, currentMonth),
    goPrev,
    goNext,
    pending,
  };
}
