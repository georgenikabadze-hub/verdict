/**
 * Tiny in-memory lead store for the demo loop.
 *
 * Real production would use Vercel KV / Postgres. For the hackathon demo,
 * the homeowner and installer touchpoints can run in two browser tabs against
 * the same Next.js dev server, so a process-local Map is enough.
 */

import type { BoM, Goal, Heating, SizingResult, Variant } from "@/lib/contracts";
import { sizeQuote } from "@/lib/sizing/calculate";
import { deterministicBlur } from "@/lib/leads/blur";

export type LeadStatus = "new" | "accepted" | "offer_sent" | "closed";

export type LeadPublicPreview = {
  district: string;
  blurredLat: number;
  blurredLng: number;
  blurRadiusMeters: number;
  roofFacts: {
    totalAreaM2?: number;
    pitchDeg?: number;
    azimuth?: number;
    segmentsCount?: number;
  };
  sizing: SizingResult;
  bomVariants: Variant[];
  preferences: {
    goal: "lower_bill" | "independent";
    heating: string;
    ev: boolean;
    monthlyBillEur: number;
  };
};

export type LeadPrivateDetails = {
  address: string;
  lat: number;
  lng: number;
  customerName?: string;
  email?: string;
  phone?: string;
  unlockedAt?: string;
};

export type LeadOffer = {
  sentAt: string;
  bom: BoM;
  totalEur: number;
  installerNotes?: string;
};

export interface LeadRecord {
  id: string;
  createdAt: string;
  status: LeadStatus;
  publicPreview: LeadPublicPreview;
  privateDetails: LeadPrivateDetails;
  acceptedByInstallerId?: string;
  acceptedAt?: string;
  offer?: LeadOffer;

  /** Legacy homeowner-toast projection. Keep until Sprint 4 replaces polling. */
  customerName?: string;
  city?: string;
  totalEur: number;
  monthlySavingsEur: number;
  paybackYears: number;
  installerName?: string;
  installerLogoEmoji?: string;
  approvedAt?: string;
  finalBom?: { label: string; value: string }[];
}

export type CreateLeadInput = {
  id: string;
  createdAt?: string;
  status?: LeadStatus;
  address: string;
  lat: number;
  lng: number;
  district?: string;
  customerName?: string;
  email?: string;
  phone?: string;
  monthlyBillEur: number;
  ev: boolean;
  heating: Heating;
  goal: Goal | "lower_bill" | "independent";
  roofSegments?: SizingResult["roofSegments"];
  acceptedByInstallerId?: string;
  acceptedAt?: string;
  offer?: LeadOffer;
};

type StoreGlobal = {
  __VERDICT_LEAD_STORE__?: Map<string, LeadRecord>;
};

const STORE: Map<string, LeadRecord> = (globalThis as StoreGlobal).__VERDICT_LEAD_STORE__ ??
  ((globalThis as StoreGlobal).__VERDICT_LEAD_STORE__ = new Map());

function normalizeGoal(goal: CreateLeadInput["goal"]): Goal {
  if (goal === "lower_bill") return "lower_bill";
  if (goal === "independent") return "independence";
  return goal;
}

function previewGoal(goal: CreateLeadInput["goal"]): LeadPublicPreview["preferences"]["goal"] {
  return normalizeGoal(goal) === "independence" ? "independent" : "lower_bill";
}

function defaultSegments(): SizingResult["roofSegments"] {
  return [
    {
      pitchDegrees: 34,
      azimuthDegrees: 178,
      areaMeters2: 42,
      annualSunshineHours: 1050,
    },
    {
      pitchDegrees: 34,
      azimuthDegrees: 358,
      areaMeters2: 28,
      annualSunshineHours: 760,
    },
  ];
}

function roofFactsFromSizing(sizing: SizingResult): LeadPublicPreview["roofFacts"] {
  const first = sizing.roofSegments[0];
  return {
    totalAreaM2: sizing.usableRoofAreaM2,
    pitchDeg: first?.pitchDegrees,
    azimuth: first?.azimuthDegrees,
    segmentsCount: sizing.roofSegments.length,
  };
}

