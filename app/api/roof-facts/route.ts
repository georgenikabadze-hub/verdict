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
    return NextResponse.json({
      segments: [],
      totalAreaM2: 0,
      source: "mock",
    });
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  try {
    const { data, apiStatus } = await getBuildingInsights(lat, lng);
    const bi = data as BuildingInsights;
    
    const solarPotential = bi?.solarPotential;
    const roofSegmentStats = solarPotential?.roofSegmentStats ?? [];
    
    const segments = roofSegmentStats.map((s) => ({
      pitchDegrees: Math.round(s.pitchDegrees ?? 0),
      azimuthDegrees: Math.round(s.azimuthDegrees ?? 180),
      areaMeters2: parseFloat((s.stats?.areaMeters2 ?? 0).toFixed(1)),
      annualSunshineHours: Math.round(s.stats?.sunshineQuantiles?.[5] ?? 1000),
    }));

    const totalAreaM2 = parseFloat((solarPotential?.wholeRoofStats?.areaMeters2 ?? 0).toFixed(1));
    const imageryDate = bi?.imageryDate;

    return NextResponse.json({
      segments,
      totalAreaM2,
      imageryDate,
      source: apiStatus.source,
    });
  } catch (error) {
    console.error("Error fetching roof facts:", error);
    return NextResponse.json({
      segments: [],
      totalAreaM2: 0,
      source: "cached",
    });
  }
}
