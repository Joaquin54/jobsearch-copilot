/**
 * URL.createObjectURL is not exposed in service workers, so downloads need a
 * blob URL minted in an offscreen document (chrome.offscreen's BLOBS reason
 * exists for exactly this).
 */
export type OffscreenRequest =
  | { type: "OFFSCREEN_CREATE_BLOB_URL"; payload: { text: string; mime: string } }
  | { type: "OFFSCREEN_REVOKE_BLOB_URL"; payload: { url: string } };

export type OffscreenResponse = { ok: true; url: string } | { ok: false; reason: string };

const DOCUMENT_PATH = "offscreen.html";

let ensuring: Promise<void> | null = null;

async function hasDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  return contexts.length > 0;
}

async function ensureDocument(): Promise<void> {
  if (await hasDocument()) return;
  if (ensuring) return ensuring;
  ensuring = chrome.offscreen
    .createDocument({
      url: DOCUMENT_PATH,
      reasons: ["BLOBS"],
      justification: "Create a blob URL so exported CSV/JSON can be downloaded.",
    })
    .finally((): void => {
      ensuring = null;
    });
  return ensuring;
}

export async function createBlobUrl(text: string, mime: string): Promise<string> {
  await ensureDocument();
  const request: OffscreenRequest = {
    type: "OFFSCREEN_CREATE_BLOB_URL",
    payload: { text, mime },
  };
  const response = (await chrome.runtime.sendMessage(request)) as OffscreenResponse | undefined;
  if (!response || !response.ok) {
    throw new Error(response ? response.reason : "offscreen document did not respond");
  }
  return response.url;
}

export async function revokeBlobUrl(url: string): Promise<void> {
  if (!(await hasDocument())) return;
  const request: OffscreenRequest = { type: "OFFSCREEN_REVOKE_BLOB_URL", payload: { url } };
  await chrome.runtime.sendMessage(request);
}
