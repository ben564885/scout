import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { recordHumanDecision } from "@/lib/pipeline";
import { mirrorApprovalToBand } from "@/lib/band";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const { draftId, decision, note } = await req.json();

  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const entry = recordHumanDecision(runId, draftId, decision, note);
  if (!entry) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  after(() => mirrorApprovalToBand(runId, entry.detail));

  return NextResponse.json({ entry });
}
