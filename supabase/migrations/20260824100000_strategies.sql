-- Outreach strategies
--
-- A campaign is WHERE/WHO I prospect; a strategy is HOW I approach them.
-- The two stay separate: a campaign can be worked with several strategies.
--
-- Attribution rule: results belong to the strategy that was active on the lead
-- when the outreach happened, not to whatever strategy the lead carries today.
-- That is why milestones are stamped onto the existing activities rows
-- (strategy_id + outreach_event) instead of being recounted from lead columns.

-- ---------------------------------------------------------------- enums ----

create type strategy_status as enum ('ACTIVE', 'ARCHIVED');

-- How a conversation actually went, not just whether someone replied.
create type response_class as enum (
  'NO_RESPONSE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'PRICE_OBJECTION',
  'INTERESTED', 'CALL_BOOKED', 'DEMO_REQUESTED', 'PROPOSAL', 'WON', 'LOST'
);

-- The seven milestones strategy performance is measured on. Deliberately
-- narrower than activity_type: most activity rows are not outreach results.
create type outreach_event as enum (
  'CONTACT', 'RESPONSE', 'CALL', 'DEMO', 'PROPOSAL', 'WON', 'LOST'
);

-- ----------------------------------------------------------- strategies ----

create table strategies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  target_niche       text,
  -- Free text: "21 qualified salons, no website, 500+ followers".
  target_criteria    text,
  -- Reuses contact_method so a strategy channel and a logged contact speak
  -- the same language.
  channel            contact_method not null default 'INSTAGRAM',
  opening_message    text,
  follow_up_approach text,
  notes              text,
  status             strategy_status not null default 'ACTIVE',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index strategies_status_idx on strategies (status);
create index strategies_created_at_idx on strategies (created_at desc);

create trigger strategies_set_updated_at
  before update on strategies
  for each row execute function set_updated_at();

-- ------------------------------------------------- strategy_assignments ----

