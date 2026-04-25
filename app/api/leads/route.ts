import { NextRequest, NextResponse } from "next/server";
import { createLead, listLeads, type LeadRecord } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ leads: listLeads() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<LeadRecord>;
  if (!body.id || !body.customerName) {
    return NextResponse.json({ error: "id and customerName required" }, { status: 400 });
  }
  const lead: LeadRecord = {
    id: body.id,
    createdAt: new Date().toISOString(),
    status: "new",
    customerName: body.customerName,
    city: body.city ?? "—",
    totalEur: body.totalEur ?? 0,
    monthlySavingsEur: body.monthlySavingsEur ?? 0,
    paybackYears: body.paybackYears ?? 0,
  };
  return NextResponse.json({ lead: createLead(lead) }, { status: 201 });
}
