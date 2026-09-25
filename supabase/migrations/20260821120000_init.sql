-- Lead Cockpit - initial schema
-- Private single-user sales tool. All access goes through the service role
-- from the Next.js server; RLS is enabled with no policies so the anon and
-- authenticated keys can never read or write anything.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----

create type lead_status as enum (
  'NEW', 'REVIEW', 'QUALIFIED', 'CONTACTED', 'RESPONDED',
  'CALL', 'DEMO', 'PROPOSAL', 'WON', 'LOST', 'REJECTED'
);

create type lead_tier as enum ('HOT', 'GOOD', 'MAYBE', 'LOW');

create type reject_reason as enum (
  'EXCELLENT_WEBSITE', 'TOO_SMALL', 'INACTIVE', 'POOR_REVIEWS', 'CHAIN',
  'WRONG_NICHE', 'DUPLICATE', 'NO_OPPORTUNITY', 'OTHER'
);

create type contact_method as enum ('INSTAGRAM', 'WHATSAPP', 'PHONE', 'EMAIL', 'WALK_IN', 'OTHER');

create type demo_status as enum ('NONE', 'PLANNED', 'IN_PROGRESS', 'SHOWN', 'REJECTED', 'CONVERTED');

create type proposal_status as enum ('NONE', 'DRAFTED', 'SENT', 'NEGOTIATING', 'ACCEPTED', 'DECLINED');

create type activity_type as enum (
  'IMPORTED', 'SCORED', 'REVIEWED', 'STATUS_CHANGE', 'CONTACT', 'RESPONSE',
  'CALL', 'DEMO', 'PROPOSAL', 'FOLLOW_UP', 'NOTE', 'WEBSITE_ANALYSIS',
  'AI_ANALYSIS', 'AI_MESSAGE', 'ENRICHED', 'OTHER'
);

create type ai_output_kind as enum ('ANALYSIS', 'INSTAGRAM_OPENER', 'EMAIL', 'CALL_OPENER', 'FOLLOW_UP');

-- ------------------------------------------------------------- helpers ----

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------- campaigns ----

create table campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  city       text not null default 'Istanbul',
  district   text,
  niche      text,
  queries    text[] not null default '{}',
  notes      text,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_archived_idx on campaigns (archived);

create trigger campaigns_set_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

-- --------------------------------------------------------- search_runs ----

create table search_runs (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references campaigns (id) on delete set null,
  query         text not null,
  city          text,
  neighborhood  text,
  min_rating    double precision,
  min_reviews   integer,
  -- BASIC or FULL: which Google Places field mask was paid for
  field_tier    text not null default 'FULL',
  result_count  integer not null default 0,
  new_count     integer not null default 0,
  dupe_count    integer not null default 0,
  skipped_count integer not null default 0,
  api_calls     integer not null default 0,
  error         text,
  created_at    timestamptz not null default now()
);

create index search_runs_campaign_id_idx on search_runs (campaign_id);
create index search_runs_created_at_idx on search_runs (created_at desc);

-- --------------------------------------------------------------- leads ----

