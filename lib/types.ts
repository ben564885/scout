// Mirrors the InsForge Postgres schema in the PRD (§10).
// Runs in-memory for the hackathon build; swap lib/store.ts for a real
// InsForge/Postgres client once credentials are provisioned.

export type ValueTier = "routine" | "high_value";

export type Account = {
  id: string;
  name: string;
  vertical: string;
  city: string;
  region: string;
  website: string;
  contactPath: string;
  valueTier: ValueTier;
  estValueUsd: number;
};

export type SignalType =
  | "review_cluster"
  | "new_location"
  | "hiring"
  | "reputation_dip";

export type Signal = {
  id: string;
  accountId: string;
  type: SignalType;
  summary: string;
  strength: number; // 0-100
  sourceUrl: string;
  sourceQuote: string;
  detectedAt: string;
};

export type DraftStatus =
  | "pending"
  | "vetoed"
  | "revised"
  | "auto_approved"
  | "escalated"
  | "approved"
  | "edited"
  | "rejected"
  | "sent";

export type Draft = {
  id: string;
  accountId: string;
  signalId: string;
  channel: "email";
  body: string;
  status: DraftStatus;
  revisionOf?: string;
  createdAt: string;
};

export type Approval = {
  id: string;
  draftId: string;
  decidedBy: "manager_auto" | "human";
  decision: "approve" | "edit" | "reject";
  channel: "band" | "imessage";
  note?: string;
  decidedAt: string;
};

export type AuditActor =
  | "prospector"
  | "researcher"
  | "writer"
  | "compliance"
  | "manager"
  | "human";

export type AuditAction =
  | "delegate"
  | "handoff"
  | "draft"
  | "verify"
  | "veto"
  | "revise"
  | "escalate"
  | "auto_approve"
  | "approve"
  | "reject"
  | "send";

export type AuditLogEntry = {
  id: string;
  actor: AuditActor;
  action: AuditAction;
  targetId?: string;
  authorityRule?: string;
  channel?: "band" | "imessage" | "system";
  detail: string;
  createdAt: string;
  // Stamped so a single merged timeline can attribute each line to the account
  // it was about, once the floor runs many accounts off one goal.
  accountId?: string;
  accountName?: string;
};

// Settings page: the sender's own company background, used to ground Writer
// drafts. Single row, sourced from a pasted URL, an uploaded file, or manual
// text.
export type CompanyContext = {
  content: string;
  sourceType: "manual" | "url" | "file";
  sourceLabel: string | null;
  fileUrl: string | null;
  updatedAt: string | null;
};

export type Policy = {
  id: string;
  name: string;
  rule: string;
  severity: "veto" | "warn";
  active: boolean;
};

export type PipelineResult = {
  runId: string;
  account: Account;
  signal: Signal;
  drafts: Draft[]; // original + any revisions, in order
  finalDraft: Draft;
  auditLog: AuditLogEntry[];
  requiresHuman: boolean;
};

// One plain-language goal in, a whole floor's worth of work out (PRD §5).
export type FloorRun = {
  floorId: string;
  goal: {
    raw: string;
    city: string;
    region: string;
    vertical: string;
  };
  prospecting: {
    live: boolean; // did Nimble build this list, or is it the cached fallback?
    sourceLabel: string;
  };
  runs: PipelineResult[];
  // Accounts the Researcher could not substantiate a "why now" for. Scout does
  // not email an account it has no reason to email.
  skipped: { accountId: string; accountName: string; reason: string }[];
  auditLog: AuditLogEntry[]; // merged across every run, in order
};
