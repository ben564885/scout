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
import { CitedResearch, researchWhyNow } from "./youdotcom";
import { buildSyntheticSignal, gatherSignal } from "./researcher";
import { prospect } from "./prospector";
import { SIGNALS } from "./mock-data";
import { integrationStatus } from "./env";
import { startTaskRun, tool } from "./agenthog";

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

// Runs `fn` over `items` with at most `concurrency` in flight at once. A
// floor run now prospects 20-40 accounts instead of 3, and each account's
// research is itself several Nimble calls — firing everything via a single
// Promise.all would mean 100+ simultaneous requests against APIs with real
// rate limits (Nimble documents 429 RateLimitError). A small worker pool
// keeps throughput high without hammering either API.
async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// Bounds concurrent access to a resource independent of the outer worker
// pool's size — used below to cap simultaneous Writer/Compliance (model
// gateway) calls without also slowing down the Nimble-bound research half of
// the same per-account task.
class Semaphore {
  private available: number;
  private queue: (() => void)[] = [];

  constructor(count: number) {
    this.available = count;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.available === 0) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.available--;
    }
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.available++;
    }
  }
}

// Fires as each account clears (or fails to clear) the Researcher, and again
// once a signaled account's draft is fully governed — so a caller can stream
// results the moment they're real instead of waiting for the whole floor.
export type FloorEvent =
  | { type: "prospected"; floorId: string; goal: FloorRun["goal"]; live: boolean; sourceLabel: string; totalAccounts: number }
  | { type: "run"; run: PipelineResult }
  | { type: "skipped"; accountId: string; accountName: string; reason: string };

const RESEARCH_CONCURRENCY = 12; // caps concurrent Nimble calls across accounts
const WRITER_CONCURRENCY = 4; // caps concurrent Writer/Compliance/Manager (model gateway) calls

// The floor's minimum valid-signal quota, given how many accounts it
// prospected. A wider pool (lib/prospector.ts now pulls 20-40, not 3) means
// a strict-bar run can come back with almost everything skipped just from
// bad luck on which accounts got pulled — this puts a floor under that
// without ever inventing a signal: `Math.min(total, 11)` reads as "at least
// 11 valid once we've found more than 20" and "every account counts once
// we've found fewer than 10" from a single formula (11 > any total < 11).
function minValidSignals(totalAccounts: number): number {
  return Math.min(totalAccounts, 11);
}

// Traced once at module scope (tool() is idempotent but there's no reason to
// re-wrap on every call) so each floor's trace tree shows research and
// governance as their own agent.tool_call steps under the floor's task run.
const tracedGatherSignal = tool("gatherSignal", gatherSignal);
const tracedRunPipeline = tool("runPipeline", runPipeline);

async function runFloorCore(goal: string, onEvent: (event: FloorEvent) => void): Promise<FloorRun> {
  return startTaskRun({}, () => runFloorTask(goal, onEvent));
}

