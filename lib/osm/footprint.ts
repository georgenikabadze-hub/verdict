/**
 * OSM Overpass building-footprint client (server-side only).
 *
 * Selects one building polygon for a given (lat, lng) using the scoring
 * heuristic landed by the Codex brainstorm — robust to ±15 m geocode jitter
 * which is typical for Google Places' rooftop/entrance points in dense
 * German suburbs:
 *
 *   score = +100 if polygon contains the geocoded point
 *         + (35 − distance-to-polygon-edge clamped 0..35)
 *         + (area / 20  clamped 0..20)
 *         + 10 if tags say "house / residential / detached / ..."
 *         − 35 if the polygon is < 35 m² (almost certainly a shed/garage)
 *         − 50 if tags say "garage / shed / carport / hut"
 *
 * The crucial detail (Codex's "biggest gotcha"): distance must be measured
 * to the polygon BOUNDARY, not its centroid. Long terrace houses have far-
 * off centroids and would otherwise lose to tiny neighbouring garages.
 *
 * Why OSM, not Solar API `boundingBox`: Solar's `findClosest` returns the
 * AABB of whichever building is closest to the query point. In dense Berlin
 * parcels that flips to the neighbour's bbox, which the Cesium clip then
 * renders instead of the user's house.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const TIMEOUT_MS = 8_000;

export interface LatLng {
  lat: number;
  lng: number;
}

export type FootprintSource = "contains" | "scored" | "fallback";

export interface BuildingFootprint {
  /** Outer ring, open (no repeated last-vertex). 3+ vertices. */
  polygon: LatLng[];
  centroid: LatLng;
  areaM2: number;
  /** Approx axis-aligned bbox dimensions in metres (not OBB). */
  lengthM: number;
  widthM: number;
  source: FootprintSource;
  /**
   * `high` when the winning candidate clearly beats the rest — the geocode
   * is inside it OR it scores at least 15 points above the runner-up. `low`
   * when the call is close, meaning the homeowner could plausibly live in
   * one of two adjacent footprints. The Cesium client uses this to widen
   * the clip buffer so a slightly-off pick doesn't cut their actual house.
   */
  confidence: "high" | "low";
  tags?: Record<string, string>;
}

interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}
interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
type OsmElement = OsmNode | OsmWay;
interface OverpassResponse {
  elements: OsmElement[];
}

// Search radius bumped from 30 m → 45 m on Codex's recommendation. With ±15 m
// geocode error the geocoded point can land 30+ m from the actual building
// in long terrace parcels — a 30 m search radius then misses the right house.
const SEARCH_RADIUS_M = 45;

function buildQuery(lat: number, lng: number, radius: number): string {
  return `[out:json][timeout:10];
(
  way["building"](around:${radius},${lat},${lng});
);
out body;
>;
out skel qt;`;
}

function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng;
    const yi = poly[i].lat;
    const xj = poly[j].lng;
    const yj = poly[j].lat;
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonAreaM2(poly: LatLng[]): number {
  if (poly.length < 3) return 0;
  const meanLat = poly.reduce((a, p) => a + p.lat, 0) / poly.length;
  const cos = Math.cos((meanLat * Math.PI) / 180);
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng * cos * 111_320;
    const yi = poly[i].lat * 111_320;
    const xj = poly[j].lng * cos * 111_320;
    const yj = poly[j].lat * 111_320;
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}

function polygonCentroid(poly: LatLng[]): LatLng {
  return {
    lat: poly.reduce((a, p) => a + p.lat, 0) / poly.length,
    lng: poly.reduce((a, p) => a + p.lng, 0) / poly.length,
  };
}

