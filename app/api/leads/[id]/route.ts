import { NextRequest, NextResponse } from "next/server";
import { acceptLead, approveLead, getLead, sendOffer } from "@/lib/leads/store";
import type { BoM } from "@/lib/contracts";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const lead = getLead(id);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.action === "approve") {
    const updated = approveLead(id, {
      installerName: body.installerName ?? "Berlin Solar Pro",
      installerLogoEmoji: body.installerLogoEmoji ?? "☀",
      finalBom: body.finalBom,
    });
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ lead: updated });
  }

  if (body.action === "accept") {
    const updated = acceptLead(id, {
      acceptedByInstallerId: body.acceptedByInstallerId,
      installerName: body.installerName,
      installerLogoEmoji: body.installerLogoEmoji,
    });
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ lead: updated });
  }

  if (body.action === "offer") {
    const existing = getLead(id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    const bom = (body.bom ?? existing.publicPreview.bomVariants[1].bom) as BoM;
    const updated = sendOffer(id, {
      bom,
      totalEur: body.totalEur,
      installerNotes: body.installerNotes,
    });
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ lead: updated, success: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