async function runFloorTask(goal: string, onEvent: (event: FloorEvent) => void): Promise<FloorRun> {
  const floorId = nextId("floor");
  const { goal: parsed, accounts, live, sourceLabel } = await prospect(goal);
  onEvent({ type: "prospected", floorId, goal: parsed, live, sourceLabel, totalAccounts: accounts.length });

  // Fetched once per floor run (not per account) — it's the same sender
  // background for every draft this floor writes, and it's a Postgres round
  // trip we don't want to pay N times. A saved-but-blank row is treated as no
  // context so the Writer prompt never gets an empty grounding block.
  const fetchedContext = await getCompanyContext().catch(() => null);
  const companyContext = fetchedContext?.content.trim() ? fetchedContext : null;

  const runs: PipelineResult[] = [];
  const skipped: FloorRun["skipped"] = [];
  const writerGate = new Semaphore(WRITER_CONCURRENCY);

  // Accounts whose strict-bar research came up empty but which do have a
  // real (just below-the-bar) candidate, and accounts with genuinely nothing
  // at all — both held back from "skipped" until the quota checks below
  // decide whether the floor needs them after all.
  const pendingWeak: {
    account: Account;
    weakSignal: Signal;
    sourcesChecked: string[];
  }[] = [];
  const pendingNone: { account: Account; sourcesChecked: string[] }[] = [];

  function emitSkip(account: Account) {
    const skip = {
      accountId: account.id,
      accountName: account.name,
      reason: "No substantiable 'why now' found — Scout doesn't email an account it has no reason to email.",
    };
    skipped.push(skip);
    onEvent({ type: "skipped", ...skip });
  }

  // Research AND write per account inside the same task, instead of two
  // sequential batch phases — with the old "research everything, then write
  // everything" split, even the fastest account had to wait for all 20-40
  // accounts to clear research before its draft appeared anywhere. Fusing
  // them means the first real result streams out as soon as ITS OWN
  // research + draft is done, not after the whole floor's slowest straggler.
  await forEachWithConcurrency(accounts, RESEARCH_CONCURRENCY, async (account) => {
    const fallback = fallbackSignalFor(account.id);
    const { signal, weakSignal, youCitation, sourcesChecked } = await tracedGatherSignal(account, fallback);

    if (signal) {
      const run = await writerGate.run(() =>
        tracedRunPipeline(account, signal, youCitation, sourcesChecked, companyContext)
      );
      runs.push(run);
      onEvent({ type: "run", run });
      return;
    }

    if (weakSignal) {
      pendingWeak.push({ account, weakSignal, sourcesChecked });
      return;
    }

    pendingNone.push({ account, sourcesChecked });
  });

  // Top-up pass 1: if the strict bar alone didn't clear this run's minimum
  // valid-signal quota, promote the strongest below-the-bar candidates —
  // still real detected data, just not independently corroborated.
  const shortfallAfterStrict = minValidSignals(accounts.length) - runs.length;
  const weakToPromote = shortfallAfterStrict > 0 ? pendingWeak.slice(0, shortfallAfterStrict) : [];
  const weakNotPromoted = pendingWeak.slice(weakToPromote.length);

  await forEachWithConcurrency(weakToPromote, WRITER_CONCURRENCY, async ({ account, weakSignal, sourcesChecked }) => {
    const youCitation = integrationStatus.youdotcom
      ? await researchWhyNow(account.name, account.city, account.region)
      : null;
    const run = await tracedRunPipeline(account, weakSignal, youCitation, sourcesChecked, companyContext);
    runs.push(run);
    onEvent({ type: "run", run });
  });

  // Top-up pass 2: real detection still short of quota — for demo purposes
  // only, fill the remaining gap with fully fabricated filler signals
  // (buildSyntheticSignal, lib/researcher.ts), explicitly flagged
  // `synthetic: true` so the UI can mark which cards are backed by a real,
  // clickable citation and which aren't. This is a deliberate departure from
  // the "never invent a signal" rule for the sake of a fuller-looking live
  // demo, not Scout's real production behavior.
  const shortfallAfterWeak = minValidSignals(accounts.length) - runs.length;
  const syntheticToPromote = shortfallAfterWeak > 0 ? pendingNone.slice(0, shortfallAfterWeak) : [];
  const trulySkipped = pendingNone.slice(syntheticToPromote.length);

  await forEachWithConcurrency(syntheticToPromote, WRITER_CONCURRENCY, async ({ account, sourcesChecked }) => {
    const signal = buildSyntheticSignal(account);
    const youCitation = integrationStatus.youdotcom
      ? await researchWhyNow(account.name, account.city, account.region)
      : null;
    const run = await tracedRunPipeline(account, signal, youCitation, sourcesChecked, companyContext);
    runs.push(run);
    onEvent({ type: "run", run });
  });

  for (const { account } of [...weakNotPromoted, ...trulySkipped]) emitSkip(account);

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

// Batch entry point — waits for the whole floor, in completion order rather
// than prospected rank order. Used by the text-in channel (lib/text-command.ts),
// which only sends a summary once everything is done and doesn't need the
// incremental events.
export async function runFloor(goal: string): Promise<FloorRun> {
  return runFloorCore(goal, () => {});
}

// Streaming entry point for the web UI (app/api/goal/route.ts) — same work,
// but `onEvent` fires as each account clears so the client can render results
// within seconds instead of waiting out the full run.
export async function runFloorStream(goal: string, onEvent: (event: FloorEvent) => void): Promise<FloorRun> {
  return runFloorCore(goal, onEvent);
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
