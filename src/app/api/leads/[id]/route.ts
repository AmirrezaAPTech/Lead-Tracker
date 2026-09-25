import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { rescoreLead } from "@/lib/scoring";
import { extractInstagramUsername } from "@/lib/place-mapper";
import { recomputeWebsiteHealth, SIGNAL_ISSUES } from "@/lib/website";
import { logActivity } from "@/lib/sales";
import {
  CONTACT_METHOD_VALUES,
  DEMO_STATUS_VALUES,
  LEAD_STATUSES,
  PROPOSAL_STATUS_VALUES,
  REJECT_REASON_VALUES,
  type Lead,
} from "@/lib/types";

const isoDate = z.coerce.date().transform((d) => d.toISOString());

/**
 * Everything on a lead is editable by hand. Google is only a starting point:
 * if the operator knows the Instagram account, the real phone number or the
 * correct neighbourhood, their value wins and is protected from later imports.
 */
const Patch = z.object({
  // business
  name: z.string().min(1).optional(),
  category: z.string().nullish(),
  address: z.string().nullish(),
  neighborhood: z.string().nullish(),
  district: z.string().nullish(),
  city: z.string().min(1).optional(),
  mapsUrl: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  contactPerson: z.string().nullish(),
  businessStatus: z.string().nullish(),

  // google
  rating: z.coerce.number().min(0).max(5).nullish(),
  reviewCount: z.coerce.number().int().min(0).nullish(),
  priceLevel: z.string().nullish(),

  // website
  website: z.string().nullish(),
  pageTitle: z.string().nullish(),
  metaDescription: z.string().nullish(),
  h1: z.string().nullish(),
  httpsOk: z.boolean().nullish(),
  mobileFriendly: z.boolean().nullish(),
  whatsappCta: z.boolean().nullish(),
  phoneCta: z.boolean().nullish(),
  bookingCta: z.boolean().nullish(),

  // instagram
  instagramUrl: z.string().nullish(),
  instagramUsername: z.string().nullish(),
  instagramFollowers: z.coerce.number().int().min(0).nullish(),
  instagramActive: z.boolean().nullish(),
  instagramNotes: z.string().nullish(),

  // sales
  status: z.enum(LEAD_STATUSES).optional(),
  rejectReason: z.enum(REJECT_REASON_VALUES).nullish(),
  rejectNote: z.string().nullish(),
  contactMethod: z.enum(CONTACT_METHOD_VALUES).nullish(),
  firstContactAt: isoDate.nullish(),
  lastContactAt: isoDate.nullish(),
  nextFollowUpAt: isoDate.nullish(),
  followUpCount: z.coerce.number().int().min(0).optional(),
  responded: z.boolean().optional(),
  responseNotes: z.string().nullish(),
  priceQuoted: z.coerce.number().int().min(0).nullish(),
  dealValue: z.coerce.number().int().min(0).nullish(),
  lostReason: z.string().nullish(),

  // demo
  demoCreated: z.boolean().optional(),
  demoUrl: z.string().nullish(),
  demoAt: isoDate.nullish(),
  demoMinutes: z.coerce.number().int().min(0).nullish(),
  demoStatus: z.enum(DEMO_STATUS_VALUES).optional(),
  demoWorthIt: z.boolean().nullish(),
  proposalStatus: z.enum(PROPOSAL_STATUS_VALUES).optional(),
  proposalSentAt: isoDate.nullish(),

  pinned: z.boolean().optional(),
});

/** Columns Google owns unless the operator has overridden them. */
const PROTECTABLE = new Set([
  "name",
  "category",
  "address",
  "neighborhood",
  "district",
  "city",
  "mapsUrl",
  "phone",
  "businessStatus",
  "rating",
  "reviewCount",
  "priceLevel",
  "website",
  "pageTitle",
  "metaDescription",
  "h1",
  ...Object.keys(SIGNAL_ISSUES),
]);

const WEBSITE_SIGNAL_FIELDS = new Set([...Object.keys(SIGNAL_ISSUES), "pageTitle"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid fields", detail: parsed.error.issues }, { status: 400 });
  }

  const found = await db().from(TABLES.leads).select("*").eq("id", id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });
  const current = fromRow<Lead>(found.data);
  if (!current) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const data: Record<string, unknown> = { ...parsed.data };
  const edited = Object.keys(parsed.data);

  if (typeof data.website === "string") data.hasWebsite = data.website.trim().length > 0;
  if (data.website === null) {
    data.hasWebsite = false;
    data.websiteScore = null;
    data.websiteIssues = [];
    data.websiteCheckedAt = null;
  }

  if (typeof data.instagramUrl === "string" && !data.instagramUsername) {
    const handle = extractInstagramUsername(data.instagramUrl);
    if (handle) data.instagramUsername = handle;
  }
  if ((data.instagramUrl || data.instagramUsername) && data.instagramActive === undefined) {
    data.instagramActive = true;
  }

  // Correcting a website signal by hand must also fix the issue list and score,
  // otherwise the lead would still be sold against a problem that is not real.
  if (edited.some((f) => WEBSITE_SIGNAL_FIELDS.has(f)) && current.website && data.website !== null) {
    const merged = { ...current, ...data } as unknown as Parameters<typeof recomputeWebsiteHealth>[0];
    const health = recomputeWebsiteHealth(merged);
    data.websiteIssues = health.websiteIssues;
    data.websiteScore = health.websiteScore;
  }

  const manual = new Set(current.manualFields ?? []);
  for (const field of edited) if (PROTECTABLE.has(field)) manual.add(field);
  data.manualFields = Array.from(manual).sort();

  const res = await db().from(TABLES.leads).update(toRow(data)).eq("id", id).select("id").maybeSingle();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  const protectedNow = edited.filter((f) => PROTECTABLE.has(f));
  if (protectedNow.length) {
    await logActivity(id, "OTHER", `Edited by hand: ${protectedNow.join(", ")}`);
  }

  const lead = await rescoreLead(id);
  return NextResponse.json({ lead });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Leads are never hard-deleted from the UI; this exists for cleanup only.
  const found = await db().from(TABLES.leads).select("id").eq("id", id).maybeSingle();
  if (!found.data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const res = await db().from(TABLES.leads).delete().eq("id", id);
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
