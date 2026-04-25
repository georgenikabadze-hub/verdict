import { NextRequest, NextResponse } from "next/server";
import { lookupAerialVideo } from "@/lib/api/aerial-view";

export const dynamic = "force-dynamic";

/**
 * GET /api/aerial-view?lat=&lng=
 *
 * Returns:
 *   { videoUrl: string | null, state: "ready"|"rendering"|"not_found"|"error", message?: string }
 *
 * On state="rendering", the client should re-poll every ~10s until it flips
 * to "ready" (or "error" / "not_found").
 */
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
    const result = await lookupAerialVideo(lat, lng);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({
      videoUrl: null,
      state: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
