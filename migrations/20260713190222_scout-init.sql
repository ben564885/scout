-- Scout schema — adapted from PRD §10. IDs are `text` rather than `uuid`
-- because the app assigns its own human-readable ids (e.g. "acct-fremont-auto",
-- "audit-17") rather than letting Postgres generate them, so the two stay in
-- sync without a translation layer.

create table if not exists accounts (
  id text primary key,
  name text not null,
  vertical text default 'automotive_dealership',
  city text,
  region text,
  website text,
  contact_path text,
  value_tier text,            -- 'routine' | 'high_value'  (drives escalation)
  est_value_usd numeric,
  created_at timestamptz default now()
);

create table if not exists signals (
  id text primary key,
  account_id text references accounts(id),
  type text,                  -- 'review_cluster'|'new_location'|'hiring'|'funding'|'press'
  summary text,
  strength int,                -- 0-100 recency/confidence
  source_url text,             -- CITATION (show in UI)
  source_quote text,           -- <15-word excerpt proving it
  detected_at timestamptz default now()
);

create table if not exists drafts (
  id text primary key,
  account_id text references accounts(id),
  signal_id text references signals(id),
  channel text default 'email',
  body text not null,
  status text default 'pending', -- pending|vetoed|revised|auto_approved|escalated|approved|edited|rejected|sent
  revision_of text references drafts(id),
  created_at timestamptz default now()
);

create table if not exists approvals (
  id text primary key,
  draft_id text references drafts(id),
  decided_by text,             -- 'manager_auto' | 'human'
  decision text,                -- approve|edit|reject
  channel text,                 -- 'band' | 'imessage'
  note text,
  decided_at timestamptz default now()
);

create table if not exists audit_log (      -- powers the governance timeline
  id text primary key,
  actor text not null,          -- prospector|researcher|writer|compliance|manager|human
  action text not null,         -- delegate|handoff|draft|verify|veto|revise|escalate|approve|reject|send
  target_id text,
  authority_rule text,
  channel text,
  detail text,
  created_at timestamptz default now()
);

create table if not exists policies (       -- what Compliance enforces; Hydra mirrors this
  id text primary key,
  name text,
  rule text,
  severity text,                 -- 'veto' | 'warn'
  active boolean default true
);
