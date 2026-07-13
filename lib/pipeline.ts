import { Account, AuditLogEntry, CompanyContext, Draft, FloorRun, PipelineResult, Signal } from "./types";
import { draftOutreach, reviseDraft } from "./writer";
import { reviewDraft } from "./policies";
import {
  addDraft,
  appendAudit,
  clearPendingEscalation,
  createRun,
  getRun,
  nextId,
  seedAccountAndSignal,
  setPendingEscalation,
  updateDraftStatus,
} from "./store";
import { mirrorApproval } from "./insforge";
import { getCompanyContext } from "./company-context";
import { CitedResearch } from "./youdotcom";
import { gatherSignal } from "./researcher";
import { prospect } from "./prospector";
import { SIGNALS } from "./mock-data";

// Orchestrates the governance loop from PRD §6: Prospector -> Researcher ->
// Writer -> Compliance (veto -> revise, up to MAX_REVISIONS) -> Manager
// (auto-approve routine / escalate high_value). Every step writes an
// audit_log row with the actor + authority rule that fired (§6.3), which is
// exactly what the timeline UI streams.

const MAX_REVISIONS = 2;

function log(
  runId: string,
  account: Account,
  entry: Omit<AuditLogEntry, "id" | "createdAt" | "accountId" | "accountName">
) {
  const full: AuditLogEntry = {
    ...entry,
    id: nextId("audit"),
    createdAt: new Date().toISOString(),
    accountId: account.id,
    accountName: account.name,
  };
  appendAudit(runId, full);
  return full;
}