function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng =
    (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Shortest distance from a point to the boundary of a polygon, in metres.
 * Returns 0 if the point is strictly inside.
 *
 * Codex flagged centroid-distance as the single biggest gotcha: a 30 m long
 * terrace house has its centroid 15+ m from the user's actual front door,
 * and a tiny garage with a closer centroid wins incorrectly. Boundary
 * distance fixes that: the user's geocode lands a metre or two outside the
 * actual house, while the garage scored on centroid would still be 8+ m
 * away from its own boundary.
 */
function distanceToPolygonM(pt: LatLng, poly: LatLng[]): number {
  if (pt.lat === undefined || poly.length < 3) return Infinity;
  if (pointInPolygon(pt, poly)) return 0;
  const cosLat = Math.cos((pt.lat * Math.PI) / 180);
  const px = pt.lng * 111_320 * cosLat;
  const py = pt.lat * 111_320;
  let min = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j].lng * 111_320 * cosLat;
    const ay = poly[j].lat * 111_320;
    const bx = poly[i].lng * 111_320 * cosLat;
    const by = poly[i].lat * 111_320;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < min) min = d;
  }
  return min;
}

// OSM `building=*` values that almost always denote a real residential
// structure. Anything else (commercial, industrial, religious...) is fine
// too — these just get the +10 bonus that helps tiebreak in mixed-use
// blocks.
const RESIDENTIAL_BUILDING_TAGS = new Set([
  "yes",
  "house",
  "detached",
  "semidetached_house",
  "semidetached",
  "terrace",
  "residential",
  "apartments",
  "bungalow",
]);

// `building=*` values that should *never* win the score. These are real
// outbuildings, not the user's home, and Solar API will refuse them.
const OUTBUILDING_TAGS = new Set([
  "garage",
  "garages",
  "shed",
  "carport",
  "hut",
  "roof",
]);

function tagBuilding(tags?: Record<string, string>): string | undefined {
  return tags?.building?.toLowerCase();
}

function isLikelyHouse(tags?: Record<string, string>): boolean {
  const b = tagBuilding(tags);
  return b !== undefined && RESIDENTIAL_BUILDING_TAGS.has(b);
}

