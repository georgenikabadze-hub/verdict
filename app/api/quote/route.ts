import { NextRequest, NextResponse } from "next/server";
import { sizeQuote } from "@/lib/sizing/calculate";
import type { Intake, RoofSegment } from "@/lib/contracts";

export const dynamic = "force-dynamic";

interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

async function geocode(address: string): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  // No country filter — global coverage
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const data = await res.json();
  const top = data.results?.[0];
  if (!top) return null;
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formattedAddress: top.formatted_address,
  };
}

async function getRoofSegments(lat: number, lng: number): Promise<RoofSegment[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    const segments = data?.solarPotential?.roofSegmentStats ?? [];
    return segments.map((s: {
      pitchDegrees?: number;
      azimuthDegrees?: number;
      stats?: { areaMeters2?: number; sunshineQuantiles?: number[] };
    }) => ({
      pitchDegrees: s.pitchDegrees ?? 0,
      azimuthDegrees: s.azimuthDegrees ?? 180,
      areaMeters2: s.stats?.areaMeters2 ?? 0,
      annualSunshineHours: s.stats?.sunshineQuantiles?.[5] ?? 1000,
    }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const address = req.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "missing ?address parameter" },
      { status: 400 },
    );
  }

  // 1. Geocode
  const geo = await geocode(address);
  if (!geo) {
    return NextResponse.json(
      {
        error: "could not geocode address",
        address,
        hint: "Address autocomplete + cached fallback arriving in Sprint 3.",
      },
      { status: 422 },
    );
  }

  // 2. Roof segments (live or empty)
  const roofSegments = await getRoofSegments(geo.lat, geo.lng);

  // 3. Default intake (Sprint 2 will collect from form; this is the API-direct entry point)
  const intake: Intake = {
    address: geo.formattedAddress,
    lat: geo.lat,
    lng: geo.lng,
    monthlyBillEur: Number(req.nextUrl.searchParams.get("bill") ?? "120"),
    ev: req.nextUrl.searchParams.get("ev") === "true",
    heating: (req.nextUrl.searchParams.get("heating") ?? "gas") as Intake["heating"],
    goal: (req.nextUrl.searchParams.get("goal") ?? "lower_bill") as Intake["goal"],
  };

  // 4. Size
  const sizing = sizeQuote(
    intake,
    roofSegments.length > 0
      ? roofSegments
      : [{ pitchDegrees: 35, azimuthDegrees: 180, areaMeters2: 60, annualSunshineHours: 1100 }],
  );

  return NextResponse.json(
    {
      ok: true,
      latencyMs: Date.now() - t0,
      address: geo.formattedAddress,
      coordinates: { lat: geo.lat, lng: geo.lng },
      roofSegmentsFromSolarApi: roofSegments.length,
      intake,
      sizing,
    },
    { status: 200 },
  );
}
