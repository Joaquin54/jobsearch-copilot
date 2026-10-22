/** The application a tab is waiting on an answer for, kept across reloads. */

export type PendingApplication = {
  /** The store row id, as APPLY_DETECTED returned it. */
  id: string;
  /** The board's own job id, so a stale pending never answers for another job. */
  jobId: string;
  company: string;
};

const PREFIX = "pending:";

/**
 * chrome.storage.session defaults to TRUSTED_CONTEXTS, so only the background
 * can read it — the same reason activation is resolved there. Keyed per tab:
 * two job tabs each wait on their own application.
 */
function keyOf(tabId: number): string {
  return `${PREFIX}${tabId}`;
}

export async function setPending(
  tabId: number,
  pending: PendingApplication | null,
): Promise<void> {
  if (pending === null) {
    await chrome.storage.session.remove(keyOf(tabId));
    return;
  }
  await chrome.storage.session.set({ [keyOf(tabId)]: pending });
}

export async function getPending(tabId: number): Promise<PendingApplication | null> {
  const stored = await chrome.storage.session.get(keyOf(tabId));
  const value: unknown = stored[keyOf(tabId)];
  if (!value || typeof value !== "object") return null;
  const partial = value as Partial<PendingApplication>;
  if (typeof partial.id !== "string" || typeof partial.jobId !== "string") return null;
  return { id: partial.id, jobId: partial.jobId, company: partial.company ?? "" };
}
