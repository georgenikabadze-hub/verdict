import { NextRequest, NextResponse } from "next/server";
import { getBuildingFootprint } from "@/lib/osm/footprint";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const latStr = req.nextUrl.searchParams.get("lat");
  const lngStr = req.nextUrl.searchParams.get("lng");

  if (!latStr || !lngStr) {
    return NextResponse.json(
      { error: "lat and lng query params required" },
      { status: 400 },
    );
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      { error: "lat/lng must be valid finite numbers within Earth bounds" },
      { status: 400 },
    );
  }

  try {
    const footprint = await getBuildingFootprint(lat, lng);
    return NextResponse.json({ footprint });
  } catch (err) {
    return NextResponse.json({
      footprint: null,
      error: err instanceof Error ? err.message : "Footprint fetch failed",
    });
  }
}
