import { CSV_COLUMNS, exportFilename, mimeFor, toCsv } from "../../lib/export.ts";
import { EXPORT_CHUNK } from "../config.ts";
import { fetchByIds } from "./catalog.ts";

/**
 * toCsv emits the column header on every call, so chunks after the first have
 * it sliced off. Derived from CSV_COLUMNS rather than hardcoded, so adding a
 * column to export.ts cannot silently desynchronise this.
 */
const HEADER = `${CSV_COLUMNS.join(",")}\r\n`;

export function stripHeader(text: string, chunkIndex: number): string {
  if (chunkIndex === 0) return text;
  if (!text.startsWith(HEADER)) {
    throw new Error("toCsv header shape changed; export would emit a stray header row");
  }
  return text.slice(HEADER.length);
}

/** Hands the main thread back between chunks so scrolling never stalls. */
function yieldToMain(): Promise<void> {
  return new Promise<void>((resolve): void => {
    setTimeout(resolve, 0);
  });
}

/**
 * Object URLs still awaiting revocation. Chrome reads the blob asynchronously
 * after a programmatic download starts, so revoking in the same tick can cancel
 * it; the handle is released shortly after instead, and anything still pending
 * is revoked on unmount or page hide so none can leak.
 */
const pendingUrls = new Set<string>();

const REVOKE_DELAY_MS = 10_000;

export function revokePendingExports(): void {
  for (const url of pendingUrls) URL.revokeObjectURL(url);
  pendingUrls.clear();
}

export type ExportProgress = { done: number; total: number };

export type ExportOutcome = { filename: string; rows: number };

/**
 * Builds the CSV for exactly the ids given — which the caller derives from the
 * active filters — paging through the store so the whole dataset is never
 * resident, and revoking the object URL on every exit path.
 */
export async function exportCsv(
  ids: readonly string[],
  onProgress: (progress: ExportProgress) => void,
  isStale: () => boolean,
): Promise<ExportOutcome | null> {
  const parts: string[] = [];
  let chunkIndex = 0;

  for (let from = 0; from < ids.length; from += EXPORT_CHUNK) {
    if (isStale()) return null;
    const slice = ids.slice(from, from + EXPORT_CHUNK);
    const records = await fetchByIds(slice);
    parts.push(stripHeader(toCsv(records), chunkIndex));
    chunkIndex += 1;
    onProgress({ done: Math.min(from + EXPORT_CHUNK, ids.length), total: ids.length });
    await yieldToMain();
  }

  // An empty result still gets a header-only file rather than a blank one.
  if (parts.length === 0) parts.push(toCsv([]));
  if (isStale()) return null;

  const filename = exportFilename("csv", new Date());
  const blob = new Blob(parts, { type: mimeFor("csv") });
  const url = URL.createObjectURL(blob);
  pendingUrls.add(url);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  anchor.click();

  window.setTimeout((): void => {
    if (!pendingUrls.delete(url)) return;
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);

  return { filename, rows: ids.length };
}
