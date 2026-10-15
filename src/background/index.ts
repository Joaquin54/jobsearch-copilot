import type { Message } from "../lib/messages.ts";

chrome.runtime.onInstalled.addListener((): void => {
  console.log("[jobsearch-copilot] installed");
});

chrome.runtime.onMessage.addListener((message: Message): undefined => {
  if (message.type === "JOB_SCRAPED") {
    console.log("[jobsearch-copilot] job scraped", message.payload);
  }
});
