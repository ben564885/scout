import { AuditAction, AuditActor } from "./types";

type IconProps = { className?: string };

function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function BookOpenIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

function PenLineIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function ClipboardListIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

function UserIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export const ACTOR_META: Record<AuditActor, { label: string; icon: (props: IconProps) => React.JSX.Element; color: string }> = {
  prospector: { label: "Prospector", icon: SearchIcon, color: "text-sky-600" },
  researcher: { label: "Researcher", icon: BookOpenIcon, color: "text-teal-600" },
  writer: { label: "Writer", icon: PenLineIcon, color: "text-violet-600" },
  compliance: { label: "Compliance", icon: ShieldIcon, color: "text-rose-600" },
  manager: { label: "Manager", icon: ClipboardListIcon, color: "text-amber-600" },
  human: { label: "You", icon: UserIcon, color: "text-emerald-600" },
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
      return { label: "DRAFTED", className: "bg-black text-white" };
    case "verify":
      return { label: "VERIFIED", className: "bg-teal-600 text-white" };
    case "delegate":
      return { label: "DELEGATED", className: "bg-black text-white" };
    case "handoff":
      return { label: "HANDOFF", className: "bg-black text-white" };
    default:
      return { label: action, className: "bg-black text-white" };
  }
}