function bomLinesFromBom(bom: BoM): LeadRecord["finalBom"] {
  const lines: NonNullable<LeadRecord["finalBom"]> = [
    {
      label: "Panels",
      value: `${bom.panels.brand} ${bom.panels.model} x${bom.panels.count} · ${(
        (bom.panels.count * bom.panels.wp) /
        1000
      ).toFixed(1)} kWp`,
    },
    {
      label: "Inverter",
      value: `${bom.inverter.brand} ${bom.inverter.model} · ${bom.inverter.kw} kW`,
    },
  ];
  if (bom.battery) {
    lines.push({
      label: "Battery",
      value: `${bom.battery.brand} ${bom.battery.model} · ${bom.battery.kwh} kWh`,
    });
  }
  if (bom.wallbox) {
    lines.push({
      label: "Wallbox",
      value: `${bom.wallbox.brand} ${bom.wallbox.model} · ${bom.wallbox.kw} kW`,
    });
  }
  if (bom.heatPump) {
    lines.push({
      label: "Heat pump",
      value: `${bom.heatPump.brand} ${bom.heatPump.model} · ${bom.heatPump.kw} kW`,
    });
  }
  return lines;
}

export function buildLead(input: CreateLeadInput): LeadRecord {
  const sizing = sizeQuote(
    {
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      monthlyBillEur: input.monthlyBillEur,
      ev: input.ev,
      heating: input.heating,
      goal: normalizeGoal(input.goal),
    },
    input.roofSegments ?? defaultSegments(),
  );
  const recommended = sizing.variants[1];
  const blurred = deterministicBlur(input.id, input.lat, input.lng);
  const unlockedAt =
    input.status && input.status !== "new"
      ? input.acceptedAt ?? input.offer?.sentAt ?? new Date().toISOString()
      : undefined;

  return {
    id: input.id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    status: input.status ?? "new",
    publicPreview: {
      district: input.district ?? "PLZ 12043 · Berlin",
      blurredLat: blurred.lat,
      blurredLng: blurred.lng,
      blurRadiusMeters: 500,
      roofFacts: roofFactsFromSizing(sizing),
      sizing,
      bomVariants: [...sizing.variants],
      preferences: {
        goal: previewGoal(input.goal),
        heating: input.heating,
        ev: input.ev,
        monthlyBillEur: input.monthlyBillEur,
      },
    },
    privateDetails: {
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      customerName: input.customerName,
      email: input.email,
      phone: input.phone,
      unlockedAt,
    },
    acceptedByInstallerId: input.acceptedByInstallerId,
    acceptedAt: input.acceptedAt,
    offer: input.offer,
    customerName: input.customerName,
    city: "Berlin",
    totalEur: input.offer?.totalEur ?? recommended.bom.totalEur,
    monthlySavingsEur: recommended.monthlySavingsEur,
    paybackYears: recommended.paybackYears,
    installerName: input.status && input.status !== "new" ? "Berlin Solar Pro" : undefined,
    installerLogoEmoji: input.status && input.status !== "new" ? "☀" : undefined,
    approvedAt: input.offer?.sentAt,
    finalBom: input.offer ? bomLinesFromBom(input.offer.bom) : undefined,
  };
}

function seedLead(input: CreateLeadInput) {
  if (!STORE.has(input.id)) STORE.set(input.id, buildLead(input));
}

const now = Date.now();
seedLead({
  id: "demo-conrad",
  createdAt: new Date(now - 34 * 60 * 1000).toISOString(),
  status: "new",
  customerName: "Conrad Smith",
  email: "conrad.smith@example.com",
  phone: "+49 170 555 0141",
  address: "Donaustrasse 23, 12043 Berlin",
  district: "PLZ 12043 · Berlin · Neukölln",
  lat: 52.4859,
  lng: 13.4304,
  monthlyBillEur: 146,
  ev: true,
  heating: "gas",
  goal: "lower_bill",
});

seedLead({
  id: "demo-mitte",
  createdAt: new Date(now - 2.2 * 60 * 60 * 1000).toISOString(),
  status: "accepted",
  customerName: "Mina Keller",
  email: "mina.keller@example.com",
  phone: "+49 151 555 0188",
  address: "Chausseestrasse 55, 10115 Berlin",
  district: "PLZ 10115 · Berlin · Mitte",
  lat: 52.5358,
  lng: 13.3835,
  monthlyBillEur: 118,
  ev: false,
  heating: "district",
  goal: "independent",
  acceptedByInstallerId: "berlin-solar-pro",
  acceptedAt: new Date(now - 92 * 60 * 1000).toISOString(),
});

