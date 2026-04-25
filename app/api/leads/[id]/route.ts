import { NextRequest, NextResponse } from "next/server";
import { approveLead, getLead } from "@/lib/leads/store";

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
      installerName: body.installerName ?? "Müller Solartechnik",
      installerLogoEmoji: body.installerLogoEmoji ?? "☀",
      finalBom: body.finalBom,
    });
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ lead: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
