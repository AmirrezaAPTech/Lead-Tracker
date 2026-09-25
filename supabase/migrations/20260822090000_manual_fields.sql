-- Remember which columns were edited by hand.
--
-- Google is the source of truth for most lead columns, but the operator often
-- knows better: an Instagram account that is not linked on Maps, a mobile number
-- the listing does not carry, a corrected neighbourhood. Any column listed here
-- is treated as owned by the operator, and neither re-import nor Place Details
-- enrichment is allowed to overwrite it.

alter table leads
  add column if not exists manual_fields text[] not null default '{}';

comment on column leads.manual_fields is
  'Column names edited by hand. Import and enrichment must not overwrite these.';
