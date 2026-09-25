import { NextResponse } from "next/server";
import { z } from "zod";
import { recordResponse } from "@/lib/sales";
import { RESPONSE_CLASS_VALUES } from "@/lib/types";

const Body = z.object({
  responseClass: z.enum(RESPONSE_CLASS_VALUES),
  note: z.string().optional(),
});

/**
 * Records how a reply went - whether the conversation moved forward, not just
 * that one arrived. Attribution to the lead's active strategy happens inside
 * recordResponse.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid response" }, { status: 400 });

  const lead = await recordResponse(id, parsed.data.responseClass, parsed.data.note);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead });
}
