import { NextRequest, NextResponse } from "next/server";
import { createLead, listLeads, type CreateLeadInput } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ leads: listLeads() });
}

export async function POST(req: NextRequest) {
  // `bomVariants` (if present in payload) is silently ignored — the installer
  // side composes variants from the cached market catalog when the lead is
  // opened. Kept tolerant so old clients don't 400.
  const body = (await req.json()) as Partial<CreateLeadInput>;
  if (
    !body.id ||
    !body.address ||
    typeof body.lat !== "number" ||
    typeof body.lng !== "number" ||
    typeof body.monthlyBillEur !== "number"
  ) {
    return NextResponse.json(
      { error: "id, address, lat, lng, and monthlyBillEur required" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      lead: createLead({
        id: body.id,
        createdAt: body.createdAt,
        status: body.status,
        address: body.address,
        lat: body.lat,
        lng: body.lng,
        district: body.district,
        customerName: body.customerName,
        email: body.email,
        phone: body.phone,
        monthlyBillEur: body.monthlyBillEur,
        ev: body.ev ?? false,
        heating: body.heating ?? "gas",
        goal: body.goal ?? "lower_bill",
        evPref: body.evPref,
        wantsBattery: body.wantsBattery,
        wantsHeatPump: body.wantsHeatPump,
        roofSegments: body.roofSegments,
      }),
    },
    { status: 201 },
  );
}
