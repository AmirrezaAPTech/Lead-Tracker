import { db, fromRows, TABLES } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { endOfToday } from "@/lib/utils";
import { followUpLabel, suggestNextAction } from "@/lib/sales";
import { PageHeader, EmptyState } from "@/components/bits";
import { FollowUpRow, type FollowUpItem } from "@/components/followup-row";
import type { AiOutput, FollowUp, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "id",
  "name",
  "status",
  "contact_person",
  "neighborhood",
  "last_contact_at",
  "next_follow_up_at",
  "follow_up_count",
  "contact_method",
  "responded",
  "phone",
  "email",
  "website",
  "maps_url",
  "instagram_url",
  "instagram_username",
  "follow_ups(id, number, due_at, done_at, skipped)",
  "ai_outputs(id, kind, content, created_at)",
].join(", ");

type DueLead = Lead & { followUps: FollowUp[]; aiOutputs: AiOutput[] };

async function loadDue(before: Date, after?: Date) {
  let query = db()
    .from(TABLES.leads)
    .select(COLUMNS)
    .not("status", "in", "(WON,LOST,REJECTED)")
    .order("next_follow_up_at", { ascending: true })
    .limit(100);

  query = after
    ? query.gt("next_follow_up_at", before.toISOString()).lte("next_follow_up_at", after.toISOString())
    : query.lte("next_follow_up_at", before.toISOString());

  const res = await query;
  if (res.error) throw new Error(`load follow-ups: ${res.error.message}`);
  return fromRows<DueLead>(res.data as unknown as Record<string, unknown>[]);
}

function toItem(lead: DueLead): FollowUpItem {
  const open = (lead.followUps ?? [])
    .filter((f) => !f.doneAt && !f.skipped)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  const lastDraft = (lead.aiOutputs ?? [])
    .filter((o) => o.kind === "FOLLOW_UP")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return {
    followUpId: open?.id ?? null,
    leadId: lead.id,
    name: lead.name,
    status: lead.status,
    contactPerson: lead.contactPerson,
    neighborhood: lead.neighborhood,
    lastContactAt: lead.lastContactAt,
    nextFollowUpAt: lead.nextFollowUpAt,
    followUpCount: lead.followUpCount,
    action: lead.responded ? suggestNextAction(lead) : followUpLabel(lead.followUpCount + 1),
    phone: lead.phone,
    email: lead.email,
    website: lead.website,
    mapsUrl: lead.mapsUrl,
    instagramUrl: lead.instagramUrl,
    instagramUsername: lead.instagramUsername,
    suggestedMessage: lastDraft?.content ?? null,
  };
}

export default async function FollowUpsPage() {
  const today = endOfToday();
  const week = new Date(today.getTime() + 7 * 86400000);

  const [due, upcoming] = await Promise.all([loadDue(today), loadDue(today, week)]);
  const ai = aiConfigured();

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle={`${due.length} due today or overdue - ${upcoming.length} in the next 7 days`}
      />

      <div className="space-y-6 p-6">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due now</h2>
          {due.length === 0 ? (
            <EmptyState title="Nothing due" hint="Follow-ups appear here on day 2, 5 and 9 after each contact." />
          ) : (
            due.map((lead) => <FollowUpRow key={lead.id} item={toItem(lead)} aiEnabled={ai} />)
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next 7 days</h2>
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
          ) : (
            upcoming.map((lead) => <FollowUpRow key={lead.id} item={toItem(lead)} aiEnabled={ai} />)
          )}
        </section>
      </div>
    </div>
  );
}
