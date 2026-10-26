import { BUILD_ID } from "../lib/build.ts";
import { nowIso, send, type Message } from "../lib/messages.ts";
import { askToActivate, getActivationState } from "./activation.ts";
import { watchApplyClicks, watchSuccessModal, type RejectReason } from "./applyEvents.ts";
import { extract } from "./extract.ts";
import { watchJobId, type JobChange } from "./navigation.ts";
import { resolveAdapter, type SiteAdapter } from "./sites/index.ts";
import { cardPort } from "./ui/cardPort.ts";
import type { UiPort } from "./ui/port.ts";

const ui: UiPort = cardPort;

type Watch = {
  pendingId: string | null;
  /** The board's own job id for the pending row, for the applied-pane signal. */
  pendingJobId: string | null;
  pendingCompany: string;
};

let watching = false;

async function recordApply(adapter: SiteAdapter, state: Watch): Promise<string | null> {
  const jobId = adapter.jobId(new URL(location.href), document);
  if (jobId === null) return null;

  const outcome = extract(adapter, jobId, location.href);
  if (!outcome.ok) {
    ui.toast(`Not tracked (${outcome.reason})`, 4000);
    return null;
  }

  const response = await send({ type: "APPLY_DETECTED", payload: { draft: outcome.draft } });
  if (!response.ok) return null;

  state.pendingId = response.id;
  state.pendingJobId = outcome.draft.nativeBoardId;
  state.pendingCompany = outcome.draft.company;
  await rememberPending(state);
  ui.toast(`Tracked ${outcome.draft.title} at ${outcome.draft.company}`, 6000);
  return response.id;
}

/**
 * One promotion body for both signals: the site's confirmation modal and the
 * user answering its "did you finish applying?" question. A confirmation for a
 * job with no pending row of its own still counts — LinkedIn only asks it after
 * a real apply — so the record is captured first and promoted straight away.
 */
async function promoteNow(adapter: SiteAdapter, state: Watch): Promise<void> {
  const jobId = adapter.jobId(new URL(location.href), document);
  const matches = state.pendingId !== null && state.pendingJobId === jobId;
  const id = matches ? state.pendingId : await recordApply(adapter, state);
  if (id === null) return;

  state.pendingId = null;
  state.pendingJobId = null;
  await rememberPending(state);
  await send({ type: "PROMOTE_APPLIED", payload: { id } });
  ui.toast("Application confirmed.", 4000);
}

/** Mirrors the in-memory pending row into the tab's session storage. */
async function rememberPending(state: Watch): Promise<void> {
  const pending =
    state.pendingId === null || state.pendingJobId === null
      ? null
      : { id: state.pendingId, jobId: state.pendingJobId, company: state.pendingCompany };
  await send({ type: "SET_PENDING", payload: { pending } });
}

/** A reload loses the in-memory row, so the question is re-armed from storage. */
async function restorePending(state: Watch): Promise<void> {
  const response = await send({ type: "GET_PENDING" });
  if (!response.ok || response.pending === null) return;
  state.pendingId = response.pending.id;
  state.pendingJobId = response.pending.jobId;
  state.pendingCompany = response.pending.company;
}

export async function confirmPending(state: Watch): Promise<void> {
  const id = state.pendingId;
  if (id === null) return;

  const answer = await ui.prompt({
    key: "confirm-pending",
    text: `Did you submit your application to ${state.pendingCompany}?`,
    actions: [
      { label: "Yes, submitted", value: "yes" },
      { label: "No, discard it", value: "no" },
    ],
  });
  // An unanswered or superseded question keeps the row pending so the next
  // navigation can ask again, rather than orphaning it.
  if (answer === "") return;
  // The card stays open until it is answered, so the row asked about may have
  // been replaced in the meantime (apply to B while still asked about A). The
  // answer is still about A, so it is sent either way; only clearing is guarded,
  // because rememberPending persists `state` and would wipe B's row from storage.
  if (state.pendingId === id) {
    state.pendingId = null;
    state.pendingJobId = null;
    await rememberPending(state);
  }
  // "no" deletes the row in the background; only an explicit answer ever does.
  await send({ type: "RESOLVE_PENDING", payload: { id, submitted: answer === "yes" } });
}

