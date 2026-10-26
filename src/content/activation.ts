import { send } from "../lib/messages.ts";
import type { ActivationChoice, ActivationState } from "../lib/settings.ts";
import type { SupportedDomain } from "../lib/types.ts";
import type { UiPort } from "./ui/port.ts";

const CTA_KEY = "activation";

const DOMAIN_LABEL: Record<SupportedDomain, string> = {
  "linkedin.com": "LinkedIn",
  "indeed.com": "Indeed",
  "joinhandshake.com": "Handshake",
};

/**
 * "unavailable" is a failed read, never a user decision: the service worker
 * restarting, or a content script orphaned by an extension reload. It is acted
 * on like "suppressed" — a read that failed must not re-ask someone who
 * answered Never — but it is reported as itself, because a silent "suppressed"
 * is indistinguishable from a content script that was never injected at all.
 */
export type ActivationRead = ActivationState | "unavailable";

export async function getActivationState(domain: SupportedDomain): Promise<ActivationRead> {
  const response = await send({ type: "GET_ACTIVATION", payload: { domain } });
  if (!response.ok) {
    console.log(`[jobsearch-copilot] activation unavailable on ${domain} (${response.reason})`);
    return "unavailable";
  }
  return response.state;
}

/** Asks once; resolves true only when the user opts in. */
export async function askToActivate(domain: SupportedDomain, ui: UiPort): Promise<boolean> {
  const answer = await ui.prompt({
    key: CTA_KEY,
    text: `Watch job listings on ${DOMAIN_LABEL[domain]}?`,
    actions: [
      { label: "Yes", value: "yes" },
      { label: "Not now", value: "not-now" },
      { label: "Never", value: "never" },
    ],
  });

  if (answer === "") return false;
  await send({
    type: "SET_ACTIVATION",
    payload: { domain, choice: answer as ActivationChoice },
  });
  return answer === "yes";
}
