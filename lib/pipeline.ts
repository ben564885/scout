import { Account, AuditLogEntry, Draft, FloorRun, PipelineResult, Signal } from "./types";
import { draftOutreach, reviseDraft } from "./writer";
import { reviewDraft } from "./policies";
import { addDraft, appendAudit, createRun, getRun, nextId, seedAccountAndSignal, updateDraftStatus } from "./store";
import { mirrorApproval } from "./insforge";
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
  sourcesChecked: string[] = []
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

  const body = await draftOutreach(account, signal, youCitation);
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
    detail: `Writer drafted outreach for ${account.name} off signal "${signal.type}".`,
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

    const revisedBody = await reviseDraft(draft.body, signal, verdict.reason ?? "");
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

  const runs: PipelineResult[] = [];
  const skipped: FloorRun["skipped"] = [];

  for (const account of accounts) {
    // Mock accounts carry a curated signal; live-prospected ones don't, so the
    // Researcher has to actually find one. No signal, no outreach.
    const fallback = fallbackSignalFor(account.id);
    const { signal, youCitation, sourcesChecked } = await gatherSignal(account, fallback);

    if (!signal) {
      skipped.push({
        accountId: account.id,
        accountName: account.name,
        reason: "No substantiable 'why now' found — Scout doesn't email an account it has no reason to email.",
      });
      continue;
    }

    runs.push(await runPipeline(account, signal, youCitation, sourcesChecked));
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
  note?: string
): AuditLogEntry | null {
  const run = getRun(runId);
  if (!run) return null;

  updateDraftStatus(runId, draftId, decision === "approve" ? "approved" : "rejected");
  mirrorApproval({ draftId, decidedBy: "human", decision, channel: "band", note });

  return log(runId, run.account, {
    actor: "human",
    action: decision,
    targetId: draftId,
    authorityRule: "human:approve_high_value",
    channel: "band",
    detail:
      decision === "approve"
        ? `Human approved${note ? ` — "${note}"` : ""}. Band recorded the decision and released the send.`
        : `Human rejected${note ? ` — "${note}"` : ""}. Band recorded the decision and killed the send.`,
  });
}

export { getRun };
