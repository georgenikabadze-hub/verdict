import { NextRequest, NextResponse } from "next/server";
import { getBuildingInsights } from "@/lib/api/solar";

export const dynamic = "force-dynamic";

interface SolarPanel {
  center?: { latitude?: number; longitude?: number };
  orientation?: "LANDSCAPE" | "PORTRAIT";
  segmentIndex?: number;
  yearlyEnergyDcKwh?: number;
}

interface SolarPotential {
  wholeRoofStats: { areaMeters2: number };
  roofSegmentStats: Array<{
    pitchDegrees?: number;
    azimuthDegrees?: number;
    stats?: { areaMeters2?: number; sunshineQuantiles?: number[] };
    /** WGS84 ellipsoidal height in metres at the segment center.
     *  Critical for Cesium panel overlays — without this we'd draw panels
     *  underground (the photoreal mesh sits ~30–60 m above the ellipsoid
     *  for a typical Berlin roof). */
    planeHeightAtCenterMeters?: number;
    center?: { latitude?: number; longitude?: number };
  }>;
  // Google sorts solarPanels[] by yearlyEnergyDcKwh DESC. We slice top 200.
  // Optional: not all responses (or older fixture data) include it.
  solarPanels?: SolarPanel[];
}

interface LatLng {
  latitude: number;
  longitude: number;
}

interface BoundingBox {
  sw: LatLng;
  ne: LatLng;
}

interface BuildingInsights {
  name: string;
  imageryDate: { year: number; month: number; day: number };
  solarPotential: SolarPotential;
  // Optional because the cached fixtures predate the field — the LIVE Google
  // Solar API (`buildingInsights:findClosest`) always returns it. Used by the
  // Cesium client to build a ClippingPolygonCollection that isolates the
  // building from the surrounding mesh.
  // https://developers.google.com/maps/documentation/solar/reference/rest/v1/buildingInsights/findClosest#BuildingInsights
  boundingBox?: BoundingBox;
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
      planeHeightAtCenterMeters: s.planeHeightAtCenterMeters,
      center: s.center,
    }));

    // Prefer wholeRoofStats; fall back to a sum of segments when missing
    const wholeRoofArea = solarPotential?.wholeRoofStats?.areaMeters2;
    const totalAreaM2 =
      wholeRoofArea && wholeRoofArea > 0
        ? parseFloat(wholeRoofArea.toFixed(1))
        : parseFloat(segments.reduce((acc, s) => acc + s.areaMeters2, 0).toFixed(1));

    // Pass `boundingBox` straight through (sw/ne latLng pair). The Cesium
    // client uses it to build a ClippingPolygonCollection so the photoreal
    // tileset only renders this one building. Undefined when the fixture
    // path is hit — the client falls back to "no clipping, render everything".
    const boundingBox = (bi as BuildingInsights | null)?.boundingBox;

    // Google's per-panel placement (lat/lng + orientation + segmentIndex +
    // yearly DC kWh). Already sorted by yieldDescending. We slice the top 200
    // for client-side rendering on the Cesium photoreal mesh. Defensive: if
    // the field is missing (cached fixture, older response shape) we just
    // omit `solarPanels` from the response — the caller handles absence.
    const rawSolarPanels = solarPotential?.solarPanels;
    const solarPanels = Array.isArray(rawSolarPanels)
      ? rawSolarPanels
          .slice(0, 200)
          .map((p) => {
            const segIdx = p.segmentIndex ?? 0;
            const seg = roofSegmentStats[segIdx];
            return {
              center: {
                latitude: p.center?.latitude ?? 0,
                longitude: p.center?.longitude ?? 0,
              },
              orientation: (p.orientation ?? "LANDSCAPE") as "LANDSCAPE" | "PORTRAIT",
              segmentIndex: segIdx,
              yearlyEnergyDcKwh: p.yearlyEnergyDcKwh ?? 0,
              // Per-panel WGS84 height + segment azimuth + pitch + center lat/lng
              // so the Cesium overlay can project each panel corner onto the
              // segment's analytic roof plane (panels tilt with the slope
              // instead of rendering flat at the segment center height).
              segmentHeightMeters: seg?.planeHeightAtCenterMeters,
              segmentAzimuthDegrees: seg?.azimuthDegrees,
              segmentPitchDegrees: seg?.pitchDegrees,
              segmentCenterLat: seg?.center?.latitude,
              segmentCenterLng: seg?.center?.longitude,
            };
          })
          .filter(
            (p) =>
              Number.isFinite(p.center.latitude) &&
              Number.isFinite(p.center.longitude) &&
              p.center.latitude !== 0 &&
              p.center.longitude !== 0,
          )
      : undefined;

    return NextResponse.json({
      segments,
      totalAreaM2,
      imageryDate: bi?.imageryDate,
      boundingBox,
      ...(solarPanels && solarPanels.length > 0 ? { solarPanels } : {}),
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
