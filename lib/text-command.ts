import { after } from "next/server";
import { recordHumanDecision, runFloor } from "./pipeline";
import { mirrorApprovalToBand, mirrorRunToBand } from "./band";
import { getPendingEscalation } from "./store";
import { floorSummaryText, notifyOwner, sendFloorReportEmail } from "./notify";

// Shared core for Scout's text-in channel, used by both app/api/sms/route.ts
// (Twilio SMS/WhatsApp webhook) and app/api/agent-relay/route.ts (the
// same-day emergency fallback that piggybacks on Ben's personal Hermes
// agent). Both authenticate the request differently and format their
// response differently (TwiML vs JSON), but the actual command parsing and
// governance actions are identical — one source of truth for "what does a
// text from Ben actually do."
//
// Any text that isn't "approve"/"reject" is a new goal — same entry point as
// the web UI's POST /api/goal. "approve"/"reject" resolves whatever
// escalation is currently pending, through the exact same
// recordHumanDecision + mirrorApprovalToBand path app/api/runs/[id]/approve
// uses — texting is last-mile delivery only (PRD §6.3: "Band = brain,
// iMessage = mouth"), never a parallel approval mechanism.
//
// Returns the immediate ack to send back synchronously; the real result
// (floor summary, approval confirmation) goes out later via notifyOwner()
// once the background work in after() finishes.
export async function handleIncomingText(body: string): Promise<string> {
  const decisionMatch = body.match(/^(approve|reject)\b\s*(.*)$/i);
  if (decisionMatch) {
    const decision = decisionMatch[1].toLowerCase() as "approve" | "reject";
    const note = decisionMatch[2].trim() || undefined;
    const pending = getPendingEscalation();
    if (!pending) {
      return "no pending escalation right now.";
    }

    after(async () => {
      const entry = recordHumanDecision(pending.runId, pending.draftId, decision, note, "imessage");
      if (entry) await mirrorApprovalToBand(pending.runId, entry.detail);
      await notifyOwner(
        `${decision === "approve" ? "approved" : "rejected"} — ${pending.accountName}. band recorded the decision.`
      );
    });

    return `on it — ${decision === "approve" ? "approving" : "rejecting"} ${pending.accountName}.`;
  }

  after(async () => {
    const floor = await runFloor(body);
    for (const run of floor.runs) {
      await mirrorRunToBand(run);
    }
    await notifyOwner(floorSummaryText(floor));
    await sendFloorReportEmail(floor);
  });

  return `got it — running the floor on: "${body}". i'll text you when it's done.`;
}
