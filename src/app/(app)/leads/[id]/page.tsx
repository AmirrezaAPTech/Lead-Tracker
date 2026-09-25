import Link from "next/link";
import { notFound } from "next/navigation";
import { db, fromRow, TABLES } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { fmtDate, fmtDateTime, money, relativeDays } from "@/lib/utils";
import { CONTACT_METHODS, DEMO_STATUSES, PROPOSAL_STATUSES, REJECT_REASON_LABEL } from "@/lib/constants";
import { suggestNextAction } from "@/lib/sales";
import { PageHeader, ScoreReasons, StatusBadge, TierBadge, WebsiteChip } from "@/components/bits";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickActions } from "@/components/quick-actions";
import { StatusPicker } from "@/components/lead/status-picker";
import { ContactBar } from "@/components/lead/contact-bar";
import { LeadTools } from "@/components/lead/lead-tools";
import { SiteMediaPanel } from "@/components/lead/site-media-panel";
import { AiPanel } from "@/components/lead/ai-panel";
import { NotesPanel } from "@/components/lead/notes-panel";
import { EditForm } from "@/components/lead/edit-form";
import { ManualFieldsBar } from "@/components/lead/manual-fields-bar";
import { StrategyPanel } from "@/components/lead/strategy-panel";
import { ResponsePicker } from "@/components/lead/response-picker";
import { activeAssignment, assignmentHistory, listStrategies } from "@/lib/strategy";
import { RESPONSE_CLASS_CLASS, RESPONSE_CLASS_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import type {
  Activity,
  AiOutput,
  Campaign,
  FollowUp,
  Lead,
  LeadSource,
  Note,
  Strategy,
  StrategyAssignment,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type LeadDetail = Lead & {
  notes: Note[];
  activities: Activity[];
  aiOutputs: AiOutput[];
  followUps: FollowUp[];
  sources: (LeadSource & { campaign: Campaign | null })[];
};

const DETAIL_SELECT =
  "*, notes(*), activities(*), aiOutputs:ai_outputs(*), followUps:follow_ups(*), sources:lead_sources(*, campaign:campaigns(*))";

function byNewest<T extends { createdAt: string }>(rows: T[] | undefined) {
  return [...(rows ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-0">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-xs">{value ?? "-"}</span>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const res = await db().from(TABLES.leads).select(DETAIL_SELECT).eq("id", id).maybeSingle();
  if (res.error) throw new Error(`load lead: ${res.error.message}`);

  const raw = fromRow<LeadDetail>(res.data as unknown as Record<string, unknown>);
  if (!raw) notFound();

  const lead: LeadDetail = {
    ...raw,
    notes: byNewest(raw.notes).slice(0, 50),
    activities: byNewest(raw.activities).slice(0, 40),
    aiOutputs: byNewest(raw.aiOutputs).slice(0, 12),
    followUps: [...(raw.followUps ?? [])].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 10),
    sources: [...(raw.sources ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };

  const initial = lead as unknown as Record<string, unknown>;
  const openFollowUp = lead.followUps.find((f) => !f.doneAt && !f.skipped);

  const [active, history, assignable] = await Promise.all([
    activeAssignment(lead.id),
    assignmentHistory(lead.id),
    listStrategies(false),
  ]);

  return (
    <div>
      <PageHeader
        title={lead.name}
        subtitle={[lead.category, lead.neighborhood, lead.district, lead.city].filter(Boolean).join(" - ")}
      >
        <TierBadge tier={lead.tier} score={lead.score} />
        <StatusBadge status={lead.status} />
      </PageHeader>

      <div className="border-b border-border px-6 py-2">
        <QuickActions lead={lead} />
      </div>

      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ManualFieldsBar leadId={lead.id} manualFields={lead.manualFields ?? []} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Business</CardTitle>
                <CardDescription>
                  Everything here is yours to correct. Anything you change is kept out of Google&apos;s reach.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <EditForm
                  leadId={lead.id}
                  initial={initial}
                  manualFields={lead.manualFields ?? []}
                  fields={[
                    { name: "name", label: "Business name", type: "text", full: true },
                    { name: "category", label: "Category", type: "text" },
                    { name: "businessStatus", label: "Business status", type: "text" },
                    { name: "phone", label: "Phone", type: "text" },
                    { name: "email", label: "Email", type: "text" },
                    { name: "contactPerson", label: "Contact person", type: "text" },
                    { name: "website", label: "Website", type: "text" },
                    { name: "neighborhood", label: "Neighbourhood", type: "text" },
                    { name: "district", label: "District", type: "text" },
                    { name: "city", label: "City", type: "text" },
                    { name: "address", label: "Address", type: "text", full: true },
                    { name: "mapsUrl", label: "Google Maps link", type: "text", full: true },
                  ]}
                />
                <Row label="Place ID" value={<span className="font-mono text-[10px]">{lead.placeId}</span>} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle>Google</CardTitle>
                  <CardDescription>Refreshed on enrich, unless you have set a value yourself.</CardDescription>
                </div>
                <LeadTools
                  leadId={lead.id}
                  leadName={lead.name}
                  hasWebsite={Boolean(lead.website)}
                  demoUrl={lead.demoUrl}
                />
              </CardHeader>
              <CardContent className="space-y-3">
                <EditForm
                  leadId={lead.id}
                  initial={initial}
                  manualFields={lead.manualFields ?? []}
                  fields={[
                    { name: "rating", label: "Rating", type: "number" },
                    { name: "reviewCount", label: "Review count", type: "number" },
                    { name: "priceLevel", label: "Price level", type: "text" },
                  ]}
                />
                <div>
                  <Row label="Data fetched" value={fmtDateTime(lead.googleFetchedAt)} />
                  <Row
                    label="Details enriched"
                    value={lead.detailsFetchedAt ? fmtDateTime(lead.detailsFetchedAt) : "never"}
                  />
                  <Row
                    label="Maps"
                    value={
                      lead.mapsUrl ? (
                        <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Open
                        </a>
                      ) : (
                        "-"
                      )
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Website</CardTitle>
                <WebsiteChip hasWebsite={lead.hasWebsite} websiteScore={lead.websiteScore} issues={lead.websiteIssues} />
              </CardHeader>
              <CardContent>
                {!lead.website ? (
                  <p className="text-xs text-muted-foreground">
                    No website on file. That is the strongest sales angle for this lead.
                  </p>
                ) : (
                  <>
                    <Row
                      label="URL"
                      value={
                        <a href={lead.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {lead.website}
                        </a>
                      }
                    />
                    <Row label="HTTPS" value={lead.httpsOk === null ? "-" : lead.httpsOk ? "Yes" : "No"} />
                    <Row label="HTTP status" value={lead.httpStatus ?? "-"} />
                    <Row label="Title" value={lead.pageTitle ?? "-"} />
                    <Row label="Meta description" value={lead.metaDescription ? "Present" : "Missing"} />
                    <Row label="H1" value={lead.h1 ?? "-"} />
                    <Row label="Mobile viewport" value={lead.mobileFriendly === null ? "-" : lead.mobileFriendly ? "Yes" : "No"} />
                    <Row label="WhatsApp CTA" value={lead.whatsappCta === null ? "-" : lead.whatsappCta ? "Yes" : "No"} />
                    <Row label="Click to call" value={lead.phoneCta === null ? "-" : lead.phoneCta ? "Yes" : "No"} />
                    <Row label="Booking CTA" value={lead.bookingCta === null ? "-" : lead.bookingCta ? "Yes" : "No"} />
                    <Row label="Load time" value={lead.websiteMs ? `${lead.websiteMs} ms` : "-"} />
                    <Row label="Checked" value={lead.websiteCheckedAt ? fmtDateTime(lead.websiteCheckedAt) : "never"} />
                    {lead.websiteError ? <Row label="Error" value={lead.websiteError} /> : null}
                    {lead.websiteIssues.length ? (
                      <ul className="mt-2 space-y-0.5">
                        {lead.websiteIssues.map((i) => (
                          <li key={i} className="text-xs text-amber-300/90">
                            - {i}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-3 border-t border-border/40 pt-3">
                      <p className="mb-2 text-[10px] text-muted-foreground">
                        Checked the site yourself and the detection is wrong? Correct it here - the issue list and
                        the score are rebuilt from your values.
                      </p>
                      <EditForm
                        leadId={lead.id}
                        initial={initial}
                        manualFields={lead.manualFields ?? []}
                        fields={[
                          { name: "httpsOk", label: "HTTPS", type: "bool" },
                          { name: "mobileFriendly", label: "Mobile-friendly", type: "bool" },
                          { name: "whatsappCta", label: "WhatsApp CTA", type: "bool" },
                          { name: "phoneCta", label: "Click-to-call", type: "bool" },
                          { name: "bookingCta", label: "Booking CTA", type: "bool" },
                          { name: "pageTitle", label: "Page title", type: "text", full: true },
                          { name: "metaDescription", label: "Meta description", type: "text", full: true },
                          { name: "h1", label: "H1", type: "text", full: true },
                        ]}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Instagram</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-[10px] text-muted-foreground">
                  Google rarely carries the Instagram account. If you know it, put it here: it feeds the score and
                  the outreach drafts straight away.
                </p>
                <EditForm
                  leadId={lead.id}
                  initial={initial}
                  manualFields={lead.manualFields ?? []}
                  fields={[
                    { name: "instagramUrl", label: "Instagram URL", type: "text", full: true },
                    { name: "instagramUsername", label: "Username", type: "text" },
                    { name: "instagramFollowers", label: "Followers", type: "number" },
                    { name: "instagramActive", label: "Active", type: "bool" },
                    { name: "instagramNotes", label: "Notes", type: "textarea", full: true },
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          <AiPanel leadId={lead.id} aiEnabled={aiConfigured()} history={lead.aiOutputs} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <NotesPanel leadId={lead.id} notes={lead.notes} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {lead.activities.map((a) => (
                    <li key={a.id} className="border-b border-border/40 pb-1 last:border-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs">{a.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                      </div>
                      {a.body ? <p className="text-[10px] text-muted-foreground">{a.body}</p> : null}
                    </li>
                  ))}
                  {lead.activities.length === 0 ? (
                    <li className="text-xs text-muted-foreground">Nothing logged yet.</li>
                  ) : null}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Outreach strategy</CardTitle>
              <CardDescription>How this lead is being approached, and the script to copy.</CardDescription>
            </CardHeader>
            <CardContent>
              <StrategyPanel
                leadId={lead.id}
                active={active as (StrategyAssignment & { strategy: Strategy | null }) | null}
                history={history}
                strategies={assignable.map((st) => ({ id: st.id, name: st.name }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div>
                <CardTitle>Response</CardTitle>
                <CardDescription>Did the conversation move forward?</CardDescription>
              </div>
              <Badge className={RESPONSE_CLASS_CLASS[lead.responseClass]}>
                {RESPONSE_CLASS_LABEL[lead.responseClass]}
              </Badge>
            </CardHeader>
            <CardContent>
              <ResponsePicker leadId={lead.id} current={lead.responseClass} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Qualification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="tabnum text-3xl font-bold">{lead.score}</span>
                <TierBadge tier={lead.tier} />
              </div>
              <ScoreReasons reasons={lead.scoreReasons} />
              <p className="text-[10px] text-muted-foreground">
                Prioritisation score only. It does not predict whether this business will buy.
              </p>
              <Row label="Reviewed" value={lead.reviewedAt ? fmtDate(lead.reviewedAt) : "not yet"} />
              {lead.rejectReason ? (
                <Row label="Reject reason" value={REJECT_REASON_LABEL[lead.rejectReason]} />
              ) : null}
              {lead.rejectNote ? <Row label="Reject note" value={lead.rejectNote} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusPicker leadId={lead.id} status={lead.status} />
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Next action</div>
                  <div className="truncate text-xs">{suggestNextAction(lead)}</div>
                </div>
                <ContactBar leadId={lead.id} defaultMethod={lead.contactMethod} />
              </div>

              <div>
                <Row label="First contact" value={lead.firstContactAt ? fmtDate(lead.firstContactAt) : "never"} />
                <Row label="Last contact" value={lead.lastContactAt ? fmtDate(lead.lastContactAt) : "never"} />
                <Row label="Follow-ups sent" value={lead.followUpCount} />
                <Row
                  label="Next follow-up"
                  value={lead.nextFollowUpAt ? `${fmtDate(lead.nextFollowUpAt)} (${relativeDays(lead.nextFollowUpAt)})` : "-"}
                />
                <Row label="Responded" value={lead.responded ? fmtDate(lead.respondedAt) : "no"} />
                <Row label="Price quoted" value={money(lead.priceQuoted, lead.currency)} />
                <Row label="Deal value" value={money(lead.dealValue, lead.currency)} />
              </div>

              <EditForm
                leadId={lead.id}
                columns={1}
                initial={initial}
                fields={[
                  {
                    name: "contactMethod",
                    label: "Contact method",
                    type: "select",
                    options: [{ value: "", label: "-" }, ...CONTACT_METHODS],
                  },
                  { name: "nextFollowUpAt", label: "Next follow-up", type: "date" },
                  { name: "responded", label: "Responded", type: "bool" },
                  { name: "responseNotes", label: "Response notes", type: "textarea" },
                  { name: "priceQuoted", label: "Price quoted", type: "number" },
                  { name: "dealValue", label: "Deal value (won)", type: "number" },
                  { name: "lostReason", label: "Lost reason", type: "text" },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demo</CardTitle>
            </CardHeader>
            <CardContent>
              <EditForm
                leadId={lead.id}
                columns={1}
                initial={initial}
                fields={[
                  { name: "demoCreated", label: "Demo created", type: "bool" },
                  { name: "demoUrl", label: "Demo URL", type: "text" },
                  { name: "demoAt", label: "Demo date", type: "date" },
                  { name: "demoMinutes", label: "Time spent (minutes)", type: "number" },
                  { name: "demoStatus", label: "Demo status", type: "select", options: DEMO_STATUSES },
                  { name: "demoWorthIt", label: "Was the demo worth it?", type: "bool" },
                  { name: "proposalStatus", label: "Proposal status", type: "select", options: PROPOSAL_STATUSES },
                  { name: "proposalSentAt", label: "Proposal sent", type: "date" },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Website media</CardTitle>
              <CardDescription>Photos from their Google Maps listing, straight into the generated site.</CardDescription>
            </CardHeader>
            <CardContent>
              <SiteMediaPanel leadId={lead.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {lead.followUps.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      #{f.number} {f.action ?? ""}
                    </span>
                    <span className="text-muted-foreground">
                      {f.doneAt ? `done ${fmtDate(f.doneAt)}` : f.skipped ? "skipped" : `due ${fmtDate(f.dueAt)}`}
                    </span>
                  </li>
                ))}
                {lead.followUps.length === 0 ? (
                  <li className="text-xs text-muted-foreground">No follow-ups scheduled.</li>
                ) : null}
              </ul>
              {openFollowUp ? (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Next one is queued for {fmtDate(openFollowUp.dueAt)}. Nothing is sent automatically.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {lead.sources.map((src) => (
                  <li key={src.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {src.campaign ? (
                        <Link href={`/campaigns/${src.campaign.id}`} className="text-primary hover:underline">
                          {src.campaign.name}
                        </Link>
                      ) : (
                        "Ad-hoc search"
                      )}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground">{src.query}</span>
                  </li>
                ))}
                {lead.sources.length === 0 ? <li className="text-xs text-muted-foreground">No source recorded.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
