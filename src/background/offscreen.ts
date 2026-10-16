import type { OffscreenRequest, OffscreenResponse } from "./offscreenClient.ts";

function isOffscreenRequest(message: unknown): message is OffscreenRequest {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  return type === "OFFSCREEN_CREATE_BLOB_URL" || type === "OFFSCREEN_REVOKE_BLOB_URL";
}

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: OffscreenResponse) => void,
  ): boolean | undefined => {
    if (!isOffscreenRequest(message)) return undefined;

    if (message.type === "OFFSCREEN_REVOKE_BLOB_URL") {
      URL.revokeObjectURL(message.payload.url);
      sendResponse({ ok: true, url: message.payload.url });
      return undefined;
    }

    const blob = new Blob([message.payload.text], { type: message.payload.mime });
    sendResponse({ ok: true, url: URL.createObjectURL(blob) });
    return undefined;
  },
);
