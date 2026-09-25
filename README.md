# Lead Cockpit

A private, single-user sales tool for finding and closing local-business website clients in Istanbul.
Not a SaaS product, not multi-tenant, not public. One password, one operator: you.

Workflow it supports, end to end:

```
Google Places search -> import -> deduplicate -> analyse -> score
-> review (keep / reject) -> contact -> follow up -> call -> demo -> proposal -> won / lost
```

## Stack

Next.js 15 (App Router) - TypeScript - Tailwind v4 - shadcn-style components - Supabase (Postgres + PostgREST via
`@supabase/supabase-js`). Schema lives in `supabase/migrations`. Deploys to Vercel as-is.

There is no ORM. Every read goes through `fromRow()` and every write through `toRow()` in
[src/lib/db.ts](src/lib/db.ts), so the database stays snake_case while the app code stays camelCase.

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Create a Supabase project**, then from Project Settings -> API copy the project URL and the
   **service role** key.

3. **Fill in `.env`** (copy from `.env.example`).

   Both Supabase values come from **Project Settings -> API Keys**. They are HTTP API credentials, not database
   credentials: there is no ORM here, so a Postgres connection string (`postgresql://...`) is never used and will
   be rejected at startup.

   Newer projects list a **Publishable key** and one or more **Secret keys** instead of `anon`/`service_role`.
   Use a Secret key (`sb_secret_...`) - it maps to the `service_role` database role the migration grants access
   to. Any of the secret keys works; a dedicated one is easiest to rotate later.

   | Variable | What it is |
   | --- | --- |
   | `SUPABASE_URL` | Project URL: `https://<project-ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | A **Secret key** (`sb_secret_...`), listed as `service_role` on older projects. Not the Publishable key. Server-only - never prefix it with `NEXT_PUBLIC_` |
   | `APP_SECRET` | Long random string that signs the session cookie |
   | `APP_PASSWORD` | The password you log in with |
   | `GOOGLE_PLACES_API_KEY` | Key with **Places API (New)** enabled |
   | `ANTHROPIC_API_KEY` | Optional - enables the AI analysis and draft buttons |
   | `ANTHROPIC_MODEL` | Optional - defaults to `claude-sonnet-5` |

   Generate a secret with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. **Apply the migration.** Either link the project and push:

   ```bash
   npx supabase link --project-ref <project-ref>
   npm run db:push
   ```

   or paste `supabase/migrations/20260821120000_init.sql` into the Supabase SQL editor and run it.

5. **Run it**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and log in with `APP_PASSWORD`.

### Working locally

`npx supabase start` runs the whole stack in Docker. Point `SUPABASE_URL` at `http://127.0.0.1:54321` and use the
service role key it prints. `npm run db:reset` rebuilds the local database from the migrations.

### Changing the schema

Migrations are the source of truth. Edit the SQL, never the database by hand:

```bash
npm run db:diff -- add_something   # writes a new migration from your local changes
npm run db:push                    # applies pending migrations to the linked project
```

## Security model

- Every table has **RLS enabled with no policies**, and `anon` / `authenticated` have all privileges revoked.
  Those keys can read and write nothing - verified against a live instance, they get `401 permission denied`.
- Only the **service role** key is granted table access, and it is used exclusively from the Next.js server.
  It is never sent to the browser.
- The app itself is gated by a single password: an HMAC-signed, httpOnly session cookie checked in middleware.
  Unauthenticated pages redirect to `/login`; unauthenticated API calls get `401`.

## Deploying to Vercel

Import the repo, add the same environment variables, deploy. Nothing else to configure - there is no build-time
database step.
## Daily use

**Dashboard** - what needs doing today: follow-ups due, qualified leads not yet contacted, the pipeline, recent activity.

**Discover** - pick a campaign, a city and neighbourhood, tick the queries (kuafor, guzellik salonu, nail salon...), then:
- *Preview first query* - one API request, shows what comes back and which businesses you already have.
- *Import all queries* - runs every query and imports. Duplicates are impossible: Google Place ID is a unique key.

**Review** - the screen this tool exists for. One lead at a time, keyboard driven:

| Key | Action |
| --- | --- |
| `K` | Keep (moves to Qualified) |
| `R` | Reject, then `1`-`9` to pick the reason |
| `N` / `->` | Skip to next |
| `P` / `<-` | Previous |
| `U` | Undo the last decision |
| `M` | Open Google Maps |
| `W` | Open the website |
| `I` | Open Instagram |
| `C` | Call |
| `E` | Email |
| `A` | Analyse the website now |
| `+` | Add info Google does not have (Instagram, phone, email...) |
| `O` | Open the full lead detail |
| `Esc` | Cancel the reject picker |

Rejected leads are never deleted. They keep their reason and stay searchable (`status=REJECTED`).

**Leads** - every filter in one bar: campaign, area, tier, score, website state, Instagram, status, follow-up due,
demo status, minimum rating and review count. Select rows for bulk keep / reject / status change / website analysis.

**Pipeline** - drag cards between the ten stages, or use the status buttons on the lead page.

