import { NextRequest, NextResponse } from "next/server";
import { getDataLayers } from "@/lib/api/solar";
import { generateAnnualHeatmap } from "@/lib/heatmaps/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function fallbackBounds(lat: number, lng: number, radiusMeters = 50) {
  const dLat = radiusMeters / 111_320;
  const cosLat = Math.max(0.0001, Math.abs(Math.cos((lat * Math.PI) / 180)));
  const dLng = radiusMeters / (111_320 * cosLat);
  return {
    south: lat - dLat,
    west: lng - dLng,
    north: lat + dLat,
    east: lng + dLng,
  };
}

interface DataLayersResponse {
  imageryDate?: { year: number; month: number; day: number };
  imageryProcessedDate?: { year: number; month: number; day: number };
  annualFluxUrl?: string;
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");

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
    const [{ data, apiStatus }, heatmap] = await Promise.all([
      getDataLayers(lat, lng),
      generateAnnualHeatmap(lat, lng),
    ]);
    const layers = (data ?? {}) as DataLayersResponse;

    if (!heatmap) {
      return NextResponse.json(
        {
          error: "No annual flux raster available at these coordinates",
          source: apiStatus.source,
          status: apiStatus.status,
          message: apiStatus.message,
        },
        { status: 404 },
      );
    }

    const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    return NextResponse.json({
      annualFluxUrl: layers.annualFluxUrl,
      imageUrl: `/api/heatmap?${qs.toString()}`,
      // Google annualFlux GeoTIFF bounds can be projected metres (for Berlin,
      // UTM zone 33N), while Cesium rectangles require WGS84 degrees. The
      // Data Layers request is radius-based, so use that known request radius
      // for a stable viewer overlay instead of leaking raster CRS coordinates.
      bounds: fallbackBounds(lat, lng),
      width: heatmap.width,
      height: heatmap.height,
      fluxRange: heatmap.fluxRange,
      imageryDate: layers.imageryDate,
      imageryProcessedDate: layers.imageryProcessedDate,
      source: heatmap.source === "cached" ? "cached" : apiStatus.source,
      status: apiStatus.status,
      message: apiStatus.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load data layers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
