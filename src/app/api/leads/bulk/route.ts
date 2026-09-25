import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRows, toRow, TABLES } from "@/lib/db";
import { analyzeWebsite } from "@/lib/website";
import { rescoreLead } from "@/lib/scoring";
import { setStatus } from "@/lib/sales";
import { assignStrategy, clearStrategy } from "@/lib/strategy";
import { PIPELINE } from "@/lib/constants";
import { REJECT_REASON_VALUES, type Lead, type LeadStatus } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["keep", "reject", "status", "analyze-websites", "pin", "unpin", "assign-strategy"]),
  status: z.enum(PIPELINE as unknown as [LeadStatus, ...LeadStatus[]]).optional(),
  reason: z.enum(REJECT_REASON_VALUES).optional(),
  /** null clears the strategy; both paths keep the old assignment in history. */
  strategyId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { ids, action, status, reason, strategyId } = parsed.data;

  // The batch assignment that makes a controlled test practical: select 40
  // qualified salons, pick a strategy, done. Also used with a single id from
  // the lead detail page, so there is one code path to keep correct.
  if (action === "assign-strategy") {
    try {
      if (!strategyId) {
        const count = await clearStrategy(ids);
        return NextResponse.json({ ok: true, count });
      }
      const { assigned, unchanged } = await assignStrategy(ids, strategyId);
      return NextResponse.json({ ok: true, count: assigned, unchanged });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  if (action === "keep" || action === "reject") {
    const keep = action === "keep";
    const update = await db()
      .from(TABLES.leads)
      .update(
        toRow({
          status: keep ? "QUALIFIED" : "REJECTED",
          reviewedAt: new Date().toISOString(),
          rejectReason: keep ? null : (reason ?? "OTHER"),
        }),
      )
      .in("id", ids);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });

    const log = await db()
      .from(TABLES.activities)
      .insert(
        ids.map((leadId) =>
          toRow({
            leadId,
            type: "REVIEWED",
            title: keep ? "Kept - qualified (bulk)" : `Rejected - ${reason ?? "OTHER"} (bulk)`,
          }),
        ),
      );
    if (log.error) return NextResponse.json({ error: log.error.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (action === "status" && status) {
    for (const id of ids) await setStatus(id, status);
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (action === "pin" || action === "unpin") {
    const res = await db()
      .from(TABLES.leads)
      .update({ pinned: action === "pin" })
      .in("id", ids);
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: ids.length });
  }

  if (action === "analyze-websites") {
    // Only leads that actually have a site, capped so one click cannot run away.
    const res = await db()
      .from(TABLES.leads)
      .select("*")
      .in("id", ids)
      .not("website", "is", null)
      .neq("status", "REJECTED")
      .limit(40);
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

    const leads = fromRows<Lead>(res.data);
    let checked = 0;

    for (const lead of leads) {
      try {
        const r = await analyzeWebsite(lead.website!);
        await db()
          .from(TABLES.leads)
          .update(
            toRow({
              httpsOk: r.httpsOk,
              httpStatus: r.httpStatus,
              pageTitle: r.pageTitle,
              metaDescription: r.metaDescription,
              h1: r.h1,
              mobileFriendly: r.mobileFriendly,
              whatsappCta: r.whatsappCta,
              phoneCta: r.phoneCta,
              bookingCta: r.bookingCta,
              websiteScore: r.websiteScore,
              websiteIssues: r.websiteIssues,
              websiteError: r.websiteError,
              websiteMs: r.websiteMs,
              websiteCheckedAt: new Date().toISOString(),
            }),
          )
          .eq("id", lead.id);
        await rescoreLead(lead.id);
        checked++;
      } catch {
        // one bad site must not stop the batch
      }
    }

    return NextResponse.json({ ok: true, count: checked, requested: leads.length });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
