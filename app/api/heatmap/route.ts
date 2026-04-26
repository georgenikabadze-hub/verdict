import { NextRequest, NextResponse } from "next/server";
import { generateAnnualHeatmap } from "@/lib/heatmaps/generate";

export const dynamic = "force-dynamic";
// Heatmap generation can take 5-15s — bump the route timeout.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: "lat/lng must be valid finite numbers within Earth bounds" },
      { status: 400 },
    );
  }

  try {
    const result = await generateAnnualHeatmap(lat, lng);
    if (!result) {
      return NextResponse.json(
        { error: "No Solar API coverage at these coordinates", source: "none" },
        { status: 404 },
      );
    }
    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Heatmap-Source": result.source,
        ...(result.fluxRange && {
          "X-Flux-Min": String(Math.round(result.fluxRange.min)),
          "X-Flux-Max": String(Math.round(result.fluxRange.max)),
        }),
        ...(result.bounds && {
          "X-Bounds-South": String(result.bounds.south),
          "X-Bounds-West": String(result.bounds.west),
          "X-Bounds-North": String(result.bounds.north),
          "X-Bounds-East": String(result.bounds.east),
        }),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
