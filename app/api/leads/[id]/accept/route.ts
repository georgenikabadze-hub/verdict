import { NextRequest, NextResponse } from "next/server";
import { acceptLead } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const lead = acceptLead(id, {
    acceptedByInstallerId: body.acceptedByInstallerId,
    installerName: body.installerName,
    installerLogoEmoji: body.installerLogoEmoji,
  });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ lead, success: true });
}
