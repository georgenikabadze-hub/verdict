/**
 * Tiny in-memory lead store for the demo loop.
 *
 * Real production would use Vercel KV / Postgres. For the hackathon demo,
 * the homeowner and installer touchpoints can run in two browser tabs against
 * the same Next.js dev server, so a process-local Map is enough. State
 * survives within one Node.js process (i.e. Vercel deployment).
 *
 * NOTE: Vercel serverless functions can run on different instances — the
 * polling loop assumes "warm" instances. For the demo path, this works.
 * If we need cross-instance sync, swap to Vercel KV via @vercel/kv.
 */

export type LeadStatus = "new" | "approved";

export interface LeadRecord {
  id: string;
  createdAt: string;
  status: LeadStatus;
  customerName: string;
  city: string;
  totalEur: number;
  monthlySavingsEur: number;
  paybackYears: number;
  installerName?: string;
  installerLogoEmoji?: string;
  approvedAt?: string;
  /** Surface the BoM lines that were approved so the homeowner sees them */
  finalBom?: { label: string; value: string }[];
}

// Module-level map. Survives across requests on a warm instance.
const STORE: Map<string, LeadRecord> = (
  globalThis as unknown as { __VERDICT_LEAD_STORE__?: Map<string, LeadRecord> }
).__VERDICT_LEAD_STORE__ ??
  ((globalThis as unknown as { __VERDICT_LEAD_STORE__: Map<string, LeadRecord> }).__VERDICT_LEAD_STORE__ = new Map());

// Seed one demo lead so opening /installer in a fresh process shows something.
const DEMO_LEAD_ID = "demo-conrad";
if (!STORE.has(DEMO_LEAD_ID)) {
  STORE.set(DEMO_LEAD_ID, {
    id: DEMO_LEAD_ID,
    createdAt: new Date().toISOString(),
    status: "new",
    customerName: "Conrad Smith",
    city: "Hamburg",
    totalEur: 22100,
    monthlySavingsEur: 142,
    paybackYears: 8.8,
  });
}

export function listLeads(): LeadRecord[] {
  return [...STORE.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function getLead(id: string): LeadRecord | undefined {
  return STORE.get(id);
}

export function createLead(lead: LeadRecord): LeadRecord {
  STORE.set(lead.id, lead);
  return lead;
}

export function approveLead(
  id: string,
  patch: { installerName: string; installerLogoEmoji?: string; finalBom?: LeadRecord["finalBom"] },
): LeadRecord | null {
  const existing = STORE.get(id);
  if (!existing) return null;
  const updated: LeadRecord = {
    ...existing,
    ...patch,
    status: "approved",
    approvedAt: new Date().toISOString(),
  };
  STORE.set(id, updated);
  return updated;
}
