import { nowIso, send, type Message } from "../lib/messages.ts";
import { askToActivate, getActivationState } from "./activation.ts";
import { watchApplyClicks, watchSuccessModal } from "./applyEvents.ts";
import { extract } from "./extract.ts";
import { watchJobId, type JobChange } from "./navigation.ts";
import { resolveAdapter, type SiteAdapter } from "./sites/index.ts";
import { consolePort } from "./ui/consolePort.ts";
import type { UiPort } from "./ui/port.ts";

const ui: UiPort = consolePort;

type Watch = { pendingId: string | null; pendingCompany: string };

let watching = false;

async function recordApply(adapter: SiteAdapter, state: Watch): Promise<void> {
  const jobId = adapter.jobId(new URL(location.href), document);
  if (jobId === null) return;

  const outcome = extract(adapter, jobId, location.href);
  if (!outcome.ok) {
    ui.toast(`Not tracked (${outcome.reason})`, 4000);
    return;
  }

  const response = await send({ type: "APPLY_DETECTED", payload: { draft: outcome.draft } });
  if (!response.ok) return;

  state.pendingId = response.id;
  state.pendingCompany = outcome.draft.company;
  ui.toast(`Tracked ${outcome.draft.title} at ${outcome.draft.company}`, 6000);
}

async function confirmPending(state: Watch): Promise<void> {
  const id = state.pendingId;
  if (id === null) return;

  const answer = await ui.prompt({
    key: "confirm-pending",
    text: `Was the application for ${state.pendingCompany} submitted?`,
    actions: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  });
  // An unanswered or superseded question keeps the row pending so the next
  // navigation can ask again, rather than orphaning it.
  if (answer === "") return;

  state.pendingId = null;
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
  ui.toast("Stored applications cleared.", 4000);
}

function startWatching(adapter: SiteAdapter, jobId: string): void {
  if (watching) return;
  watching = true;

  const state: Watch = { pendingId: null, pendingCompany: "" };

  watchApplyClicks(adapter, (): void => {
    void recordApply(adapter, state);
  });

  watchSuccessModal(adapter, (): void => {
    const id = state.pendingId;
    if (id === null) return;
    state.pendingId = null;
    void send({ type: "PROMOTE_APPLIED", payload: { id } });
    ui.toast("Application confirmed.", 4000);
  });

  watchJobId(adapter, jobId, (_change: JobChange): void => {
    void confirmPending(state);
  });

  chrome.runtime.onMessage.addListener((message: Message): undefined => {
    if (message.type === "QUOTA_WARNING") void offerExport(state);
    if (message.type === "STORE_WIPED") state.pendingId = null;
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
  const adapter = resolveAdapter(new URL(location.href));
  if (!adapter) return;

  // Activation is asked for only once a real job page is open, never on a feed.
  const jobId = await waitForJobId(adapter);

  const state = await getActivationState(adapter.domain);
  if (state === "suppressed") return;

  if (state === "ask") {
    const activated = await askToActivate(adapter.domain, ui);
    if (!activated) return;
  }

  startWatching(adapter, jobId);
}

void main();
