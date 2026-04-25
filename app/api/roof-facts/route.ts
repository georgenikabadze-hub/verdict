import { NextRequest, NextResponse } from "next/server";
import { getBuildingInsights } from "@/lib/api/solar";

export const dynamic = "force-dynamic";

interface SolarPotential {
  wholeRoofStats: { areaMeters2: number };
  roofSegmentStats: Array<{
    pitchDegrees?: number;
    azimuthDegrees?: number;
    stats?: { areaMeters2?: number; sunshineQuantiles?: number[] };
  }>;
}

interface BuildingInsights {
  name: string;
  imageryDate: { year: number; month: number; day: number };
  solarPotential: SolarPotential;
}

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

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: "lat/lng must be valid finite numbers within Earth bounds" },
      { status: 400 },
    );
  }

  try {
    const { data, apiStatus } = await getBuildingInsights(lat, lng);

    // No data → no coverage → empty segments + clear status (NEVER fake another building's data)
    if (!data || apiStatus.status === "error") {
      return NextResponse.json({
        segments: [],
        totalAreaM2: 0,
        source: "mock",
        message: apiStatus.message ?? "No measurement available for this location",
      });
    }

    const bi = data as BuildingInsights;
    const solarPotential = bi?.solarPotential;
    const roofSegmentStatsRaw = solarPotential?.roofSegmentStats;
    const roofSegmentStats = Array.isArray(roofSegmentStatsRaw) ? roofSegmentStatsRaw : [];

    const segments = roofSegmentStats.map((s) => ({
      pitchDegrees: Math.round(s.pitchDegrees ?? 0),
      azimuthDegrees: Math.round(s.azimuthDegrees ?? 180),
      areaMeters2: parseFloat((s.stats?.areaMeters2 ?? 0).toFixed(1)),
      annualSunshineHours: Math.round(s.stats?.sunshineQuantiles?.[5] ?? 1000),
    }));

    // Prefer wholeRoofStats; fall back to a sum of segments when missing
    const wholeRoofArea = solarPotential?.wholeRoofStats?.areaMeters2;
    const totalAreaM2 =
      wholeRoofArea && wholeRoofArea > 0
        ? parseFloat(wholeRoofArea.toFixed(1))
        : parseFloat(segments.reduce((acc, s) => acc + s.areaMeters2, 0).toFixed(1));

    return NextResponse.json({
      segments,
      totalAreaM2,
      imageryDate: bi?.imageryDate,
      source: apiStatus.source,
      status: apiStatus.status,
      message: apiStatus.message,
    });
  } catch {
    return NextResponse.json({
      segments: [],
      totalAreaM2: 0,
      source: "mock",
      message: "Failed to reach Solar API",
    });
  }
}
