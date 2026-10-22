import { memo } from "react";
import type { ReactElement } from "react";

type HeaderProps = { monthYear: string };

function HeaderImpl({ monthYear }: HeaderProps): ReactElement {
  return (
    <header className="header">
      <span className="header-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 3 3 10.5l7 3 3 7L21 3Z" />
          <path d="M10 13.5 21 3" />
        </svg>
      </span>
      <h1 className="header-title">Applications</h1>
      <span className="header-sub">{monthYear}</span>
    </header>
  );
}

export const Header = memo(HeaderImpl);
