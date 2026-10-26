import { BUILD_ID } from "../lib/build.ts";
import { stampIdOf } from "../lib/buildStamp.ts";

const STAMP_PATH = "build.json";
const ATTEMPT_KEY = "reloadAttempt";

/**
 * Chrome keeps serving the content script it loaded until the extension is
 * reloaded by hand, which has silently cost three debugging rounds: the page
 * looks alive, logs its lines, and runs code from an older build.
 *
 * For an unpacked extension Chrome reads packaged files from disk on request,
 * so fetching the extension's own build.json yields the id of the build that is
 * on disk now, while this worker still carries the id it was compiled with. A
 * mismatch means the worker is stale, and reloading picks up every file.
 *
 * Dev only: a packed install has an update_url and is left alone. This is the
 * extension reading one of its own files — no network, no injection, no
 * web_accessible_resources.
 *
 * Called at worker start only. Checking on every page load was tried and is
 * wrong: reloading mid-session orphans the content scripts already running in
 * other tabs, so their next apply click gets no answer and is dropped with
 * nothing shown, and the per-tab pending rows and "not now" answers held in
 * session storage go with it. A tab on an older build is fixed by its own next
 * load instead.
 */
export async function maybeReloadForNewBuild(): Promise<boolean> {
  if (chrome.runtime.getManifest().update_url !== undefined) return false;

  let onDisk: string | null = null;
  try {
    const response = await fetch(chrome.runtime.getURL(STAMP_PATH));
    onDisk = stampIdOf(await response.json());
  } catch {
    // No stamp shipped, or the worker is shutting down: nothing to decide on.
    return false;
  }

  if (onDisk === null || onDisk === BUILD_ID) return false;

  // One attempt per id on disk. If reloading does not change what this worker
  // reports, the ids disagree for some other reason and a loop would be worse
  // than a stale script.
  const stored = await chrome.storage.session.get(ATTEMPT_KEY);
  if (stored[ATTEMPT_KEY] === onDisk) return false;
  await chrome.storage.session.set({ [ATTEMPT_KEY]: onDisk });

  console.log(`[jobsearch-copilot] reloading for build ${onDisk} (worker has ${BUILD_ID})`);
  chrome.runtime.reload();
  return true;
}
