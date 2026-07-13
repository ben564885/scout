import { Policy } from "./types";
import { CitedResearch } from "./youdotcom";

// What Compliance enforces. Hydra DB would mirror/persist this once wired
// in; for now it's the static rule set the pipeline checks drafts against.
export const POLICIES: Policy[] = [
  {
    id: "pol-unverified-claim",
    name: "No unverifiable claims",
    rule: "Draft may not state a statistic, client count, or outcome that does not appear in the signal's cited source.",
    severity: "veto",
    active: true,
  },
  {
    id: "pol-cite-signal",
    name: "Must reference the cited signal",
    rule: "Draft must reference the specific, dated detail from the signal — not a generic pain point.",
    severity: "veto",
    active: true,
  },
  {
    id: "pol-no-overpromise",
    name: "No guarantees",
    rule: "Draft may not promise a guaranteed or risk-free outcome.",
    severity: "veto",
    active: true,
  },
  {
    id: "pol-uncited-source",
    name: "No fabricated citations",
    rule: "Any source URL the draft references must appear in the signal's citation or the Researcher's You.com sources — not be invented.",
    severity: "veto",
    active: true,
  },
];

const UNVERIFIED_CLAIM_PATTERNS = [
  /\bover \d[\d,]* (dealerships|clients|customers|dealers)\b/i,
  /\b(#1|number one|best in (the|)\s*\w*)\b/i,
  /\bindustry[- ]leading\b/i,
  /\bproven track record\b/i,
];

const OVERPROMISE_PATTERNS = [
  /\bguarantee(d)?\b/i,
  /\brisk[- ]free\b/i,
  /\b100% (satisfaction|results|guaranteed)\b/i,
];

export type ComplianceVerdict = {
  vetoed: boolean;
  ruleId?: string;
  ruleName?: string;
  reason?: string;
  citationsChecked?: number;
};

const URL_PATTERN = /https?:\/\/[^\s)"'<>]+/g;

export function reviewDraft(
  body: string,
  signalQuote: string,
  citationContext: { signalSourceUrl: string; youCitation: CitedResearch | null } | null = null
): ComplianceVerdict {
  for (const pattern of UNVERIFIED_CLAIM_PATTERNS) {
    if (pattern.test(body)) {
      const rule = POLICIES.find((p) => p.id === "pol-unverified-claim")!;
      return {
        vetoed: true,
        ruleId: rule.id,
        ruleName: rule.name,
        reason: `Unverified claim detected ("${body.match(pattern)?.[0]}") — no citation supports this in the signal.`,
      };
    }
  }

  for (const pattern of OVERPROMISE_PATTERNS) {
    if (pattern.test(body)) {
      const rule = POLICIES.find((p) => p.id === "pol-no-overpromise")!;
      return {
        vetoed: true,
        ruleId: rule.id,
        ruleName: rule.name,
        reason: `Overpromise language detected ("${body.match(pattern)?.[0]}") — Scout never guarantees outcomes on a first touch.`,
      };
    }
  }

  const quoteFragment = signalQuote.split(" ").slice(0, 3).join(" ");
  if (!body.toLowerCase().includes(quoteFragment.toLowerCase().slice(0, 6))) {
    const rule = POLICIES.find((p) => p.id === "pol-cite-signal")!;
    return {
      vetoed: true,
      ruleId: rule.id,
      ruleName: rule.name,
      reason: "Draft doesn't ground itself in the specific cited signal — reads as generic outreach.",
    };
  }

  let citationsChecked: number | undefined;
  if (citationContext) {
    const knownSources = new Set([
      citationContext.signalSourceUrl,
      ...(citationContext.youCitation?.sources.map((s) => s.url) ?? []),
    ]);
    citationsChecked = knownSources.size;

    const citedUrls = body.match(URL_PATTERN) ?? [];
    const fabricated = citedUrls.find((url) => !knownSources.has(url));
    if (fabricated) {
      const rule = POLICIES.find((p) => p.id === "pol-uncited-source")!;
      return {
        vetoed: true,
        ruleId: rule.id,
        ruleName: rule.name,
        reason: `Draft cites "${fabricated}", which isn't among the ${knownSources.size} known sources (signal citation + You.com research) — looks fabricated.`,
        citationsChecked,
      };
    }
  }

  return { vetoed: false, citationsChecked };
}
