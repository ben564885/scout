# Scout

**An AI SDR floor — a team of go-to-market agents that runs outbound end to end, coordinated and governed through Band.**

You give Scout one goal in plain language — _"Find used-car dealerships in the Bay Area worth reaching out to this week"_ — and a team of specialized agents finds the accounts, researches a real and **cited** reason to reach out ("why now"), drafts send-ready outreach off that exact signal, and routes every message to a human for approval at the authority boundaries that matter.

The wedge is **signal-first, not list-first**. Every other outbound tool sells the same static contact list everyone else is already emailing. Scout finds accounts at the moment something changes — a cluster of angry service reviews, a new rooftop opening, a hiring spree — using live web data no CRM captures.

## Run it

```bash
npm install
npm run dev        # → http://localhost:3000/dashboard
```

**It runs with zero credentials.** Every integration degrades gracefully to cached data when its env vars are absent, so the floor always completes end to end. Copy `.env.example` → `.env.local` and fill keys in as they become available; the header dots show honestly which integrations are live vs. cached.

## The floor

| Agent | Role | Leans on |
|---|---|---|
| **Prospector** | Turns the plain-language goal into a ranked, deduped account list | Nimble |
| **Researcher** | Finds a cited "why now" per account | Nimble, You.com |
| **Writer** | Drafts outreach off the exact signal. **Has no send capability at all.** | InsForge model gateway |
| **Compliance** | Vetoes unverifiable claims, overpromises, and fabricated citations | — |
| **Manager** | Auto-approves routine accounts; escalates high-value ones | Band |
| **You** | Approve / reject what the Manager has no authority to send | Band |

### The governance rule that matters

The Writer *physically cannot send* — there is no send function anywhere in its module. Sending authority lives only with the Manager (routine accounts, under the tier threshold) or the human (high-value accounts, always). That boundary is structural, not a prompt.

Every step writes an `audit_log` row stamped with the **authority rule that fired**, which is what the governance timeline streams on screen:

```
[prospector/delegate]  prospector:pull_web_data
[researcher/handoff]   researcher:attach_signal_with_citation
[writer/draft]         writer:draft_outreach
[compliance/veto]      pol-unverified-claim
    VETOED (No unverifiable claims): Unverified claim detected ("over 500 dealerships")
[writer/revise]        writer:draft_outreach
[compliance/verify]    compliance:check_citations
[manager/escalate]     manager:escalate_high_value
    Manager cannot approve high-value accounts. Routed to human via Band.
[human/approve]        human:approve_high_value
```

## The signal engine (the moat)

`lib/sources.ts` is hardcoded to automotive dealerships — DealerRater, Cars.com, AutoTrader, Indeed, Yelp — and the detectors in `lib/nimble.ts` look for dealer-specific pain: loaner cars, service advisors, BDC staffing, rooftops.

Four detectors, ranked by how strongly they predict a deal:

1. **`review_cluster`** — multiple recent reviews citing the same solvable service complaint _(strongest)_
2. **`reputation_dip`** — recent star ratings trending below the lifetime average
3. **`new_location`** — a new rooftop appearing in listings
4. **`hiring`** — a sales/BDC/service hiring push

Repointing Scout at another vertical means **replacing that file, not editing a string**. That's the proof of depth.

**No signal, no email.** If the Researcher can't substantiate a "why now", the account is skipped and shown as skipped. Scout doesn't email an account it has no reason to email.

## Architecture

```
Goal (natural language)
   └─► Prospector (Nimble)      → builds + tiers the account list
        └─► Researcher (Nimble + You.com) → cited "why now" per account
             └─► Writer (InsForge gateway) → draft grounded in the citation
                  └─► Compliance            → veto → revise (max 2)
                       └─► Manager (Band)   → auto-approve │ escalate
                                                            └─► Human
```

- **Source of truth** is the in-memory store (`lib/store.ts`) so the live demo never stalls on network latency.
- **InsForge Postgres** (`lib/insforge.ts`) takes a best-effort, fire-and-forget mirror of every write, holding the durable copy and audit trail. Schema: `migrations/`.
- **Band** (`lib/band.ts`) gets a real replay of each run: one chat room, `@mention` delegation between agents, and the escalation as a genuine blocking `attention` event that the human's decision resolves.

## Endpoints

| Route | Does |
|---|---|
| `POST /api/goal` | The floor's only entry point. One goal in, the whole team runs. |
| `POST /api/runs/[id]/approve` | Human decision on an escalated draft. |
| `GET /api/status` | Which integrations are live vs. cached. |

## Not done yet

- **iMessage last mile** — Band escalations delivered to a phone. Band is always the real gate; iMessage is only the channel. Requires running locally on macOS with Messages permissions.
- **Hydra DB** — per-account memory so the floor improves run to run. Env vars are stubbed; no public SDK found.
- **Kylon** — workspace framing. Blocked on whether their prize requires building *inside* their workspace.
- **Real demo data** — `lib/mock-data.ts` uses `.example.com` domains and invented review URLs. The demo needs one **real** dealership with real, dated, verifiable reviews pre-warmed as the cached fallback.
