import { contours } from "d3-contour";
import type { MapAccount } from "./gisShared";

/**
 * Rough purok (cluster) outlines from where the accounts' meters are pinned.
 *
 * Nobody publishes purok boundaries (NAMRIA and PSA stop at the barangay), so
 * this draws a first guess from the office's own data, for staff to correct.
 *
 * How: every pinned meter claims the ground around it — a soft circle about
 * `reachM` across that fades out — and a purok's claim on a spot is the sum
 * of its meters' claims. Each spot goes to the purok with the strongest claim,
 * as long as that claim is strong enough to be "near houses" at all. So:
 *  - neighbouring puroks meet along one shared edge instead of overlapping;
 *  - the outline follows how the houses actually lie (along a road, round a
 *    hill), not a straight-sided hull around them;
 *  - a lone meter pinned far from the rest of its purok makes a small island,
 *    and islands with fewer than MIN_PINS meters are dropped as likely
 *    mis-pins.
 * The claims are summed on a grid of small cells per barangay (a purok never
 * crosses one) and the edges traced with d3-contour, then thinned out.
 */

export type PurokOutline = {
  key: string;
  clusterId: number;
  cluster: string;
  barangayId: number;
  barangay: string;
  color: string;
  /** Outer rings, [lng, lat], closed. One per piece kept. */
  rings: [number, number][][];
  pins: number;
  /** Pins left out because they were in a dropped island. */
  stray: number;
};

export type OutlineResult = {
  outlines: PurokOutline[];
  /** Puroks with too few pinned meters to outline. */
  tooFew: { cluster: string; barangay: string; pins: number }[];
  /** Pinned accounts that have no cluster (so belong to no purok). */
  noCluster: number;
};

const MIN_PINS = 3;
const MAX_CELLS = 450; // per side of a barangay's grid
const MAX_REACH_M = 400;
const PALETTE = [
  "#e6550d", "#3182bd", "#31a354", "#756bb1", "#d6616b", "#8c6d31",
  "#17becf", "#e377c2", "#637939", "#bd9e39", "#843c39", "#393b79",
];