create table leads (
  id       uuid primary key default gen_random_uuid(),
  -- Google Place ID is the deduplication key: one row per business, forever.
  place_id text not null unique,

  -- business
  name            text not null,
  category        text,
  primary_type    text,
  types           text[] not null default '{}',
  address         text,
  short_address   text,
  neighborhood    text,
  district        text,
  city            text not null default 'Istanbul',
  lat             double precision,
  lng             double precision,
  maps_url        text,
  phone           text,
  email           text,
  contact_person  text,
  business_status text,

  -- google
  rating             double precision,
  review_count       integer,
  price_level        text,
  google_fetched_at  timestamptz,
  details_fetched_at timestamptz,
  google_raw         jsonb,

  -- website
  has_website        boolean not null default false,
  website            text,
  https_ok           boolean,
  http_status        integer,
  page_title         text,
  meta_description   text,
  h1                 text,
  mobile_friendly    boolean,
  whatsapp_cta       boolean,
  phone_cta          boolean,
  booking_cta        boolean,
  website_score      integer,
  website_issues     text[] not null default '{}',
  website_error      text,
  website_ms         integer,
  website_checked_at timestamptz,

  -- instagram (entered by hand, or a link found on the business website)
  instagram_url       text,
  instagram_username  text,
  instagram_followers integer,
  instagram_active    boolean,
  instagram_notes     text,

  -- scoring
  score         integer not null default 0,
  tier          lead_tier not null default 'LOW',
  score_reasons jsonb,
  scored_at     timestamptz,

  -- qualification
  status        lead_status not null default 'NEW',
  reviewed_at   timestamptz,
  reject_reason reject_reason,
  reject_note   text,

  -- sales
  contact_method    contact_method,
  first_contact_at  timestamptz,
  last_contact_at   timestamptz,
  next_follow_up_at timestamptz,
  follow_up_count   integer not null default 0,
  responded         boolean not null default false,
  responded_at      timestamptz,
  response_notes    text,
  price_quoted      integer,
  currency          text not null default 'TRY',
  deal_value        integer,
  won_at            timestamptz,
  lost_at           timestamptz,
  lost_reason       text,

  -- demo
  demo_created  boolean not null default false,
  demo_url      text,
  demo_at       timestamptz,
  demo_minutes  integer,
  demo_status   demo_status not null default 'NONE',
  demo_worth_it boolean,

  proposal_status  proposal_status not null default 'NONE',
  proposal_sent_at timestamptz,

  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_status_idx on leads (status);
create index leads_tier_idx on leads (tier);
create index leads_score_idx on leads (score desc);
create index leads_next_follow_up_at_idx on leads (next_follow_up_at);
create index leads_neighborhood_idx on leads (neighborhood);
create index leads_created_at_idx on leads (created_at desc);
create index leads_has_website_idx on leads (has_website);

create trigger leads_set_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- -------------------------------------------------------- lead_sources ----

-- Every campaign/query that surfaced a lead. Dedup keeps one lead row,
-- but each source that produced it is remembered.
create table lead_sources (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads (id) on delete cascade,
  campaign_id   uuid references campaigns (id) on delete set null,
  search_run_id uuid references search_runs (id) on delete set null,
  query         text not null,
  created_at    timestamptz not null default now()
);

-- Two nulls are never equal in Postgres, so ad-hoc (campaign-less) searches
-- need their own guard against duplicate rows.
create unique index lead_sources_unique_idx
  on lead_sources (lead_id, campaign_id, query)
  where campaign_id is not null;

create unique index lead_sources_unique_adhoc_idx
  on lead_sources (lead_id, query)
  where campaign_id is null;

create index lead_sources_campaign_id_idx on lead_sources (campaign_id);
create index lead_sources_lead_id_idx on lead_sources (lead_id);

-- ---------------------------------------------------------- activities ----

create table activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  type       activity_type not null,
  title      text not null,
  body       text,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index activities_lead_id_created_at_idx on activities (lead_id, created_at desc);
create index activities_created_at_idx on activities (created_at desc);

-- --------------------------------------------------------------- notes ----

create table notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index notes_lead_id_created_at_idx on notes (lead_id, created_at desc);

-- ---------------------------------------------------------- follow_ups ----

create table follow_ups (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  number     integer not null default 1,
  due_at     timestamptz not null,
  done_at    timestamptz,
  channel    contact_method,
  action     text,
  message    text,
  skipped    boolean not null default false,
  created_at timestamptz not null default now()
);

create index follow_ups_due_at_idx on follow_ups (due_at);
create index follow_ups_lead_id_idx on follow_ups (lead_id);

-- ---------------------------------------------------------- ai_outputs ----

create table ai_outputs (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  kind       ai_output_kind not null,
  content    text not null,
  model      text,
  created_at timestamptz not null default now()
);

create index ai_outputs_lead_id_kind_idx on ai_outputs (lead_id, kind, created_at desc);

-- ------------------------------------------------------ scoring_config ----

-- Single-row configuration for the scoring engine.
create table scoring_config (
  id                   text primary key default 'default' check (id = 'default'),
  no_website           integer not null default 30,
  website_problems     integer not null default 20,
  instagram_active     integer not null default 15,
  instagram_followers  integer not null default 10,
  many_reviews         integer not null default 10,
  high_rating          integer not null default 5,
  premium_neighborhood integer not null default 10,
  appointment_based    integer not null default 10,

  follower_threshold integer not null default 500,
  review_threshold   integer not null default 100,
  rating_threshold   double precision not null default 4.5,

  hot_min   integer not null default 80,
  good_min  integer not null default 60,
  maybe_min integer not null default 40,

  premium_neighborhoods text[] not null default '{}',
  appointment_types     text[] not null default '{}',
  follow_up_days        integer[] not null default '{2,5,9}',

  updated_at timestamptz not null default now()
);

create trigger scoring_config_set_updated_at
  before update on scoring_config
  for each row execute function set_updated_at();

insert into scoring_config (id, premium_neighborhoods, appointment_types)
values (
  'default',
  array[
    'Nisantasi','Tesvikiye','Sisli','Etiler','Bebek','Levent','Ulus','Akatlar',
    'Arnavutkoy','Kurucesme','Ortakoy','Yenikoy','Emirgan','Tarabya','Zekeriyakoy',
    'Bagdat Caddesi','Suadiye','Caddebostan','Erenkoy','Kalamis','Fenerbahce','Moda',
    'Atasehir','Bomonti','Galata','Karakoy','Cihangir','Zorlu','Kanyon'
  ],
  array[
    'hair_salon','hair_care','beauty_salon','nail_salon','barber_shop','spa',
    'skin_care_clinic','massage','makeup_artist','tanning_studio','wellness_center'
  ]
);

-- ------------------------------------------------------------- reports ----

-- Pipeline counts for the dashboard and per-campaign breakdown.
-- PostgREST has no group-by, so this lives in the database.
create or replace function status_counts(p_campaign_id uuid default null)
returns table (status lead_status, count bigint)
language sql
stable
as $$
  select l.status, count(*)::bigint
  from leads l
  where p_campaign_id is null
     or exists (
       select 1 from lead_sources s
       where s.lead_id = l.id and s.campaign_id = p_campaign_id
     )
  group by l.status;
$$;

-- Distinct neighbourhoods, for the filter bar.
create or replace function lead_neighborhoods()
returns table (neighborhood text)
language sql
stable
as $$
  select distinct l.neighborhood
  from leads l
  where l.neighborhood is not null and l.neighborhood <> ''
  order by 1;
$$;

-- ----------------------------------------------------------------- rls ----

-- Enabled everywhere with no policies: anon and authenticated keys get nothing.
-- The app talks to Postgres with the service role key from the server only.
alter table campaigns      enable row level security;
alter table search_runs    enable row level security;
alter table leads          enable row level security;
alter table lead_sources   enable row level security;
alter table activities     enable row level security;
alter table notes          enable row level security;
alter table follow_ups     enable row level security;
alter table ai_outputs     enable row level security;
alter table scoring_config enable row level security;

-- -------------------------------------------------------------- grants ----

-- The service role bypasses RLS but still needs table privileges.
-- Everything else is explicitly locked out: the anon and authenticated keys
-- are never used by this app, and must not be able to reach the data.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
