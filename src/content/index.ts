import type { Message } from "../lib/messages.ts";

chrome.runtime.onMessage.addListener((message: Message): undefined => {
  if (message.type !== "SCRAPE_JOB") return;

  const scraped: Message = {
    type: "JOB_SCRAPED",
    payload: {
      title: document.title,
      company: "",
      url: location.href,
    },
  };
  chrome.runtime.sendMessage(scraped);
});