-- One row per (lead, strategy) period. ended_at null means "active now".
-- Rows are never deleted when a strategy changes, so history stays intact.
create table strategy_assignments (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads (id) on delete cascade,
  strategy_id uuid not null references strategies (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  ended_at    timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);

-- A lead runs one outreach strategy at a time.
create unique index strategy_assignments_active_idx
  on strategy_assignments (lead_id)
  where ended_at is null;

create index strategy_assignments_lead_idx on strategy_assignments (lead_id, assigned_at desc);
create index strategy_assignments_strategy_idx on strategy_assignments (strategy_id);

-- --------------------------------------------- activities: attribution ----

alter table activities
  add column if not exists strategy_id    uuid references strategies (id) on delete set null,
  add column if not exists outreach_event outreach_event,
  add column if not exists response_class response_class;

comment on column activities.strategy_id is
  'Strategy that was active on the lead when this happened. Frozen at insert time.';
comment on column activities.outreach_event is
  'Set only on rows that count towards strategy performance.';

create index activities_strategy_idx on activities (strategy_id, outreach_event);

-- ---------------------------------------------------- leads: response ----

alter table leads
  add column if not exists response_class response_class not null default 'NO_RESPONSE';

-- Leads that had already replied before this feature existed did reply - how it
-- went was simply never recorded. NEUTRAL says exactly that: it counts as a
-- response and never as a positive one.
update leads set response_class = 'NEUTRAL'
where responded = true and response_class = 'NO_RESPONSE';

-- -------------------------------------------------------------- metrics ----

-- Raw counts per strategy, over an optional event window. Rates are computed
-- in the app so a zero denominator can render as "--" instead of a number.
-- Every count is DISTINCT leads: three follow-ups to one salon is one contact.
create or replace function strategy_metrics(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  strategy_id       uuid,
  assigned          bigint,
  contacted         bigint,
  responses         bigint,
  positive          bigint,
  calls             bigint,
  demos             bigint,
  proposals         bigint,
  won               bigint,
  lost              bigint,
  revenue           bigint,
  avg_days_to_close double precision
)
language sql
stable
as $fn$
  with asg as (
    select sa.strategy_id as sid, count(distinct sa.lead_id)::bigint as assigned
    from strategy_assignments sa
    where (p_from is null or sa.assigned_at >= p_from)
      and (p_to   is null or sa.assigned_at <= p_to)
    group by sa.strategy_id
  ),
  ev as (
    select a.strategy_id as sid, a.lead_id, a.outreach_event, a.response_class
    from activities a
    where a.strategy_id is not null
      and a.outreach_event is not null
      and (p_from is null or a.created_at >= p_from)
      and (p_to   is null or a.created_at <= p_to)
  ),
  agg as (
    select
      ev.sid,
      count(distinct ev.lead_id) filter (where ev.outreach_event = 'CONTACT')  as contacted,
      count(distinct ev.lead_id) filter (where ev.outreach_event = 'RESPONSE') as responses,
      count(distinct ev.lead_id) filter (
        where ev.outreach_event = 'RESPONSE'
          and ev.response_class in ('POSITIVE', 'INTERESTED', 'CALL_BOOKED', 'DEMO_REQUESTED', 'PROPOSAL', 'WON')
      ) as positive,
      count(distinct ev.lead_id) filter (where ev.outreach_event = 'CALL')     as calls,
      count(distinct ev.lead_id) filter (where ev.outreach_event = 'DEMO')     as demos,
      count(distinct ev.lead_id) filter (where ev.outreach_event = 'PROPOSAL') as proposals,
      count(distinct ev.lead_id) filter (where ev.outreach_event = 'WON')      as won,
      count(distinct ev.lead_id) filter (where ev.outreach_event = 'LOST')     as lost
    from ev
    group by ev.sid
  ),
  -- Revenue and cycle time read live lead columns, so correcting a deal value
  -- later fixes the reporting without a backfill.
  deals as (
    select w.sid,
           coalesce(sum(l.deal_value), 0)::bigint as revenue,
           avg(
             case
               when l.first_contact_at is not null and l.won_at is not null
                 then extract(epoch from (l.won_at - l.first_contact_at)) / 86400.0
             end
           ) as avg_days_to_close
    from (select distinct ev.sid, ev.lead_id from ev where ev.outreach_event = 'WON') w
    join leads l on l.id = w.lead_id
    group by w.sid
  )
  select
    s.id,
    coalesce(asg.assigned, 0),
    coalesce(agg.contacted, 0),
    coalesce(agg.responses, 0),
    coalesce(agg.positive, 0),
    coalesce(agg.calls, 0),
    coalesce(agg.demos, 0),
    coalesce(agg.proposals, 0),
    coalesce(agg.won, 0),
    coalesce(agg.lost, 0),
    coalesce(deals.revenue, 0),
    deals.avg_days_to_close
  from strategies s
  left join asg   on asg.sid   = s.id
  left join agg   on agg.sid   = s.id
  left join deals on deals.sid = s.id;
$fn$;

-- Lead ids currently running a strategy, for the Leads filter bar.
create or replace function strategy_lead_ids(p_strategy_id uuid)
returns table (lead_id uuid)
language sql
stable
as $fn$
  select sa.lead_id
  from strategy_assignments sa
  where sa.strategy_id = p_strategy_id and sa.ended_at is null;
$fn$;

-- ------------------------------------------------------------------ rls ----

alter table strategies           enable row level security;
alter table strategy_assignments enable row level security;

-- --------------------------------------------------------------- grants ----

grant select, insert, update, delete on strategies, strategy_assignments to service_role;
grant execute on function strategy_metrics(timestamptz, timestamptz) to service_role;
grant execute on function strategy_lead_ids(uuid) to service_role;

revoke all on strategies, strategy_assignments from anon, authenticated;
revoke all on function strategy_metrics(timestamptz, timestamptz) from anon, authenticated;
revoke all on function strategy_lead_ids(uuid) from anon, authenticated;