export async function runPipeline(
  account: Account,
  signal: Signal,
  youCitation: CitedResearch | null = null,
  sourcesChecked: string[] = [],
  companyContext: CompanyContext | null = null
): Promise<PipelineResult> {
  const runId = createRun(account, signal);
  seedAccountAndSignal(account, signal);

  log(runId, account, {
    actor: "prospector",
    action: "delegate",
    targetId: account.id,
    authorityRule: "prospector:pull_web_data",
    channel: "system",
    detail: `Prospector delegated ${account.name} (est. $${account.estValueUsd.toLocaleString()}, ${account.valueTier.replace("_", " ")}) to Researcher via Band.`,
  });

  log(runId, account, {
    actor: "researcher",
    action: "handoff",
    targetId: signal.id,
    authorityRule: "researcher:attach_signal_with_citation",
    channel: "system",
    detail:
      `Researcher${sourcesChecked.length ? ` checked ${sourcesChecked.join(", ")} and` : ""} attached signal "${signal.summary}" — cited ${signal.sourceUrl}.`,
  });

  if (youCitation) {
    log(runId, account, {
      actor: "researcher",
      action: "handoff",
      targetId: signal.id,
      authorityRule: "researcher:supplement_with_youdotcom",
      channel: "system",
      detail: `Researcher supplemented with You.com research (${youCitation.sources.length} source${youCitation.sources.length === 1 ? "" : "s"}): ${youCitation.content.slice(0, 200)}${youCitation.content.length > 200 ? "…" : ""}`,
    });
  }

  const body = await draftOutreach(account, signal, youCitation, companyContext);
  let draft: Draft = {
    id: nextId("draft"),
    accountId: account.id,
    signalId: signal.id,
    channel: "email",
    body,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  addDraft(runId, draft);

  log(runId, account, {
    actor: "writer",
    action: "draft",
    targetId: draft.id,
    authorityRule: "writer:draft_outreach",
    channel: "system",
    detail: `Writer drafted outreach for ${account.name} off signal "${signal.type}"${
      companyContext ? `, grounded in company context (${companyContext.sourceLabel ?? companyContext.sourceType})` : ""
    }.`,
  });

  let revisions = 0;
  while (revisions < MAX_REVISIONS) {
    const verdict = reviewDraft(draft.body, signal.sourceQuote, {
      signalSourceUrl: signal.sourceUrl,
      youCitation,
    });
    if (!verdict.vetoed) {
      if (verdict.citationsChecked) {
        log(runId, account, {
          actor: "compliance",
          action: "verify",
          targetId: draft.id,
          authorityRule: "compliance:check_citations",
          channel: "system",
          detail: `Compliance verified the draft's claims against ${verdict.citationsChecked} known source${verdict.citationsChecked === 1 ? "" : "s"} — no fabricated citations found.`,
        });
      }
      break;
    }

    updateDraftStatus(runId, draft.id, "vetoed");
    log(runId, account, {
      actor: "compliance",
      action: "veto",
      targetId: draft.id,
      authorityRule: verdict.ruleId,
      channel: "system",
      detail: `VETOED (${verdict.ruleName}): ${verdict.reason}`,
    });

    const revisedBody = await reviseDraft(draft.body, signal, verdict.reason ?? "", companyContext);
    const revised: Draft = {
      id: nextId("draft"),
      accountId: account.id,
      signalId: signal.id,
      channel: "email",
      body: revisedBody,
      status: "revised",
      revisionOf: draft.id,
      createdAt: new Date().toISOString(),
    };
    addDraft(runId, revised);
    draft = revised;
    revisions += 1;

    log(runId, account, {
      actor: "writer",
      action: "revise",
      targetId: draft.id,
      authorityRule: "writer:draft_outreach",
      channel: "system",
      detail: `Writer revised the draft to resolve the veto.`,
    });
  }

  const requiresHuman = account.valueTier === "high_value";

  if (requiresHuman) {
    updateDraftStatus(runId, draft.id, "escalated");
    setPendingEscalation(runId, draft.id, account.name);
    log(runId, account, {
      actor: "manager",
      action: "escalate",
      targetId: draft.id,
      authorityRule: "manager:escalate_high_value",
      channel: "band",
      detail: `Manager escalated ${account.name} (est. $${account.estValueUsd.toLocaleString()}) — Manager cannot approve high-value accounts. Routed to human via Band.`,
    });
  } else {
    updateDraftStatus(runId, draft.id, "auto_approved");
    mirrorApproval({ draftId: draft.id, decidedBy: "manager_auto", decision: "approve", channel: "band" });
    log(runId, account, {
      actor: "manager",
      action: "auto_approve",
      targetId: draft.id,
      authorityRule: "manager:auto_approve_routine",
      channel: "system",
      detail: `Manager auto-approved ${account.name} — routine tier, within authority.`,
    });
  }

  const run = getRun(runId)!;
  return {
    runId,
    account,
    signal,
    drafts: run.drafts,
    finalDraft: draft,
    auditLog: run.auditLog,
    requiresHuman,
  };
}

// ─── The floor (PRD §5) ──────────────────────────────────────────────────────
// One plain-language goal in; the whole team runs without step-by-step
// clicking. This is the "AI employee, not a tool" test: the human states an
// outcome and reviews finished work, they do not drive each step.

export async function runFloor(goal: string): Promise<FloorRun> {
  const floorId = nextId("floor");
  const { goal: parsed, accounts, live, sourceLabel } = await prospect(goal);

  // Fetched once per floor run (not per account) — it's the same sender
  // background for every draft this floor writes, and it's a Postgres round
  // trip we don't want to pay N times. A saved-but-blank row is treated as no
  // context so the Writer prompt never gets an empty grounding block.
  const fetchedContext = await getCompanyContext().catch(() => null);
  const companyContext = fetchedContext?.content.trim() ? fetchedContext : null;

  const runs: PipelineResult[] = [];
  const skipped: FloorRun["skipped"] = [];

  // Researching each account is an independent batch of network calls (up to
  // 5 Nimble pulls + a You.com call apiece) — run them concurrently instead
  // of one account at a time, or the floor's latency scales linearly with
  // account count and blows past the route's maxDuration.
  const researched = await Promise.all(
    accounts.map(async (account) => {
      // Mock accounts carry a curated signal; live-prospected ones don't, so
      // the Researcher has to actually find one. No signal, no outreach.
      const fallback = fallbackSignalFor(account.id);
      const result = await gatherSignal(account, fallback);
      return { account, ...result };
    })
  );

  for (const { account, signal, youCitation, sourcesChecked } of researched) {
    if (!signal) {
      skipped.push({
        accountId: account.id,
        accountName: account.name,
        reason: "No substantiable 'why now' found — Scout doesn't email an account it has no reason to email.",
      });
      continue;
    }

    runs.push(await runPipeline(account, signal, youCitation, sourcesChecked, companyContext));
  }

  const auditLog = runs.flatMap((run) => run.auditLog);

  return {
    floorId,
    goal: parsed,
    prospecting: { live, sourceLabel },
    runs,
    skipped,
    auditLog,
  };
}

// Curated signals exist only for the three cached demo accounts; a live Nimble
// pull returns dealers we have no seed data for, and those must stand on real
// detected signals or be skipped.
function fallbackSignalFor(accountId: string): Signal | null {
  return SIGNALS.find((s) => s.accountId === accountId) ?? null;
}

export function recordHumanDecision(
  runId: string,
  draftId: string,
  decision: "approve" | "reject",
  note?: string,
  channel: "band" | "imessage" = "band"
): AuditLogEntry | null {
  const run = getRun(runId);
  if (!run) return null;

  updateDraftStatus(runId, draftId, decision === "approve" ? "approved" : "rejected");
  clearPendingEscalation(draftId);
  mirrorApproval({ draftId, decidedBy: "human", decision, channel, note });

  const via = channel === "imessage" ? "by text" : "in Band";
  return log(runId, run.account, {
    actor: "human",
    action: decision,
    targetId: draftId,
    authorityRule: "human:approve_high_value",
    channel,
    detail:
      decision === "approve"
        ? `Human approved ${via}${note ? ` — "${note}"` : ""}. Band recorded the decision and released the send.`
        : `Human rejected ${via}${note ? ` — "${note}"` : ""}. Band recorded the decision and killed the send.`,
  });
}

export { getRun };
