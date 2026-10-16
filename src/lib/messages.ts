import type {
  ApplicationQuery,
  IsoDate,
  JobApplication,
  JobDraft,
  SupportedDomain,
} from "./types.ts";
import type { ActivationChoice, ActivationState, Settings } from "./settings.ts";
import type { QuotaReading } from "./quota.ts";
import type { UpsertResult } from "./db.ts";

export type ExportFormat = "csv" | "json";

export type Message =
  // content -> background
  | { type: "GET_ACTIVATION"; payload: { domain: SupportedDomain } }
  | { type: "SET_ACTIVATION"; payload: { domain: SupportedDomain; choice: ActivationChoice } }
  | { type: "APPLY_DETECTED"; payload: { draft: JobDraft } }
  | { type: "PROMOTE_APPLIED"; payload: { id: string } }
  | { type: "RESOLVE_PENDING"; payload: { id: string; submitted: boolean } }
  | { type: "GET_APPLICATION"; payload: { id: string } }
  // popup -> background
  | { type: "QUERY_APPLICATIONS"; payload: { query: ApplicationQuery } }
  | { type: "DELETE_APPLICATION"; payload: { id: string } }
  | { type: "GET_SETTINGS" }
  | { type: "GET_QUOTA" }
  | { type: "EXPORT"; payload: { format: ExportFormat } }
  | { type: "WIPE_STORE" }
  // background -> content
  | { type: "QUOTA_WARNING"; payload: { quota: QuotaReading } }
  | { type: "STORE_WIPED" };

export type Fail = { ok: false; reason: string };

export type ResponseMap = {
  GET_ACTIVATION: { ok: true; state: ActivationState } | Fail;
  SET_ACTIVATION: { ok: true } | Fail;
  APPLY_DETECTED: { ok: true; id: string; result: UpsertResult } | Fail;
  PROMOTE_APPLIED: { ok: true; promoted: boolean } | Fail;
  RESOLVE_PENDING: { ok: true; action: "promoted" | "deleted" | "noop" } | Fail;
  GET_APPLICATION: { ok: true; record: JobApplication | null } | Fail;
  QUERY_APPLICATIONS: { ok: true; rows: JobApplication[]; total: number } | Fail;
  DELETE_APPLICATION: { ok: true } | Fail;
  GET_SETTINGS: { ok: true; settings: Settings } | Fail;
  GET_QUOTA: { ok: true; quota: QuotaReading } | Fail;
  EXPORT: { ok: true; downloadId: number; filename: string } | Fail;
  WIPE_STORE: { ok: true; deleted: number } | Fail;
  QUOTA_WARNING: { ok: true };
  STORE_WIPED: { ok: true };
};

export type ResponseFor<M extends Message> = ResponseMap[M["type"]];

/**
 * Content/popup -> background. Never rejects: a dropped port (service worker
 * mid-restart) resolves to a Fail so callers can stay silent.
 */
export async function send<M extends Message>(message: M): Promise<ResponseFor<M>> {
  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    if (response === undefined) {
      return { ok: false, reason: "no response" } as ResponseFor<M>;
    }
    return response as ResponseFor<M>;
  } catch (error: unknown) {
    return { ok: false, reason: String(error) } as ResponseFor<M>;
  }
}

/** Background -> one tab. Swallows "no receiving end" (tab may have no content script). */
export async function sendToTab(tabId: number, message: Message): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // tab has no listener; nothing to do
  }
}

export function assertNever(value: never): never {
  throw new Error(`unhandled message: ${JSON.stringify(value)}`);
}

export function nowIso(): IsoDate {
  return new Date().toISOString();
}
