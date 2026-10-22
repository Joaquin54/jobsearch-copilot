import type { SiteAdapter } from "./sites/index.ts";

export type JobChange = {
  previousJobId: string | null;
  jobId: string;
  /** false when the new pane never went quiet: safe to ask, unsafe to extract. */
  settled: boolean;
};

const POLL_MS = 400;
export const SETTLE_QUIET_MS = 250;
export const SETTLE_CAP_MS = 3000;
export const SETTLE_POLL_MS = 100;

/**
 * LinkedIn and Indeed flip the URL before swapping the detail pane, so a
 * capture taken on the URL change alone records the previous job's fields under
 * the new id. If the site names the job the pane is showing, that is the signal
 * to wait on; otherwise waiting for the pane to go quiet is the best available.
 * Either way, never settling means skipping the capture rather than storing a guess.
 */
export function waitForSettle(
  adapter: SiteAdapter,
  jobId: string,
  capMs: number = SETTLE_CAP_MS,
): Promise<boolean> {
  const probe = (): boolean | null => {
    try {
      return adapter.jobSettled?.(document, jobId) ?? null;
    } catch {
      return null;
    }
  };

  const first = probe();
  if (first === true) return Promise.resolve(true);
  if (first !== null) return pollJobSettled(probe, capMs);
  return waitForQuiet(adapter, capMs);
}

function pollJobSettled(probe: () => boolean | null, capMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve: (settled: boolean) => void): void => {
    const started = Date.now();
    const timer = setInterval((): void => {
      if (probe() === true) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - started >= capMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, SETTLE_POLL_MS) as unknown as number;
  });
}

function waitForQuiet(adapter: SiteAdapter, capMs: number): Promise<boolean> {
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
    }, capMs);

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
    void waitForSettle(adapter, jobId).then((settled: boolean): void => {
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
