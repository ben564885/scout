"use client";

import { useEffect, useMemo, useState } from "react";
import { Account, AuditLogEntry, PipelineResult, Signal } from "@/lib/types";
import { ACTOR_META, actionBadge } from "@/lib/actor-meta";

type AccountWithSignal = Account & { signal: Signal | null };
type IntegrationStatus = Record<"insforge" | "nimble" | "youdotcom" | "band" | "hydra" | "kylon", boolean>;

const REVEAL_INTERVAL_MS = 550;

const INTEGRATION_LABELS: { key: keyof IntegrationStatus; label: string }[] = [
  { key: "band", label: "Band" },
  { key: "insforge", label: "InsForge" },
  { key: "nimble", label: "Nimble" },
  { key: "youdotcom", label: "You.com" },
  { key: "hydra", label: "Hydra" },
  { key: "kylon", label: "Kylon" },
];

export default function GovernanceBoard() {
  const [accounts, setAccounts] = useState<AccountWithSignal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts);
        if (data.accounts.length) setSelectedId(data.accounts[0].id);
      });
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => setIntegrations(data.integrations));
  }, []);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    if (!result) return;
    if (visibleCount >= result.auditLog.length) return;
    const t = setTimeout(() => setVisibleCount((c) => c + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [result, visibleCount]);

  const visibleLog = useMemo(
    () => (result ? result.auditLog.slice(0, visibleCount) : []),
    [result, visibleCount]
  );

  const revealDone = !!result && visibleCount >= result.auditLog.length;
  const currentDraft = result?.drafts[result.drafts.length - 1] ?? null;

  async function runWorkforce() {
    if (!selected) return;
    setRunning(true);
    setResult(null);
    setVisibleCount(0);
    setDecisionNote("");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selected.id }),
      });
      const data: PipelineResult = await res.json();
      setResult(data);
    } finally {
      setRunning(false);
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!result) return;
    setDeciding(true);
    try {
      const res = await fetch(`/api/runs/${result.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: result.finalDraft.id,
          decision,
          note: decisionNote || undefined,
        }),
      });
      const data = await res.json();
      if (data.entry) {
        const newStatus = decision === "approve" ? "approved" : "rejected";
        setResult((prev) =>
          prev
            ? {
                ...prev,
                auditLog: [...prev.auditLog, data.entry],
                finalDraft: { ...prev.finalDraft, status: newStatus },
                drafts: prev.drafts.map((d) =>
                  d.id === prev.finalDraft.id ? { ...d, status: newStatus } : d
                ),
              }
            : prev
        );
        setVisibleCount((c) => c + 1);
      }
    } finally {
      setDeciding(false);
    }
  }

  const pendingHumanApproval =
    revealDone && result?.requiresHuman && result.finalDraft.status === "escalated";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Scout <span className="text-neutral-500 font-normal">— an AI SDR workforce you can trust to run autonomously</span>
        </h1>
        {integrations && (
          <div className="flex items-center gap-3 flex-wrap">
            {INTEGRATION_LABELS.map(({ key, label }) => {
              const live = integrations[key];
              return (
                <div key={key} className="flex items-center gap-1.5 text-xs" title={live ? `${label}: live` : `${label}: mock fallback`}>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-neutral-700"}`}
                  />
                  <span className={live ? "text-neutral-300" : "text-neutral-600"}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-[calc(100vh-65px)]">
        {/* LEFT: account / signal / draft */}
        <section className="border-r border-neutral-800 p-6 space-y-6">
          <div>
            <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">Accounts</h2>
            <div className="space-y-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setSelectedId(a.id);
                    setResult(null);
                    setVisibleCount(0);
                  }}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition ${
                    selectedId === a.id
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        a.valueTier === "high_value"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {a.valueTier === "high_value" ? "high value" : "routine"}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {a.city}, {a.region} · est. ${a.estValueUsd.toLocaleString()}
                  </div>
                  {a.signal && (
                    <div className="text-xs text-neutral-400 mt-2 line-clamp-2">⚠ {a.signal.summary}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {selected?.signal && (
            <div className="rounded-lg border border-neutral-800 p-4 space-y-2">
              <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wide">Signal</h3>
              <p className="text-sm">{selected.signal.summary}</p>
              <blockquote className="text-xs italic text-neutral-500 border-l-2 border-neutral-700 pl-3">
                "{selected.signal.sourceQuote}"
              </blockquote>
              <a
                href={selected.signal.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-400 hover:underline break-all"
              >
                {selected.signal.sourceUrl}
              </a>
            </div>
          )}

          <button
            onClick={runWorkforce}
            disabled={!selected || running}
            className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-medium py-2.5 transition"
          >
            {running ? "Running workforce…" : "Run Workforce"}
          </button>

          {currentDraft && (
            <div className="rounded-lg border border-neutral-800 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wide">Draft</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                  {currentDraft.status}
                </span>
              </div>
              <pre className="whitespace-pre-wrap text-sm font-sans text-neutral-200">{currentDraft.body}</pre>
            </div>
          )}

          {pendingHumanApproval && (
            <div className="rounded-lg border border-emerald-700 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <span>📱</span>
                <span>iMessage — escalated for your approval</span>
              </div>
              <p className="text-sm text-neutral-300">
                {result?.account.name} is a high-value account (est. $
                {result?.account.estValueUsd.toLocaleString()}). Approve to send?
              </p>
              <input
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="optional note…"
                className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-1.5 text-sm outline-none focus:border-emerald-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => decide("approve")}
                  disabled={deciding}
                  className="flex-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide("reject")}
                  disabled={deciding}
                  className="flex-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium py-2"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: governance timeline */}
        <section className="p-6">
          <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">Governance Timeline</h2>
          {!result && (
            <p className="text-sm text-neutral-600">
              Select an account and run the workforce to see every delegation, handoff, veto, and approval as it happens.
            </p>
          )}
          <ol className="space-y-3">
            {visibleLog.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} />
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function TimelineRow({ entry }: { entry: AuditLogEntry }) {
  const meta = ACTOR_META[entry.actor];
  const badge = actionBadge(entry.action);
  return (
    <li className="flex gap-3 rounded-lg border border-neutral-800 p-3 animate-[fadeIn_0.3s_ease-out]">
      <div className={`text-lg ${meta.color}`}>{meta.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.className}`}>{badge.label}</span>
          {entry.authorityRule && (
            <span className="text-[10px] text-neutral-500 font-mono">{entry.authorityRule}</span>
          )}
        </div>
        <p className="text-sm text-neutral-300 mt-1">{entry.detail}</p>
      </div>
    </li>
  );
}
