/* Detects apply button clicks and, where the site has one, the success modal. */
import type { SiteAdapter } from "./sites/index.ts";

const MODAL_DEBOUNCE_MS = 200;

/**
 * pointerdown in the capture phase, not click: Indeed Apply can navigate the
 * tab away immediately, and capture-phase pointerdown runs before the page's
 * own handlers and before unload, so the message still reaches the background.
 */
export function watchApplyClicks(adapter: SiteAdapter, onApply: () => void): () => void {
  const handler = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const candidate = target.closest("button, a, [role='button']");
    if (candidate === null) return;

    let isApply = false;
    try {
      // Scoped to the open detail pane: LinkedIn's "Easy Apply" filter pill and
      // the apply buttons on result cards match the same selectors.
      const root = adapter.detailRoot(document);
      isApply = root !== null && root.contains(candidate) && adapter.isApplyButton(candidate);
    } catch {
      isApply = false;
    }
    if (isApply) onApply();
  };

  document.addEventListener("pointerdown", handler, { capture: true });
  return (): void => document.removeEventListener("pointerdown", handler, { capture: true });
}

export function watchSuccessModal(adapter: SiteAdapter, onSuccess: () => void): () => void {
  let timer = 0;
  const observer = new MutationObserver((): void => {
    clearTimeout(timer);
    timer = setTimeout((): void => {
      let found: HTMLElement | null = null;
      try {
        found = adapter.successModal(document);
      } catch {
        found = null;
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
