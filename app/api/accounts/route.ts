import { NextResponse } from "next/server";
import { ACCOUNTS, SIGNALS } from "@/lib/mock-data";

// Stands in for a Prospector pull persisted to InsForge. Swap for a real
// `select * from accounts join signals` once InsForge is provisioned.
export async function GET() {
  return NextResponse.json({
    accounts: ACCOUNTS.map((account) => ({
      ...account,
      signal: SIGNALS.find((s) => s.accountId === account.id) ?? null,
    })),
  });
}
