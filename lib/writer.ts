import { Account, Signal } from "./types";

// Template-based drafting so the demo is reproducible without an LLM call.
// Swap the body of draftOutreach()/reviseDraft() for an AI SDK generateText()
// call (via the AI Gateway) once you want live-generated copy — the
// Compliance pass downstream doesn't care where the text came from.

const SIGNAL_HOOKS: Record<Signal["type"], (s: Signal) => string> = {
  review_cluster: (s) =>
    `I noticed ${s.summary.toLowerCase()}`,
  hiring: (s) => `I saw ${s.summary.toLowerCase()}`,
  new_location: (s) => `Congrats on the new location — I noticed ${s.summary.toLowerCase()}`,
  reputation_dip: (s) => `I noticed ${s.summary.toLowerCase()}`,
};

export function draftOutreach(account: Account, signal: Signal): string {
  const hook = SIGNAL_HOOKS[signal.type](signal);
  return [
    `Hi ${account.name} team,`,
    ``,
    `${hook} ("${signal.sourceQuote}").`,
    ``,
    `We've helped over 500 dealerships fix this exact issue with a lightweight fix that pays for itself in the first month.`,
    ``,
    `Worth a 15-minute call this week?`,
    ``,
    `— Scout`,
  ].join("\n");
}

export function reviseDraft(previousBody: string, signal: Signal): string {
  return previousBody
    .replace(
      /We've helped over 500 dealerships fix this exact issue with a lightweight fix that pays for itself in the first month\./,
      `A few dealers nearby have tightened this up with a small process change — happy to share what worked.`
    )
    .trim();
}
