import { AuditAction, AuditActor } from "./types";

export const ACTOR_META: Record<AuditActor, { label: string; icon: string; color: string }> = {
  prospector: { label: "Prospector", icon: "🔍", color: "text-sky-400" },
  researcher: { label: "Researcher", icon: "📚", color: "text-teal-400" },
  writer: { label: "Writer", icon: "✍️", color: "text-violet-400" },
  compliance: { label: "Compliance", icon: "🛡️", color: "text-rose-400" },
  manager: { label: "Manager", icon: "📋", color: "text-amber-400" },
  human: { label: "You", icon: "👤", color: "text-emerald-400" },
};

export function actionBadge(action: AuditAction): { label: string; className: string } {
  switch (action) {
    case "veto":
      return { label: "VETOED", className: "bg-rose-600 text-white animate-pulse" };
    case "escalate":
      return { label: "ESCALATED", className: "bg-amber-500 text-black" };
    case "auto_approve":
      return { label: "AUTO-APPROVED", className: "bg-emerald-600 text-white" };
    case "approve":
      return { label: "APPROVED", className: "bg-emerald-600 text-white" };
    case "reject":
      return { label: "REJECTED", className: "bg-rose-600 text-white" };
    case "revise":
      return { label: "REVISED", className: "bg-violet-600 text-white" };
    case "draft":
      return { label: "DRAFTED", className: "bg-neutral-700 text-white" };
    case "verify":
      return { label: "VERIFIED", className: "bg-teal-600 text-white" };
    case "delegate":
      return { label: "DELEGATED", className: "bg-neutral-700 text-white" };
    case "handoff":
      return { label: "HANDOFF", className: "bg-neutral-700 text-white" };
    default:
      return { label: action, className: "bg-neutral-700 text-white" };
  }
}
