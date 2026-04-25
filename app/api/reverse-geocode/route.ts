import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!lat || !lng) {
    return NextResponse.json({ error: "missing lat/lng" }, { status: 400 });
  }
  if (!key) {
    return NextResponse.json({ error: "server missing GOOGLE_MAPS_API_KEY" }, { status: 500 });
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=en&result_type=street_address|premise|subpremise|route`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return NextResponse.json({ error: `upstream HTTP ${res.status}` }, { status: 502 });
    const data = await res.json();
    const top = data.results?.[0];
    if (!top) return NextResponse.json({ error: "no address found near coordinates" }, { status: 404 });
    return NextResponse.json({
      address: top.formatted_address,
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 504 });
  }
}
