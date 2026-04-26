import { NextRequest, NextResponse } from "next/server";
import type { BoM } from "@/lib/contracts";
import { getLead, sendOffer } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const existing = getLead(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bom = (body.bom ?? existing.publicPreview.bomVariants[1].bom) as BoM;
  const lead = sendOffer(id, {
    bom,
    totalEur: body.totalEur,
    installerNotes: body.installerNotes,
  });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ lead, success: true });
}
