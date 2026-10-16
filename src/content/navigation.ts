import type { SiteAdapter } from "./sites/index.ts";

export type JobChange = {
  previousJobId: string | null;
  jobId: string;
  /** false when the new pane never went quiet: safe to ask, unsafe to extract. */
  settled: boolean;
};

const POLL_MS = 400;
const SETTLE_QUIET_MS = 250;
const SETTLE_CAP_MS = 3000;

/**
 * LinkedIn and Indeed flip the URL before swapping the detail pane, so a
 * capture taken on the URL change alone records the previous job's fields under
 * the new id. Waiting for the pane to go quiet is what prevents that; if it
 * never settles we skip the capture rather than store a guess.
 */
function waitForSettle(adapter: SiteAdapter): Promise<boolean> {
  const root = adapter.detailRoot(document);
  if (!root) return Promise.resolve(false);

  return new Promise<boolean>((resolve: (settled: boolean) => void): void => {
    let quietTimer = 0;
    const observer = new MutationObserver((): void => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, SETTLE_QUIET_MS) as unknown as number;
    });

    const cap = setTimeout((): void => {
      observer.disconnect();
      clearTimeout(quietTimer);
      resolve(false);
    }, SETTLE_CAP_MS);

    function finish(): void {
      observer.disconnect();
      clearTimeout(cap);
      resolve(true);
    }

    observer.observe(root, { childList: true, subtree: true });
    quietTimer = setTimeout(finish, SETTLE_QUIET_MS) as unknown as number;
  });
}

/**
 * Content-side detection: patching history.pushState from an isolated world
 * does not intercept the page's own calls, and chrome.tabs.onUpdated would need
 * the tabs permission. Polling the URL is the mechanism that works here.
 */
export function watchJobId(
  adapter: SiteAdapter,
  initialJobId: string | null,
  onChange: (change: JobChange) => void,
): () => void {
  let currentJobId = initialJobId;
  let lastHref = location.href;

  const check = (): void => {
    if (location.href === lastHref) return;
    lastHref = location.href;

    const jobId = adapter.jobId(new URL(location.href), document);
    if (jobId === null || jobId === currentJobId) return;

    const previousJobId = currentJobId;
    currentJobId = jobId;
    void waitForSettle(adapter).then((settled: boolean): void => {
      onChange({ previousJobId, jobId, settled });
    });
  };

  const interval = setInterval(check, POLL_MS) as unknown as number;
  window.addEventListener("popstate", check);
  const stop = (): void => {
    clearInterval(interval);
    window.removeEventListener("popstate", check);
  };
  window.addEventListener("pagehide", stop, { once: true });
  return stop;
}
