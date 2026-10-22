import { memo } from "react";
import type { ReactElement } from "react";

/** The dashboard page ships from its own entry; the popup only links to it. */
const DASHBOARD_PAGE = "dashboard.html";

async function openDashboard(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_PAGE) });
  window.close();
}

function DashboardButtonImpl(): ReactElement {
  return (
    <button className="dash-button" type="button" onClick={(): void => void openDashboard()}>
      Open dashboard
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
    </button>
  );
}

export const DashboardButton = memo(DashboardButtonImpl);
