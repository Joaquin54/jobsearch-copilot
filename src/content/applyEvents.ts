/* Detects apply button clicks and, where the site has one, the success modal. */
import type { SiteAdapter } from "./sites/index.ts";

const MODAL_DEBOUNCE_MS = 200;
const LOOKS_LIKE_APPLY = /apply/i;

type RejectReason = "no-detail-root" | "outside-detail-root" | "adapter-rejected";

function describe(element: Element): string {
  const label = element.getAttribute("aria-label") ?? "";
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return `<${element.tagName.toLowerCase()} aria-label=${JSON.stringify(label)}> "${text}"`;
}

/** An apply-looking control, so a rejection is worth a line in the console. */
function looksLikeApply(element: Element): boolean {
  return (
    LOOKS_LIKE_APPLY.test(element.getAttribute("aria-label") ?? "") ||
    LOOKS_LIKE_APPLY.test(element.textContent ?? "")
  );
}

/**
 * pointerdown in the capture phase, not click: Indeed Apply can navigate the
 * tab away immediately, and capture-phase pointerdown runs before the page's
 * own handlers and before unload, so the message still reaches the background.
 */
export type ApplyHandlers = {
  onApply: () => void;
  /** The site's own "did you finish applying?" question, answered in the page. */
  onAnswer?: (answer: "yes" | "no") => void;
};

export function watchApplyClicks(
  adapter: SiteAdapter,
  currentJobId: () => string | null,
  handlers: ApplyHandlers,
): () => void {
  // One line per job and reason: a rejected pane would otherwise log on every click.
  const logged = new Set<string>();

  const reject = (candidate: Element, reason: RejectReason): void => {
    if (!looksLikeApply(candidate)) return;
    const key = `${currentJobId() ?? "no-job"}:${reason}`;
    if (logged.has(key)) return;
    logged.add(key);
    console.log(`[jobsearch-copilot] apply click ignored (${reason}): ${describe(candidate)}`);
  };

  const handler = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const candidate = target.closest("button, a, [role='button']");
    if (candidate === null) return;

    let isApply = false;
    try {
      // The answer comes first: it reads as apply-looking, but it is a
      // confirmation, so it must not be logged as a rejected apply click.
      const answer = adapter.applyAnswer?.(candidate) ?? null;
      if (answer !== null) {
        handlers.onAnswer?.(answer);
        return;
      }

      // Scoped to the open detail pane: LinkedIn's "Easy Apply" filter pill and
      // the apply buttons on result cards match the same selectors.
      const root = adapter.detailRoot(document);
      if (root === null) reject(candidate, "no-detail-root");
      else if (!root.contains(candidate)) reject(candidate, "outside-detail-root");
      else if (!adapter.isApplyButton(candidate)) reject(candidate, "adapter-rejected");
      else isApply = true;
    } catch {
      isApply = false;
    }
    if (isApply) handlers.onApply();
  };

  document.addEventListener("pointerdown", handler, { capture: true });
  return (): void => document.removeEventListener("pointerdown", handler, { capture: true });
}

/**
 * Two promotion signals share one observer: the site's own confirmation modal,
 * and — where the page says so itself — a pane that now reads as already
 * applied for the job still waiting on an answer.
 */
export function watchSuccessModal(
  adapter: SiteAdapter,
  onSuccess: () => void,
  pendingJobId: () => string | null = (): string | null => null,
): () => void {
  let timer = 0;
  const observer = new MutationObserver((): void => {
    clearTimeout(timer);
    timer = setTimeout((): void => {
      let found = false;
      try {
        const jobId = pendingJobId();
        found =
          adapter.successModal(document) !== null ||
          (jobId !== null && (adapter.isApplied?.(document, jobId) ?? false));
      } catch {
        found = false;
      }
      if (found) onSuccess();
    }, MODAL_DEBOUNCE_MS) as unknown as number;
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return (): void => {
    clearTimeout(timer);
    observer.disconnect();
  };
}
