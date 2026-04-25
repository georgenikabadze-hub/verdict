import Link from "next/link";
import { sizeQuote } from "@/lib/sizing/calculate";
import { VariantCardStack } from "@/components/homeowner/VariantCardStack";
import { SendToInstaller } from "@/components/homeowner/SendToInstaller";
import type { Intake, RoofSegment } from "@/lib/contracts";

export const dynamic = "force-dynamic";

interface SearchParams {
  address?: string;
  bill?: string;
  ev?: string;
  heating?: string;
  goal?: string;
}

interface GeocodeOk {
  lat: number;
  lng: number;
  formattedAddress: string;
}

async function geocode(address: string, key: string): Promise<GeocodeOk | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:DE&key=${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const top = data.results?.[0];
    if (!top) return null;
    return {
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
      formattedAddress: top.formatted_address,
    };
  } catch {
    return null;
  }
}

async function getRoofSegments(lat: number, lng: number, key: string): Promise<RoofSegment[]> {
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const segs = data?.solarPotential?.roofSegmentStats ?? [];
    return segs.map((s: {
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

export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!params.address || !key) {
    return (
      <main className="min-h-dvh bg-[#0A0E1A] text-[#F7F8FA] flex flex-col items-center justify-center px-6 py-12">
        <h1 className="text-2xl font-semibold mb-2">Missing address</h1>
        <p className="text-[#9BA3AF] text-sm mb-6">Go back and enter your home address.</p>
        <Link href="/" className="rounded-lg bg-[#3DAEFF] px-4 py-2 text-sm font-semibold text-[#0A0E1A]">
          ← Back
        </Link>
      </main>
    );
  }

  const geo = await geocode(params.address, key);
  const fallbackSegment: RoofSegment = {
    pitchDegrees: 35,
    azimuthDegrees: 180,
    areaMeters2: 60,
    annualSunshineHours: 1100,
  };
  const segments = geo
    ? await getRoofSegments(geo.lat, geo.lng, key)
    : [fallbackSegment];

  const intake: Intake = {
    address: geo?.formattedAddress ?? params.address,
    lat: geo?.lat ?? 0,
    lng: geo?.lng ?? 0,
    monthlyBillEur: Number(params.bill ?? "120"),
    ev: params.ev === "true",
    heating: (params.heating ?? "gas") as Intake["heating"],
    goal: (params.goal ?? "lower_bill") as Intake["goal"],
  };

  const sizing = sizeQuote(intake, segments.length > 0 ? segments : [fallbackSegment]);

  const liveOrCached = segments.length > 0 ? "live" : "cached";

  return (
    <main className="relative min-h-dvh bg-[#0A0E1A] text-[#F7F8FA] flex flex-col">
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10 z-30">
        <Link href="/" className="text-base font-semibold tracking-tight">Verdict</Link>
        <Link href="/" className="text-sm text-[#9BA3AF] hover:text-[#F7F8FA]">← New quote</Link>
      </nav>

      <section className="flex-1 max-w-3xl w-full mx-auto px-6 sm:px-8 py-6 lg:py-12 flex flex-col gap-8">
        {/* Address + intake summary */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 rounded border border-[#62E6A7]/40 bg-[#0A0E1A] px-2 py-0.5 text-[#62E6A7]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#62E6A7]" />
              {liveOrCached === "live" ? "Measured live" : "Estimated"}
            </span>
            <span className="text-[#5B6470]">·</span>
            <span className="text-[#9BA3AF] truncate">{intake.address}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">
            Three Reonic-grounded options for your home.
          </h1>
          <p className="text-sm text-[#9BA3AF]">
            {sizing.systemKwp} kWp system &middot; {sizing.annualKwh.toLocaleString()} kWh/yr demand &middot; {segments.length} roof face{segments.length !== 1 ? "s" : ""} measured
          </p>
        </header>

        {/* The three variants */}
        <VariantCardStack variants={sizing.variants} />

        {/* Send to installer */}
        <SendToInstaller leadId={`q-${Date.now().toString(36)}`} />

        {/* Trust line */}
        <p className="text-[11px] text-[#5B6470] text-center">
          Recommendations cite real Reonic projects from your region. No purchase made — installer reviews and confirms.
        </p>
      </section>
    </main>
  );
}