**Follow-ups** - day 2, day 5, day 9 after each contact (configurable). Each row has *I sent it*, *Snooze 3d*,
*Stop following up*, and *Draft message*. Nothing is ever sent for you.

## Editing a lead

Google is a starting point, not the truth. Every field on the lead page is editable: name, category, address,
neighbourhood, phone, email, contact person, website, rating, review count, the Instagram account, the detected
website signals, and everything on the sales and demo side.

The common case is Instagram. Maps almost never links the account, so the lead comes in with none. Type the handle
(`@salonname`, `instagram.com/salonname` or just `salonname` all work) and the username is derived, the account is
marked active, and the score is recalculated on the spot - usually a jump, since an active Instagram is worth points.

**What you type is protected.** Any Google-owned column you edit is recorded in `leads.manual_fields`, and from then
on neither a re-import nor Place Details enrichment may overwrite it. Those fields are marked **YOURS** on the form
and listed at the top of the lead. Changed your mind, or Google has better data now? Click a field in that bar to
release it, or *Release all*.

Correcting a website signal (say the site does have a WhatsApp button but the checker missed it) also rebuilds the
issue list and the health score, so you never end up pitching a problem that is not real. Issues that can only come
from fetching the page - slow, parked, did not load - are left alone.

During review you rarely want to leave the deck for this. Press <kbd>+</kbd> for a compact panel covering Instagram,
followers, phone, email, website and contact person: <kbd>Ctrl+Enter</kbd> saves and the card rescores in place,
<kbd>Esc</kbd> cancels.

## Lead scoring

A 0-100 **prioritisation** score. It tells you who to call first. It does **not** predict who will buy, and the UI
says so wherever the number appears.

Default weights (all editable in Settings):

| Signal | Points |
| --- | --- |
| No website | +30 |
| Obvious website problems | +20 |
| Active Instagram | +15 |
| 500+ Instagram followers | +10 |
| 100+ Google reviews | +10 |
| 4.5+ rating | +5 |
| Premium neighbourhood | +10 |
| Appointment-based business | +10 |

Tiers: **HOT** 80-100, **GOOD** 60-79, **MAYBE** 40-59, **LOW** 0-39.

Every lead stores the reasons behind its own score, so a card reads like:

> **91/100** - No website - 327 Google reviews - 4.8 rating - Active Instagram - Premium location (Nisantasi)

Changing the weights in Settings rescores every non-rejected lead in one pass.

## Website analysis

One request to the homepage, nothing more. It looks only for things you can sell against: HTTPS, page title,
meta description, H1, mobile viewport, WhatsApp button, click-to-call, booking CTA, load time, parked/placeholder
pages. It also picks up an Instagram link if the business publishes one on its own site.

## AI

Two features, both behind explicit buttons, both **generate -> review -> copy**:

- **Analyse lead** - verdict, main website opportunity, sales angle, recommended channel, a Turkish opening message,
  and whether a personalised demo is worth building.
- **Draft message** - Instagram opener, email, call opener, or follow-up. Natural Turkish, short, not salesy.

The model only ever receives the facts stored on the lead record. Unknown fields are passed as "unknown", and the
prompt requires assumptions to be labelled as assumptions. Nothing is sent to anyone automatically, ever.

## API cost control

Google Places (New) bills by the fields you request, so the app is deliberate about it:

- **Discovery** uses one fixed field mask. *Full* adds rating, review count, phone and website (the fields scoring
  needs); *Basic* drops them and only costs the cheaper tier.
- **Pages per query** is capped at 3 (Google's own maximum) and the form shows the request count before you run it.
- **Place Details** - the expensive call - is never bulk. It runs only from the *Enrich from Google* button on a
  single lead, is cached for 30 days, and is refused outright for rejected leads.
- Raw Google payloads are cached on the lead, and re-importing a business you already have costs nothing extra:
  it records the new campaign/query and backfills empty columns from data already paid for.

## What this deliberately does not do

No Instagram scraping or automation. No WhatsApp mass messaging. No cold-email blasting. No LinkedIn automation.
No Google Maps HTML scraping. No CAPTCHA bypassing, proxies or account farming.

Research, qualification, CRM and workflow only. Every outbound message is written, reviewed and sent by you.

## Project layout

```
supabase/migrations/       the schema - single source of truth
src/lib/db.ts              Supabase client + camelCase <-> snake_case mapping
src/lib/types.ts           domain types and enums
src/lib/places.ts          Google Places API (New) client + field masks
src/lib/import.ts          import + deduplication by Place ID
src/lib/scoring.ts         configurable scoring engine
src/lib/website.ts         lightweight website check
src/lib/lead-query.ts      filter/sort builder for the leads list
src/lib/ai.ts              prompts, grounded strictly in the lead record
src/lib/sales.ts           status transitions, contact logging, follow-up cadence
src/app/(app)/review       the review deck
src/app/(app)/leads        list, filters, detail
```

## Commands

```bash
npm run dev        # develop
npm run build      # next build
npm run typecheck  # tsc --noEmit
npm run db:push    # apply migrations to the linked Supabase project
npm run db:reset   # rebuild the local Supabase database from migrations
npm run db:diff    # generate a new migration from local schema changes
```