function isOutbuilding(tags?: Record<string, string>): boolean {
  const b = tagBuilding(tags);
  return b !== undefined && OUTBUILDING_TAGS.has(b);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function scoreCandidate(c: Candidate, query: LatLng): number {
  const contains = pointInPolygon(query, c.polygon);
  const distanceM = contains ? 0 : distanceToPolygonM(query, c.polygon);
  // Tag-richness gate on the contains-bonus. A geocoded "house number 12"
  // can land INSIDE multiple stacked Berlin Altbau buildings (Vorderhaus on
  // the street + Hinterhaus in the courtyard sharing the same parcel). The
  // Vorderhaus carries `building=*` tags; the Hinterhaus is often tagless.
  // Giving every contains-true polygon a flat +100 lets the tagless
  // Hinterhaus beat the actual addressed Vorderhaus, which then breaks the
  // Cesium clip + makes Solar API panels float over the wrong building.
  // Demoting tagless contains-true polygons to +40 still preserves the
  // contains signal (they beat far-away buildings) but lets a tagged sibling
  // win on tie.
  const containsBonus = contains ? (tagBuilding(c.tags) ? 100 : 40) : 0;
  return (
    containsBonus +
    clamp(35 - distanceM, 0, 35) +
    clamp(c.areaM2 / 20, 0, 20) +
    (isLikelyHouse(c.tags) ? 10 : 0) -
    (c.areaM2 < 35 ? 35 : 0) -
    (isOutbuilding(c.tags) ? 50 : 0)
  );
}

function bboxDimsM(poly: LatLng[]): { lengthM: number; widthM: number } {
  let minLat = +Infinity,
    maxLat = -Infinity,
    minLng = +Infinity,
    maxLng = -Infinity;
  for (const p of poly) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const meanLat = (minLat + maxLat) / 2;
  const heightM = (maxLat - minLat) * 111_320;
  const widthM = (maxLng - minLng) * 111_320 * Math.cos((meanLat * Math.PI) / 180);
  return {
    lengthM: Math.max(heightM, widthM),
    widthM: Math.min(heightM, widthM),
  };
}

interface Candidate {
  polygon: LatLng[];
  centroid: LatLng;
  areaM2: number;
  tags?: Record<string, string>;
}

function buildCandidates(elements: OsmElement[]): Candidate[] {
  const nodes = new Map<number, OsmNode>();
  const ways: OsmWay[] = [];
  for (const el of elements) {
    if (el.type === "node") nodes.set(el.id, el);
    else if (el.type === "way") ways.push(el);
  }

  const candidates: Candidate[] = [];
  for (const way of ways) {
    const poly: LatLng[] = [];
    let aborted = false;
    for (const id of way.nodes) {
      const n = nodes.get(id);
      if (!n) {
        aborted = true;
        break;
      }
      poly.push({ lat: n.lat, lng: n.lon });
    }
    if (aborted || poly.length < 3) continue;

    // OSM closes ways by repeating the first node — strip the trailing copy
    // so the polygon is "open" and downstream consumers (Cesium clipping,
    // shoelace area) don't double-count the seam edge.
    const first = poly[0];
    const last = poly[poly.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) poly.pop();
    if (poly.length < 3) continue;

    candidates.push({
      polygon: poly,
      centroid: polygonCentroid(poly),
      areaM2: polygonAreaM2(poly),
      tags: way.tags,
    });
  }
  return candidates;
}

function pickBest(
  query: LatLng,
  candidates: Candidate[],
): { c: Candidate; source: FootprintSource; confidence: "high" | "low" } | null {
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((c) => ({ c, score: scoreCandidate(c, query) }))
    .sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const runnerUp = scored[1];
  const containsWinner = pointInPolygon(query, winner.c.polygon);

  // Confidence is "high" when the geocode falls inside the chosen polygon OR
  // when it beats the runner-up by ≥15 points. Anything closer than that and
  // the homeowner could plausibly live in either building — Cesium will use
  // a wider clip buffer so we don't accidentally cut their real house.
  const margin = runnerUp ? winner.score - runnerUp.score : 100;
  const confidence: "high" | "low" =
    containsWinner || margin >= 15 ? "high" : "low";
  const source: FootprintSource = containsWinner ? "contains" : "scored";

  return { c: winner.c, source, confidence };
}

/**
 * Fetch the building footprint at `lat,lng`. Returns null on Overpass
 * timeout / no buildings nearby — caller should fall back to Solar bbox.
 */
export async function getBuildingFootprint(
  lat: number,
  lng: number,
  radius: number = SEARCH_RADIUS_M,
): Promise<BuildingFootprint | null> {
  const query = buildQuery(lat, lng, radius);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  // Overpass servers reject default Node fetch (no User-Agent and a body MIME
  // they don't accept) with HTTP 406. We send the query as URL-encoded form
  // data + a real UA string identifying the project, which is what the public
  // instance expects.
  let res: Response;
  try {
    res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "verdict-hackathon/1.0 (https://github.com/georgenikabadze-hub/verdict)",
        Accept: "application/json",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // eslint-disable-next-line no-console
    console.warn(`[footprint] fetch threw for ${lat},${lng}:`, err);
    return null;
  }
  clearTimeout(timer);
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[footprint] overpass HTTP ${res.status} for ${lat},${lng}`);
    return null;
  }

  let data: OverpassResponse;
  try {
    data = (await res.json()) as OverpassResponse;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[footprint] overpass parse failed for ${lat},${lng}:`, err);
    return null;
  }

  const candidates = buildCandidates(data.elements);
  const best = pickBest({ lat, lng }, candidates);
  if (!best) return null;

  const { lengthM, widthM } = bboxDimsM(best.c.polygon);
  return {
    polygon: best.c.polygon,
    centroid: best.c.centroid,
    areaM2: best.c.areaM2,
    lengthM,
    widthM,
    source: best.source,
    confidence: best.confidence,
    tags: best.c.tags,
  };
}
