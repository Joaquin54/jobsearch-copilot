import {
  countApplications,
  dayCounts,
  deleteApplication,
  getApplication,
  listAll,
  promoteToApplied,
  queryApplications,
  upsertApplication,
  wipeStore,
} from "../lib/db.ts";
import { exportFilename, mimeFor, toCsv, toJson } from "../lib/export.ts";
import {
  assertNever,
  nowIso,
  sendToTab,
  type ExportFormat,
  type Message,
  type ResponseMap,
} from "../lib/messages.ts";
import { getPending, setPending } from "../lib/pending.ts";
import { isOverThreshold, readQuota } from "../lib/quota.ts";
import {
  readSettings,
  resolveActivation,
  setActivation,
  setQuotaWarned,
  wasQuotaWarned,
} from "../lib/settings.ts";
import { createBlobUrl, revokeBlobUrl } from "./offscreenClient.ts";

const WATCHED_URLS = [
  "https://*.linkedin.com/*",
  "https://*.indeed.com/*",
  "https://*.joinhandshake.com/*",
];

chrome.runtime.onInstalled.addListener((): void => {
  console.log("[jobsearch-copilot] installed");
});

/** A closed tab can never answer its question; drop what it was waiting on. */
chrome.tabs.onRemoved.addListener((tabId: number): void => {
  void setPending(tabId, null);
});

/** Runs after every write: warns once per fill cycle, then stays quiet. */
async function checkQuotaAfterWrite(): Promise<void> {
  const quota = await readQuota();
  const warned = await wasQuotaWarned();
  if (!isOverThreshold(quota)) {
    if (warned) await setQuotaWarned(false);
    return;
  }
  if (warned) return;
  await setQuotaWarned(true);
  await broadcast({ type: "QUOTA_WARNING", payload: { quota } });
}

async function broadcast(message: Message): Promise<void> {
  const tabs = await chrome.tabs.query({ url: WATCHED_URLS });
  await Promise.all(
    tabs.map((tab: chrome.tabs.Tab): Promise<void> =>
      tab.id === undefined ? Promise.resolve() : sendToTab(tab.id, message),
    ),
  );
}

/**
 * download() resolves when the download is *created*, not written: Chrome
 * fetches the blob afterwards. Revoking or wiping at that point produces an
 * empty file, so the response waits for a terminal download state.
 */
function waitForDownload(downloadId: number): Promise<"complete" | "interrupted"> {
  return new Promise<"complete" | "interrupted">((resolve) => {
    const listener = (delta: chrome.downloads.DownloadDelta): void => {
      if (delta.id !== downloadId || delta.state === undefined) return;
      const state = delta.state.current;
      if (state !== "complete" && state !== "interrupted") return;
      chrome.downloads.onChanged.removeListener(listener);
      resolve(state);
    };
    chrome.downloads.onChanged.addListener(listener);
  });
}

async function runExport(format: ExportFormat): Promise<ResponseMap["EXPORT"]> {
  const rows = await listAll();
  const text = format === "csv" ? toCsv(rows) : toJson(rows);
  const filename = exportFilename(format, new Date());
  const url = await createBlobUrl(text, mimeFor(format));
  try {
    const downloadId = await chrome.downloads.download({ url, filename, saveAs: true });
    const state = await waitForDownload(downloadId);
    if (state === "interrupted") {
      return { ok: false, reason: `download interrupted: ${filename}` };
    }
    return { ok: true, downloadId, filename };
  } finally {
    await revokeBlobUrl(url);
  }
}

async function handle(
  message: Message,
  sender: chrome.runtime.MessageSender,
): Promise<ResponseMap[Message["type"]]> {
  switch (message.type) {
    case "GET_ACTIVATION":
      return { ok: true, state: await resolveActivation(message.payload.domain) };

    case "SET_ACTIVATION":
      await setActivation(message.payload.domain, message.payload.choice);
      return { ok: true };

    case "APPLY_DETECTED": {
      const result = await upsertApplication(message.payload.draft, nowIso());
      await checkQuotaAfterWrite();
      return { ok: true, id: result.id, result };
    }

    case "PROMOTE_APPLIED":
      return { ok: true, promoted: await promoteToApplied(message.payload.id, nowIso()) };

    case "RESOLVE_PENDING": {
      if (!message.payload.submitted) {
        await deleteApplication(message.payload.id);
        return { ok: true, action: "deleted" };
      }
      const promoted = await promoteToApplied(message.payload.id, nowIso());
      return { ok: true, action: promoted ? "promoted" : "noop" };
    }

    case "GET_APPLICATION":
      return { ok: true, record: await getApplication(message.payload.id) };

    /* Per tab, so two job tabs never answer for each other's application. */
    case "SET_PENDING": {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { ok: false, reason: "no tab" };
      await setPending(tabId, message.payload.pending);
      return { ok: true };
    }

    case "GET_PENDING": {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { ok: false, reason: "no tab" };
      return { ok: true, pending: await getPending(tabId) };
    }

    case "QUERY_APPLICATIONS":
      return { ok: true, ...(await queryApplications(message.payload.query)) };

    case "COUNT_APPLICATIONS":
      return { ok: true, count: await countApplications(message.payload.filter) };

    case "DAY_COUNTS":
      return { ok: true, counts: [...(await dayCounts(message.payload.filter))] };

    case "DELETE_APPLICATION":
      await deleteApplication(message.payload.id);
      return { ok: true };

    case "GET_SETTINGS":
      return { ok: true, settings: await readSettings() };

    case "GET_QUOTA":
      return { ok: true, quota: await readQuota() };

    case "EXPORT":
      return await runExport(message.payload.format);

    case "WIPE_STORE": {
      const deleted = await wipeStore();
      await setQuotaWarned(false);
      await broadcast({ type: "STORE_WIPED" });
      return { ok: true, deleted };
    }

    // Background -> content only; never arrives here.
    case "QUOTA_WARNING":
    case "STORE_WIPED":
      return { ok: true };

    default:
      return assertNever(message);
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean => {
    handle(message, sender)
      .then(sendResponse)
      .catch((error: unknown): void => sendResponse({ ok: false, reason: String(error) }));
    return true;
  },
);