async function offerExport(state: Watch): Promise<void> {
  const answer = await ui.prompt({
    key: "quota",
    text: "Local storage is nearly full. Export your applications before clearing?",
    actions: [
      { label: "Export then clear", value: "export" },
      { label: "Clear without exporting", value: "clear" },
    ],
  });
  if (answer === "") return;

  if (answer === "export") {
    const result = await send({ type: "EXPORT", payload: { format: "csv" } });
    if (!result.ok) {
      ui.toast("Export failed; nothing was cleared.", 6000);
      return;
    }
    ui.toast(`Exported ${result.filename}`, 6000);
  }
  await send({ type: "WIPE_STORE" });
  state.pendingId = null;
  state.pendingJobId = null;
  await rememberPending(state);
  ui.toast("Stored applications cleared.", 4000);
}

function startWatching(adapter: SiteAdapter, jobId: string): void {
  if (watching) return;
  watching = true;

  const state: Watch = { pendingId: null, pendingJobId: null, pendingCompany: "" };
  let currentJobId: string | null = jobId;
  void restorePending(state);

  watchApplyClicks(adapter, (): string | null => currentJobId, {
    onApply: (): void => {
      void recordApply(adapter, state);
    },
    onAnswer: (answer: "yes" | "no"): void => {
      if (answer === "no") {
        console.log("[jobsearch-copilot] apply not finished; the row stays pending");
        return;
      }
      void promoteNow(adapter, state);
    },
    onIgnored: (reason: RejectReason): void => {
      ui.toast(`Not tracked (${reason})`, 6000);
    },
  });

  watchSuccessModal(
    adapter,
    (): void => {
      if (state.pendingId === null) return;
      void promoteNow(adapter, state);
    },
    (): string | null => state.pendingJobId,
  );

  watchJobId(adapter, jobId, (change: JobChange): void => {
    currentJobId = change.jobId;
    void confirmPending(state);
  });

  chrome.runtime.onMessage.addListener((message: Message): undefined => {
    if (message.type === "QUOTA_WARNING") void offerExport(state);
    if (message.type === "STORE_WIPED") {
      state.pendingId = null;
      state.pendingJobId = null;
      void rememberPending(state);
    }
    return undefined;
  });

  console.log(`[jobsearch-copilot] watching ${adapter.domain} (job ${jobId}) since ${nowIso()}`);
}

const JOB_WAIT_POLL_MS = 400;

/**
 * Both boards are SPAs and the content script is injected once, so a user who
 * lands on a search page has no job id yet. Waiting for one to appear is what
 * makes the extension usable from a results page; the poller stops as soon as
 * a job opens.
 */
function waitForJobId(adapter: SiteAdapter): Promise<string> {
  const immediate = adapter.jobId(new URL(location.href), document);
  if (immediate !== null) return Promise.resolve(immediate);

  // Logged so that "waiting for a job to open" is distinguishable from a
  // content script that never ran: the symptoms on the page are identical.
  console.log(`[jobsearch-copilot] waiting for a job page on ${location.hostname}`);
  return new Promise<string>((resolve: (jobId: string) => void): void => {
    const interval = setInterval((): void => {
      const jobId = adapter.jobId(new URL(location.href), document);
      if (jobId === null) return;
      clearInterval(interval);
      resolve(jobId);
    }, JOB_WAIT_POLL_MS) as unknown as number;
    window.addEventListener("pagehide", (): void => clearInterval(interval), { once: true });
  });
}

async function main(): Promise<void> {
  // First line on every matched page, before anything can return early: without
  // it, a never-injected script, a stale injected build and a script politely
  // waiting for a job to open all read the same from the page — silence.
  console.log(`[jobsearch-copilot] build ${BUILD_ID} on ${location.hostname}`);

  const adapter = resolveAdapter(new URL(location.href));
  if (!adapter) {
    console.log(`[jobsearch-copilot] no adapter for ${location.hostname}`);
    return;
  }

  // Activation is asked for only once a real job page is open, never on a feed.
  const jobId = await waitForJobId(adapter);

  const state = await getActivationState(adapter.domain);
  // The reason is logged where the read failed; nothing more can be decided here.
  if (state === "unavailable") return;
  if (state === "suppressed") {
    console.log(`[jobsearch-copilot] suppressed on ${adapter.domain}`);
    return;
  }

  if (state === "ask") {
    const activated = await askToActivate(adapter.domain, ui);
    if (!activated) {
      console.log(`[jobsearch-copilot] activation declined on ${adapter.domain}`);
      return;
    }
  }

  startWatching(adapter, jobId);
}

void main();
