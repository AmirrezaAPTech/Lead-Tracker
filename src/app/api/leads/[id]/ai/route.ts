import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { aiConfigured, analyzeLead, generateMessage, type MessageKind } from "@/lib/ai";
import { logActivity } from "@/lib/sales";
import { AI_OUTPUT_KINDS, type AiOutput, type Lead } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({ kind: z.enum(AI_OUTPUT_KINDS) });

/** Generates text for review. Nothing is ever sent anywhere automatically. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!aiConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const found = await db().from(TABLES.leads).select("*").eq("id", id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });
  const lead = fromRow<Lead>(found.data);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  try {
    const { kind } = parsed.data;
    const { text, model } =
      kind === "ANALYSIS" ? await analyzeLead(lead) : await generateMessage(lead, kind as MessageKind);

    const res = await db()
      .from(TABLES.aiOutputs)
      .insert(toRow({ leadId: id, kind, content: text, model }))
      .select()
      .single();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

    await logActivity(
      id,
      kind === "ANALYSIS" ? "AI_ANALYSIS" : "AI_MESSAGE",
      kind === "ANALYSIS" ? "AI analysis generated" : `AI draft generated (${kind})`,
    );

    return NextResponse.json({ output: fromRow<AiOutput>(res.data) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI request failed" }, { status: 500 });
  }
}
