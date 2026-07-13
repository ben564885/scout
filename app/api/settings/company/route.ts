import { NextRequest, NextResponse } from "next/server";
import { getCompanyContext, saveCompanyContext } from "@/lib/company-context";

export async function GET() {
  try {
    const context = await getCompanyContext();
    return NextResponse.json({ context });
  } catch (error) {
    console.error("[settings/company] GET failed:", error);
    return NextResponse.json({ error: "Could not load company context." }, { status: 500 });
  }
}

// Manual save — the user pasted or edited the context text directly.
export async function POST(req: NextRequest) {
  const { content } = await req.json();
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string." }, { status: 400 });
  }

  try {
    const context = await saveCompanyContext({ content: content.trim(), sourceType: "manual" });
    return NextResponse.json({ context });
  } catch (error) {
    console.error("[settings/company] POST failed:", error);
    return NextResponse.json({ error: "Could not save company context." }, { status: 500 });
  }
}
