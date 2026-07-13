# Scout — PRD & Hackathon MVP (agent reference)

> **Read this before changing anything in `lib/` or `app/`.** It is the source of truth for *why* the code is shaped the way it is. When code and this document disagree, the code is a bug unless the disagreement is listed under [Deliberate deviations](#deliberate-deviations).

**Tagline:** An AI SDR floor — a team of go-to-market agents that runs outbound end to end, coordinated and governed through Band.

| | |
|---|---|
| **Event** | Bay Builders Hackathon — AWS Builder Loft, 525 Market St, SF · Mon July 13, 2026 |
| **Primary target** | GTM AI Employee Challenge (Nimble + Kylon) |
| **Secondary targets** | Best Use of Band · InsForge · You.com · Hydra DB |
| **Status** | Build-ready · PRD v1.0 |

---

## 1. What Scout is

One goal in plain language — *"find used-car dealerships in the Bay Area worth reaching out to this week"* — and a coordinated team of specialized agents finds the accounts, researches a real and **cited** reason to reach out ("why now"), drafts send-ready outreach off that exact signal, and routes every message to a human for approval **at the authority boundaries that matter**.

The wedge is **signal-first, not list-first**. Every other outbound tool sells the same static list everyone else is emailing. Scout finds accounts at the moment something *changes* — a cluster of angry service reviews, a new rooftop opening, a hiring spree — using live web data no CRM captures. That is both the defensible thesis and the reason the demo lands.

Built on **automotive dealerships** (real operator experience, un-fakeable data on screen fast); **pitched** as a horizontal signal-first selling engine. Build dealer, narrate horizontal — never build both.

---

## 2. The three tests every change must pass

Any code you write should survive these. If it fails one, it is off-strategy no matter how well it works.

1. **Is it GTM?** It does a revenue-facing job (prospecting/SDR), not a generic productivity task.
2. **Is it an *employee*, not a *tool*?** One goal in, the whole chain runs without step-by-step clicking. Judge's test: *"could this stand in for a headcount?"* Never add a UI step that makes the human drive the pipeline.
3. **Is the vertical depth in the code?** If you could repoint Scout at another industry by editing one string, it isn't vertical. Dealer sources and detectors are hardcoded on purpose (`lib/sources.ts`) — that irreversibility *is* the proof of depth. Do not generalize them into config.

---

## 3. The floor

Scout is a small org of specialized agents, not one monolithic agent. This is deliberate: it makes the product more capable, more demoable, and makes Band **load-bearing** (multi-agent coordination + governance is Band's actual purpose — a single approval hook is not).

| Agent | Role | Output | Leans on | Code |
|---|---|---|---|---|
| **Prospector** | Turns the plain-language goal into a ranked, deduped account list | `accounts` | Nimble | `lib/prospector.ts` |
| **Researcher** | Finds a cited "why now" per account | `signals` + citations | Nimble, You.com | `lib/researcher.ts` |
| **Writer** | Drafts outreach off the exact signal. **Has no send capability at all.** | `drafts` | InsForge model gateway | `lib/writer.ts` |
| **Compliance** | Vetoes unverifiable claims, overpromises, fabricated citations | veto → revise | — | `lib/policies.ts` |
| **Manager** | Auto-approves routine accounts; escalates high-value ones | `approvals` | Band | `lib/pipeline.ts` |
| **Human (you)** | Sits in the floor as VP of Sales. Approves/edits/rejects only what the Manager has no authority to send. | decisions | Band, iMessage | `app/api/runs/[id]/approve` |

The human **does not micromanage**. They state an outcome and review finished work.

---

## 4. Governance model (the differentiator)

Band is the interaction layer the floor runs on: agents discover each other, delegate, preserve context across handoffs, and operate inside **enforced authority boundaries** with human checkpoints at the edges.

### 4.1 Authority boundary table

| Action | Prospector | Researcher | Writer | Compliance | Manager | Human |
|---|---|---|---|---|---|---|
| Pull web data / build list | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| Attach signal + citation | ❌ | ✅ | ❌ | ❌ | ✅ | — |
| Draft outreach | ❌ | ❌ | ✅ | ❌ | ✅ | — |
| Veto a draft | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Send outreach** | ❌ | ❌ | ❌ **never** | ❌ | ⚠️ auto-approve tier only | ✅ always |
| Approve routine account (`value_tier = 'routine'`) | ❌ | ❌ | ❌ | ❌ | ✅ auto | ✅ |
| Approve high-value account (`value_tier = 'high_value'`) | ❌ | ❌ | ❌ | ❌ | ❌ **must escalate** | ✅ required |

### 4.2 The invariants — do not break these

- **The Writer physically cannot send.** There is no send function anywhere in `lib/writer.ts`, and there must never be one. Sending authority lives only with the Manager (routine tier) or the human (escalated). The boundary is *structural*, not a prompt. This single sentence is what wins the Band prize.
- **The Manager cannot approve a `high_value` account.** It must escalate. No threshold override, no "confidence high enough" bypass.
- **Nothing is emailed without a cited signal.** Accounts the Researcher can't substantiate a "why now" for are *skipped*, not emailed generically (`FloorRun.skipped`).
- **Every step writes an `audit_log` row stamped with the authority rule that fired.** That log is not debug output — it is the governance timeline the demo streams on screen. If you add a step to the pipeline, it logs.
- **Band = brain, iMessage = mouth.** Band *decides* an approval is required and routes it; iMessage is merely where the human receives it. Never describe or implement it as "we use iMessage for approvals" with Band absent — that reads as *replacing* Band and loses the prize.

### 4.3 Escalation flow

```
Manager evaluates draft + account value
  └─ high_value → raises an escalation through Band (attention event, blocking)
       └─ delivered to the human over iMessage (channel / last mile only)
            └─ human replies: approve / edit: … / reject
                 └─ decision posted back to Band, which records it and releases (or kills) the send
```

---

## 5. Sponsor integration map

Each must be **load-bearing** — you can point at the screen and name it in one sentence. That is the qualification bar judges spot in ten seconds.

| Sponsor | Job in Scout | Priority | Code |
|---|---|---|---|
| **Nimble** | Live-web data engine: account list + hard-to-reach signals (reviews, listings, hiring). The core. | **P0** — cannot remove | `lib/nimble.ts` |
| **Kylon** | Workspace the floor reports into; the "meet your new hires" AI-employee framing | **P0** | — |
| **Band** | Multi-agent coordination + governance + human approval at authority boundaries | **P0** — differentiator | `lib/band.ts` |
| **InsForge** | Backend: Postgres (accounts/signals/drafts/approvals), auth, hosting, model gateway | **P0** — spine | `lib/insforge.ts` |
| **You.com** | Cited "why now" research: news/funding/launches with sources **on screen** | P1 | `lib/youdotcom.ts` |
| **Hydra DB** | Memory: per-account history + what got approved, so the floor improves run to run | P2 | — |
| **RocketRide** | Pipeline orchestration | P3 — softest fit, **trim first** | — |

Skip Tavily (redundant with You.com — including it is tokenism) and Cognee (redundant with Hydra). Optional if time allows: Nebius (split inference), AgentOS (live trace/evals).

**Every integration degrades gracefully.** With no credentials at all, the floor still completes end to end on cached data, and the header dots report honestly which integrations are live vs. cached. Preserve this — it is the demo's insurance policy. Never make a code path *require* a key.

---

## 6. The signal engine (the moat)

This is where "vertical" lives in the code, not the pitch.

**Dealer-specific sources** (`lib/sources.ts`, Nimble scrape targets): DealerRater · Google Maps/Reviews · Cars.com dealer pages · Yelp · AutoTrader rooftop pages · state auto-dealer association directories · Indeed / dealer career pages.

**Dealer-specific detectors** ("why now"):

| Detector | Trigger | Notes |
|---|---|---|
| `review_cluster` | ≥3 recent reviews (last 30–60d) naming a *solvable* pain — slow service response, financing friction, follow-up complaints | **Strongest, most demoable.** This is the WOW beat. |
| `new_location` | A new rooftop appearing in listings/press | Expansion → needs tooling |
| `hiring` | Multiple recent sales/BDC/service postings | Scaling → pain |
| `reputation_dip` | Aggregate rating dropping quarter-over-quarter | |

Every detector writes a `signals` row with a `source_url` **and** a `source_quote` (<15 words) so the citation is visible on screen. You.com supplements with cited news/funding/press.

---

## 7. Data model

Postgres schema in `migrations/20260713190222_scout-init.sql`; TypeScript mirror in `lib/types.ts`; in-memory store in `lib/store.ts` (swap for a real InsForge client once credentials are provisioned — keep the interface).

- **`accounts`** — the prospect universe. `value_tier` (`routine` | `high_value`) is what drives escalation; `est_value_usd` backs it.
- **`signals`** — the "why now". Always carries `source_url` + `source_quote`. **Show these in the UI.**
- **`drafts`** — Writer output. Status: `pending`→`vetoed`→`revised`→`auto_approved`|`escalated`→`approved`|`edited`|`rejected`|`sent`. Revisions chain via `revision_of`.
- **`approvals`** — governance decisions (audit trail): `decided_by` (`manager_auto`|`human`), `decision`, `channel` (`band`|`imessage`).
- **`audit_log`** — actor + action + `authority_rule` per step. Powers the governance timeline.
- **`policies`** — what Compliance enforces. Hydra mirrors this plus per-account history (last contacted, prior signals, what got approved/rejected) so the floor doesn't repeat itself.

---

## 8. Scope (MoSCoW)

**Must** — plain-language goal input · Prospector pulls a real dealer list live via Nimble · Researcher attaches ≥1 real cited signal per demo account · Writer drafts off the exact signal + citation · Manager applies the authority boundary (auto-approve routine, escalate high-value) · approval through Band, in a clean product-looking UI · data persisted in InsForge.

**Should** — You.com cited research visibly enriching the "why now" · iMessage last-mile escalation (demo only if live-stable) · Kylon workspace framing.

**Nice** — Hydra memory ("improves run to run") · RocketRide · AgentOS trace/evals · Nebius split inference.

**Out of scope — do not build:**
- ❌ **Actually sending real email/SMS to real dealers.** Simulate "send". Never spam real businesses live.
- ❌ CRM writes, multi-channel sequences, reply handling, analytics dashboards.
- ❌ Auth / multi-tenant beyond a single demo account.
- ❌ General-purpose multi-vertical support (dealer path only).

**IP hygiene (non-negotiable):** Scout is clean-room. No ConvoyLeads / Cyntral code, no lifted Hermes/Inkbox iMessage bridge. Same problem space, fresh implementation.

---

## 9. Demo script (~3 min) — what the code must protect

Build so **every layer is independently demoable**. Never be one broken feature away from having nothing. Let the *live pull* be the list (low stakes); keep the *WOW signal* pre-warmed and cached.

1. **Hook (10s)** — "SDRs spend more than half their day researching instead of selling, and the signals that predict a sale for local businesses are buried in reviews no CRM tracks. So I built the SDR team that does it itself."
2. **Hire the floor (20s)** — type the goal, go. *(Kylon "new hires" framing.)*
3. **It builds the list, live (30s)** — real dealers populate the table. "This is live web data — not a CSV I uploaded." *(Name **Nimble**.)*
4. **The "why now," with receipts (40s — WOW)** — three real, dated, angry service reviews with visible citations. "Every other tool guesses. Scout found a real, cited reason this dealer will pick up the phone." *(**Nimble** + **You.com**.)*
5. **Draft from the signal (20s)** — "This isn't 'Hi {FirstName}.' It could only have been written about this dealer, this week."
6. **Governance, and close on it (30s)** — Manager auto-approves a routine account, then escalates the high-value dealer through Band → text hits the phone on the projector → approve live. "Scout never sends without a human. It does the 90% that's grinding research and keeps a person on the 10% that's judgment — all governed through **Band**."
7. **Close (10s)** — *"I did this by hand for a year to build my company's pipeline. Scout is the version that doesn't need me at 2am."* Stop.

**UX is ~15% of the score.** The floor must read as a *product* — account table, signal cards with citations, clean approval queue — not a debug log.

---

## 10. Risks & standing mitigations

| Risk | Mitigation (already encoded — keep it that way) |
|---|---|
| Live Nimble pull fails on stage | Live pull is the list (low stakes); the WOW signal is pre-warmed + cached |
| iMessage bridge hangs on venue wifi | Approval works in **both** the Band UI and over text; Band is always the real gate |
| Multi-agent coordination flaky at 4 PM | Two handoffs must be rock-solid first: Researcher→Writer, and human escalation. The rest of the org chart is optional |
| Too many sponsors → looks padded | Keep only tools nameable in one sentence pointing at the screen. Trim RocketRide/Cognee/Tavily first |
| Reads as a "tool," not an "employee" | One goal in, whole chain runs. No step-by-step clicking |

---

## Deliberate deviations

Where the code intentionally goes beyond or differs from PRD v1.0:

- **A sixth agent, Compliance** (`lib/policies.ts`), sits between Writer and Manager: it vetoes unverifiable claims, overpromises, and fabricated citations, and sends the draft back for revision (max 2). It makes governance visibly *adversarial* rather than a rubber stamp.
- **`audit_log` and `policies` tables** are additions to the PRD §9 schema; the audit log is what the on-screen governance timeline streams.
- **IDs are `text`, not `uuid`** — the app assigns human-readable ids (`acct-fremont-auto`, `audit-17`) so the app and DB stay in sync without a translation layer.
- **`lib/store.ts` is in-memory** for the hackathon; it mirrors the InsForge schema exactly so it can be swapped for a real client without touching the pipeline.