const seedOfferLead = buildLead({
  id: "demo-pankow",
  createdAt: new Date(now - 5.5 * 60 * 60 * 1000).toISOString(),
  status: "offer_sent",
  customerName: "Jonas Weber",
  email: "jonas.weber@example.com",
  phone: "+49 160 555 0162",
  address: "Dunckerstrasse 18, 10437 Berlin",
  district: "PLZ 10437 · Berlin · Pankow",
  lat: 52.543,
  lng: 13.4184,
  monthlyBillEur: 168,
  ev: true,
  heating: "heat_pump",
  goal: "independent",
  acceptedByInstallerId: "berlin-solar-pro",
  acceptedAt: new Date(now - 4.6 * 60 * 60 * 1000).toISOString(),
});
seedOfferLead.offer = {
  sentAt: new Date(now - 3.8 * 60 * 60 * 1000).toISOString(),
  bom: seedOfferLead.publicPreview.bomVariants[1].bom,
  totalEur: seedOfferLead.publicPreview.bomVariants[1].bom.totalEur,
  installerNotes: "Includes wallbox pre-wiring and final shade check.",
};
seedOfferLead.approvedAt = seedOfferLead.offer.sentAt;
seedOfferLead.finalBom = bomLinesFromBom(seedOfferLead.offer.bom);
if (!STORE.has(seedOfferLead.id)) STORE.set(seedOfferLead.id, seedOfferLead);

export function listLeads(): LeadRecord[] {
  return [...STORE.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function getLead(id: string): LeadRecord | undefined {
  return STORE.get(id);
}

export function createLead(input: CreateLeadInput | LeadRecord): LeadRecord {
  const lead = "publicPreview" in input ? input : buildLead(input);
  STORE.set(lead.id, lead);
  return lead;
}

export function acceptLead(
  id: string,
  patch: { acceptedByInstallerId?: string; installerName?: string; installerLogoEmoji?: string } = {},
): LeadRecord | null {
  const existing = STORE.get(id);
  if (!existing) return null;
  const acceptedAt = new Date().toISOString();
  const updated: LeadRecord = {
    ...existing,
    status: "accepted",
    acceptedByInstallerId: patch.acceptedByInstallerId ?? "berlin-solar-pro",
    acceptedAt,
    privateDetails: {
      ...existing.privateDetails,
      unlockedAt: acceptedAt,
    },
    installerName: patch.installerName ?? "Berlin Solar Pro",
    installerLogoEmoji: patch.installerLogoEmoji ?? "☀",
  };
  STORE.set(id, updated);
  return updated;
}

export function sendOffer(
  id: string,
  patch: { bom: BoM; totalEur?: number; installerNotes?: string },
): LeadRecord | null {
  const existing = STORE.get(id);
  if (!existing) return null;
  const sentAt = new Date().toISOString();
  const unlockedAt = existing.privateDetails.unlockedAt ?? sentAt;
  const totalEur = patch.totalEur ?? patch.bom.totalEur;
  const updated: LeadRecord = {
    ...existing,
    status: "offer_sent",
    acceptedByInstallerId: existing.acceptedByInstallerId ?? "berlin-solar-pro",
    acceptedAt: existing.acceptedAt ?? sentAt,
    privateDetails: {
      ...existing.privateDetails,
      unlockedAt,
    },
    offer: {
      sentAt,
      bom: patch.bom,
      totalEur,
      installerNotes: patch.installerNotes,
    },
    totalEur,
    installerName: existing.installerName ?? "Berlin Solar Pro",
    installerLogoEmoji: existing.installerLogoEmoji ?? "☀",
    approvedAt: sentAt,
    finalBom: bomLinesFromBom(patch.bom),
  };
  STORE.set(id, updated);
  return updated;
}

export function approveLead(
  id: string,
  patch: {
    installerName: string;
    installerLogoEmoji?: string;
    finalBom?: LeadRecord["finalBom"];
  },
): LeadRecord | null {
  const existing = STORE.get(id);
  if (!existing) return null;
  const fallbackBom = existing.publicPreview.bomVariants[1].bom;
  const updated = sendOffer(id, {
    bom: fallbackBom,
    totalEur: fallbackBom.totalEur,
  });
  if (!updated) return null;
  const withInstaller: LeadRecord = {
    ...updated,
    installerName: patch.installerName,
    installerLogoEmoji: patch.installerLogoEmoji ?? "☀",
    finalBom: patch.finalBom ?? updated.finalBom,
  };
  STORE.set(id, withInstaller);
  return withInstaller;
}
