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

export async function getActivationState(domain: SupportedDomain): Promise<ActivationState> {
  const response = await send({ type: "GET_ACTIVATION", payload: { domain } });
  return response.ok ? response.state : "suppressed";
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
