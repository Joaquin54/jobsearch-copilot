import { memo } from "react";
import type { ReactElement } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "./icons.tsx";

export type MonthSwitcherProps = {
  label: string;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export const MonthSwitcher = memo(function MonthSwitcher({
  label,
  canGoNext,
  onPrev,
  onNext,
}: MonthSwitcherProps): ReactElement {
  return (
    <div className="month-switcher">
      <button type="button" className="icon-button" onClick={onPrev} aria-label="Previous month">
        <ChevronLeftIcon />
      </button>
      <span className="month-label">{label}</span>
      <button
        type="button"
        className="icon-button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next month"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
});