export function purokOutlines(accounts: MapAccount[], reachM = 60, barangayId = 0): OutlineResult {
  const pinned = accounts.filter(
    (a) => a.lat != null && a.lng != null && (!barangayId || a.barangayId === barangayId),
  );
  const noCluster = pinned.filter((a) => !a.clusterId).length;

  const byBarangay = new Map<number, MapAccount[]>();
  for (const a of pinned) {
    if (!a.clusterId) continue;
    const list = byBarangay.get(a.barangayId) ?? [];
    list.push(a);
    byBarangay.set(a.barangayId, list);
  }

  const outlines: PurokOutline[] = [];
  const tooFew: OutlineResult["tooFew"] = [];
  let colorAt = 0;

  for (const list of byBarangay.values()) {
    const byCluster = new Map<number, MapAccount[]>();
    for (const a of list) {
      const c = byCluster.get(a.clusterId) ?? [];
      c.push(a);
      byCluster.set(a.clusterId, c);
    }
    const clusters = [...byCluster.entries()].filter(([, c]) => {
      if (c.length >= MIN_PINS) return true;
      tooFew.push({ cluster: c[0]!.cluster, barangay: c[0]!.barangay, pins: c.length });
      return false;
    });
    if (!clusters.length) continue;

    // The grid: the barangay's pins plus room for the outline around them.
    const lats = list.map((a) => a.lat!);
    const lngs = list.map((a) => a.lng!);
    const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
    const mLat = 111_320;
    const mLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);

    // Each purok's own reach: at least `reachM`, more where its houses stand
    // further apart — a rural purok with a house every 150 m would otherwise
    // break into a string of islands. Taken from how far each meter is from
    // its nearest neighbour in the same purok (the 80th percentile, so a few
    // far-flung pins don't stretch everything).
    // Distinct spots only: several accounts are often pinned at one place (a
    // shared stand pipe, a compound), which would read as 0 m apart.
    const reachOf = clusters.map(([, members]) => {
      const spots = new Map<string, [number, number]>();
      for (const a of members) {
        const x = (a.lng! * mLng) / 10, y = (a.lat! * mLat) / 10; // 10 m buckets
        spots.set(`${Math.round(x)}|${Math.round(y)}`, [a.lng! * mLng, a.lat! * mLat]);
      }
      const pts = [...spots.values()];
      const nn = pts.map((p, i) => {
        let best = Infinity;
        pts.forEach((q, j) => {
          if (i !== j) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
        });
        return best;
      }).filter(Number.isFinite).sort((x, y) => x - y);
      const p80 = nn[Math.floor(nn.length * 0.8)] ?? reachM;
      return Math.min(MAX_REACH_M, Math.max(reachM, 1.6 * p80));
    });
    const sigmas = reachOf.map((r) => r / 2);
    const pad = Math.max(...reachOf) * 1.5;
    const west = Math.min(...lngs) - pad / mLng;
    const north = Math.max(...lats) + pad / mLat;
    const spanX = (Math.max(...lngs) - Math.min(...lngs)) * mLng + 2 * pad;
    const spanY = (Math.max(...lats) - Math.min(...lats)) * mLat + 2 * pad;
    const cellM = Math.max(reachM / 4, spanX / MAX_CELLS, spanY / MAX_CELLS);
    const w = Math.ceil(spanX / cellM);
    const h = Math.ceil(spanY / cellM);

    // Each purok's claim on every cell.
    const claims = clusters.map(([, members], ci) => {
      const sigma = sigmas[ci]!;
      const reach = Math.ceil((3 * sigma) / cellM);
      const d = new Float32Array(w * h);
      for (const a of members) {
        const cx = ((a.lng! - west) * mLng) / cellM;
        const cy = ((north - a.lat!) * mLat) / cellM;
        const x0 = Math.max(0, Math.floor(cx) - reach), x1 = Math.min(w - 1, Math.floor(cx) + reach);
        const y0 = Math.max(0, Math.floor(cy) - reach), y1 = Math.min(h - 1, Math.floor(cy) + reach);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const dx = (x + 0.5 - cx) * cellM;
            const dy = (y + 0.5 - cy) * cellM;
            const r2 = dx * dx + dy * dy;
            if (r2 <= 9 * sigma * sigma) d[y * w + x] += Math.exp(-r2 / (2 * sigma * sigma));
          }
        }
      }
      return d;
    });

    // The strongest and second-strongest claim on each cell.
    const best = new Float32Array(w * h);
    const second = new Float32Array(w * h);
    for (const d of claims) {
      for (let i = 0; i < d.length; i++) {
        const v = d[i]!;
        if (v > best[i]!) {
          second[i] = best[i]!;
          best[i] = v;
        } else if (v > second[i]!) second[i] = v;
      }
    }

    // A lone meter's claim fades to this at its purok's reach from it — the
    // edge (the same number for every purok, as sigma is always reach / 2).
    const edge = Math.exp(-2);
    const trace = contours().size([w, h]).thresholds([0]);
    const toLngLat = ([x, y]: number[]): [number, number] => [west + (x! * cellM) / mLng, north - (y! * cellM) / mLat];

    clusters.forEach(([clusterId, members], ci) => {
      const d = claims[ci]!;
      // Positive where this purok both reaches and out-claims every other.
      const field = new Float64Array(w * h);
      for (let i = 0; i < field.length; i++) {
        const other = d[i] === best[i] ? second[i]! : best[i]!;
        field[i] = Math.min(d[i]! - edge, d[i]! - other);
      }
      const shape = trace(Array.from(field))[0];
      const pieces = (shape?.coordinates ?? []).map((poly) => {
        const ring = simplify(poly[0]!.map(toLngLat), cellM * 0.6, mLng, mLat);
        return { ring, pins: members.filter((a) => inRing(a.lng!, a.lat!, ring)).length };
      });
      const kept = pieces.filter((p) => p.pins >= MIN_PINS && p.ring.length >= 4);
      if (!kept.length) {
        tooFew.push({ cluster: members[0]!.cluster, barangay: members[0]!.barangay, pins: members.length });
        return;
      }
      const inKept = kept.reduce((s, p) => s + p.pins, 0);
      outlines.push({
        key: `${members[0]!.barangayId}|${clusterId}`,
        clusterId,
        cluster: members[0]!.cluster,
        barangayId: members[0]!.barangayId,
        barangay: members[0]!.barangay,
        color: PALETTE[colorAt++ % PALETTE.length]!,
        rings: kept.sort((a, b) => b.pins - a.pins).map((p) => p.ring),
        pins: inKept,
        stray: members.length - inKept,
      });
    });
  }

  outlines.sort((a, b) => a.barangay.localeCompare(b.barangay) || a.cluster.localeCompare(b.cluster, undefined, { numeric: true }));
  return { outlines, tooFew, noCluster };
}

function inRing(lng: number, lat: number, ring: [number, number][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Douglas–Peucker in metres, keeping the ring closed. */
function simplify(ring: [number, number][], tolM: number, mLng: number, mLat: number): [number, number][] {
  if (ring.length <= 4) return ring;
  const pts = ring.slice(0, -1);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = [pts[a]![0] * mLng, pts[a]![1] * mLat];
    const [bx, by] = [pts[b]![0] * mLng, pts[b]![1] * mLat];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1;
    let farD = tolM;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i]![0] * mLng, py = pts[i]![1] * mLat;
      const dist = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (dist > farD) {
        far = i;
        farD = dist;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  if (out.length < 3) return ring;
  out.push(out[0]!);
  return out;
}
