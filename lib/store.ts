import { Account, AuditLogEntry, Draft, Signal } from "./types";
import { mirrorAccount, mirrorAuditLog, mirrorDraft, mirrorDraftStatus, mirrorSignal } from "./insforge";

// In-memory store, kept as the source of truth so the live demo never stalls
// on network latency. Every write also fires a best-effort, non-blocking
// mirror to InsForge Postgres (lib/insforge.ts) when INSFORGE_BASE_URL/
// INSFORGE_API_KEY are set — a no-op otherwise. Schema: migrations/001_init.sql.

type RunState = {
  account: Account;
  signal: Signal;
  drafts: Draft[];
  auditLog: AuditLogEntry[];
};

const runs = new Map<string, RunState>();
let counter = 0;

// The one escalation currently awaiting a human decision over text. Scoped
// to a single pointer, not a queue — matches the PRD's single-demo-account
// assumption (§10: "Auth / multi-tenant beyond a single demo account" is
// explicitly out of scope), so a bare "approve" text has an unambiguous
// target. The Band UI approval flow (app/api/runs/[id]/approve) doesn't need
// this pointer at all since the browser already knows which draft it's
// approving.
type PendingEscalation = { runId: string; draftId: string; accountName: string };
let pendingEscalation: PendingEscalation | null = null;

export function setPendingEscalation(runId: string, draftId: string, accountName: string) {
  pendingEscalation = { runId, draftId, accountName };
}

export function getPendingEscalation(): PendingEscalation | null {
  return pendingEscalation;
}

export function clearPendingEscalation(draftId: string) {
  if (pendingEscalation?.draftId === draftId) pendingEscalation = null;
}

export function nextId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function createRun(account: Account, signal: Signal): string {
  const id = nextId("run");
  runs.set(id, { account, signal, drafts: [], auditLog: [] });
  return id;
}

export function getRun(id: string): RunState | undefined {
  return runs.get(id);
}

export function appendAudit(runId: string, entry: AuditLogEntry) {
  const run = runs.get(runId);
  if (!run) return;
  run.auditLog.push(entry);
  mirrorAuditLog(entry);
}

export function addDraft(runId: string, draft: Draft) {
  const run = runs.get(runId);
  if (!run) return;
  run.drafts.push(draft);
  mirrorDraft(draft);
}

export function updateDraftStatus(runId: string, draftId: string, status: Draft["status"]) {
  const run = runs.get(runId);
  if (!run) return;
  const draft = run.drafts.find((d) => d.id === draftId);
  if (draft) draft.status = status;
  mirrorDraftStatus(draftId, status);
}

export function seedAccountAndSignal(account: Account, signal: Signal) {
  mirrorAccount(account);
  mirrorSignal(signal);
}
