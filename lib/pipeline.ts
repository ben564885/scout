import { Account, AuditLogEntry, Draft, PipelineResult, Signal } from "./types";
import { draftOutreach, reviseDraft } from "./writer";
import { reviewDraft } from "./policies";
import { addDraft, appendAudit, createRun, getRun, nextId, seedAccountAndSignal, updateDraftStatus } from "./store";
import { mirrorApproval } from "./insforge";
import { CitedResearch } from "./youdotcom";

// Orchestrates the governance loop from PRD §6: Prospector -> Researcher ->
// Writer -> Compliance (veto -> revise, up to MAX_REVISIONS) -> Manager
// (auto-approve routine / escalate high_value). Every step writes an
// audit_log row with the actor + authority rule that fired (§6.3), which is
// exactly what the timeline UI streams.

const MAX_REVISIONS = 2;

function log(runId: string, entry: Omit<AuditLogEntry, "id" | "createdAt">) {
  const full: AuditLogEntry = {
    ...entry,
    id: nextId("audit"),
    createdAt: new Date().toISOString(),
  };
  appendAudit(runId, full);
  return full;
}

export function runPipeline(account: Account, signal: Signal, youCitation: CitedResearch | null = null): PipelineResult {
  const runId = createRun(account, signal);
  seedAccountAndSignal(account, signal);

  log(runId, {
    actor: "prospector",
    action: "delegate",
    targetId: account.id,
    authorityRule: "prospector:pull_web_data",
    channel: "system",
    detail: `Prospector delegated ${account.name} to Researcher via Band.`,
  });

  log(runId, {
    actor: "researcher",
    action: "handoff",
    targetId: signal.id,
    authorityRule: "researcher:attach_signal_with_citation",
    channel: "system",
    detail: `Researcher attached signal "${signal.summary}" — cited ${signal.sourceUrl}.`,
  });

  if (youCitation) {
    log(runId, {
      actor: "researcher",
      action: "handoff",
      targetId: signal.id,
      authorityRule: "researcher:supplement_with_youdotcom",
      channel: "system",
      detail: `Researcher supplemented with You.com research (${youCitation.sources.length} source${youCitation.sources.length === 1 ? "" : "s"}): ${youCitation.content.slice(0, 200)}${youCitation.content.length > 200 ? "…" : ""}`,
    });
  }

  let body = draftOutreach(account, signal);
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

  log(runId, {
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
        log(runId, {
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
    log(runId, {
      actor: "compliance",
      action: "veto",
      targetId: draft.id,
      authorityRule: verdict.ruleId,
      channel: "system",
      detail: `VETOED (${verdict.ruleName}): ${verdict.reason}`,
    });

    const revisedBody = reviseDraft(draft.body, signal);
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

    log(runId, {
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
    log(runId, {
      actor: "manager",
      action: "escalate",
      targetId: draft.id,
      authorityRule: "manager:escalate_high_value",
      channel: "band",
      detail: `Manager escalated ${account.name} (est. $${account.estValueUsd.toLocaleString()}) — Manager cannot approve high-value accounts. Routed to human via Band → iMessage.`,
    });
  } else {
    updateDraftStatus(runId, draft.id, "auto_approved");
    mirrorApproval({ draftId: draft.id, decidedBy: "manager_auto", decision: "approve", channel: "band" });
    log(runId, {
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

export function recordHumanDecision(
  runId: string,
  draftId: string,
  decision: "approve" | "reject",
  note?: string
): AuditLogEntry | null {
  const run = getRun(runId);
  if (!run) return null;

  updateDraftStatus(runId, draftId, decision === "approve" ? "approved" : "rejected");
  mirrorApproval({ draftId, decidedBy: "human", decision, channel: "imessage", note });

  return log(runId, {
    actor: "human",
    action: decision,
    targetId: draftId,
    authorityRule: "human:approve_high_value",
    channel: "imessage",
    detail:
      decision === "approve"
        ? `Human approved via iMessage${note ? ` — "${note}"` : ""}. Band recorded the decision and released the send.`
        : `Human rejected via iMessage${note ? ` — "${note}"` : ""}. Band recorded the decision and killed the send.`,
  });
}

export { getRun };
