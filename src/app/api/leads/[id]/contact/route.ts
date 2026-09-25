import { NextResponse } from "next/server";
import { z } from "zod";
import { markContacted } from "@/lib/sales";
import { CONTACT_METHOD_VALUES } from "@/lib/types";

const Body = z.object({
  method: z.enum(CONTACT_METHOD_VALUES),
  note: z.string().optional(),
});

/** Logs an outbound message I sent by hand and queues the next follow-up. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const lead = await markContacted(id, parsed.data.method, parsed.data.note);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead });
}
