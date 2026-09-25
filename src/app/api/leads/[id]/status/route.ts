import { NextResponse } from "next/server";
import { z } from "zod";
import { setStatus } from "@/lib/sales";
import { LEAD_STATUSES } from "@/lib/types";

const Body = z.object({
  status: z.enum(LEAD_STATUSES),
  note: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const lead = await setStatus(id, parsed.data.status, parsed.data.note);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead });
}
