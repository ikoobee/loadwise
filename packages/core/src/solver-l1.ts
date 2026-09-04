import type {
  CargoItem,
  ContainerType,
  LoadPlan,
  Placement,
  SolveOptions,
  UnplacedGroup,
} from './types.js';

export const ENGINE_VERSION = '0.1.0';
export const SOLVER_ID = 'l1-ep-ffd';

const EPS = 1e-6;
/** Cap on the extreme-point candidate set to bound worst-case time. */
const MAX_POINTS = 4000;
const DEFAULT_SUPPORT_RATIO = 0.75;

/** Internal axis-aligned box (also the working shape for placements). */
interface Box {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

interface Unit extends CargoItem {
  skuIdx: number;
  seq: number;
}

interface PlacedBox extends Box {
  skuIdx: number;
  step: number;
  maxStackOn: number;
  stackUsed: number;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

/** Allowed orientations (fixed order — determinism anchor). */
function orientations(item: CargoItem): [number, number, number][] {
  const { l, w, h } = item.dim;
  if (item.rotation === 'fixed') return [[l, w, h]];
  if (item.rotation === 'upright') return [[l, w, h], [w, l, h]];
  return [
    [l, w, h], [w, l, h],
    [l, h, w], [h, l, w],
    [w, h, l], [h, w, l],
  ];
}

function overlaps(a: Box, b: Box, clear: number): boolean {
  return (
    a.x < b.x + b.dx + clear - EPS && a.x + a.dx + clear > b.x + EPS &&
    a.y < b.y + b.dy + clear - EPS && a.y + a.dy + clear > b.y + EPS &&
    a.z < b.z + b.dz + clear - EPS && a.z + a.dz + clear > b.z + EPS
  );
}

/**
 * Bottom-support feasibility, in two independent checks:
 * 1. Stack capacity — every box whose top face sits directly below the unit
 *    (top + clearance == unit bottom) and overlaps its footprint must have
 *    capacity left. This mirrors exactly how stackUsed is registered, so a
 *    candidate that grazes a full bearer's corner is rejected here even when
 *    no support sample lands on it.
 * 2. Support ratio — a 3×3 grid of bottom-face samples; at least `ratio` of
 *    them must rest on some box top (or the floor). Top-face matching includes
 *    the clearance gap (a candidate at `z = bearerTop + clearance` rests on
 *    that bearer).
 */
function supportOk(unit: Box, placed: PlacedBox[], clear: number, ratio: number): boolean {
  if (unit.z < EPS) return true; // on the floor
  for (const p of placed) {
    if (
      Math.abs(p.z + p.dz + clear - unit.z) < 1e-3 &&
      p.x < unit.x + unit.dx && p.x + p.dx > unit.x &&
      p.y < unit.y + unit.dy && p.y + p.dy > unit.y &&
      p.stackUsed >= p.maxStackOn
    ) {
      return false;
    }
  }
  let supported = 0;
  const SAMPLES = 3;
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      const px = unit.x + (unit.dx * (i + 0.5)) / SAMPLES;
      const py = unit.y + (unit.dy * (j + 0.5)) / SAMPLES;
      let supportedSample = false;
      for (const p of placed) {
        if (
          px > p.x + EPS && px < p.x + p.dx - EPS &&
          py > p.y + EPS && py < p.y + p.dy - EPS &&
          Math.abs(p.z + p.dz + clear - unit.z) < 1e-3
        ) {
          supportedSample = true;
          break;
        }
      }
      if (supportedSample) supported++;
    }
  }
  return supported / (SAMPLES * SAMPLES) >= ratio;
}

function dedupeAndCap(points: Point[], box: PlacedBox): Point[] {
  // Drop points strictly inside the new box (half-open intervals keep face points).
  const kept = points.filter(
    (p) =>
      !(p.x >= box.x - EPS && p.x < box.x + box.dx - EPS &&
        p.y >= box.y - EPS && p.y < box.y + box.dy - EPS &&
        p.z >= box.z - EPS && p.z < box.z + box.dz - EPS)
  );
  // Dedupe on a 0.1 mm grid, then cap the set (keep lowest/deepest/leftmost first).
  const seen = new Set<string>();
  const unique = kept.filter((p) => {
    const k = `${Math.round(p.x * 10)},${Math.round(p.y * 10)},${Math.round(p.z * 10)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length > MAX_POINTS) {
    unique.sort((p, q) => p.z - q.z || p.y - q.y || p.x - q.x || 0);
    unique.length = MAX_POINTS;
  }
  return unique;
}

function buildWarnings(plan: Omit<LoadPlan, 'warnings'>, cogY: number): string[] {
  const s = plan.stats;
  const warnings: string[] = [];
  const volPct = (s.volumeUtil * 100).toFixed(1);
  const wgtPct = (s.weightUtil * 100).toFixed(1);
  const unusedVolume = plan.container.innerDim.l * plan.container.innerDim.w *
    plan.container.innerDim.h * (1 - s.volumeUtil) / 1e6;

  if (s.weightUtil >= 0.9 && s.volumeUtil <= 0.6) {
    warnings.push(
      `Weight-limited load (weight ${wgtPct}%, volume ${volPct}%): ~${unusedVolume.toFixed(1)} m³ unused — mixing in light/bulky cargo could raise revenue per container.`
    );
  }
  if (s.volumeUtil >= 0.9 && s.weightUtil <= 0.6) {
    warnings.push(
      `Volume-limited load (volume ${volPct}%, weight ${wgtPct}%): ~${(s.maxWeight - s.weight) / 1000} t of payload unused.`
    );
  }
  if (Math.abs(cogY) > 15) {
    warnings.push(
      `Center of gravity is ${Math.abs(cogY).toFixed(0)}% ${cogY > 0 ? 'toward the door' : 'toward the rear'} — check road/axle regulations.`
    );
  }
  return warnings;
}

/**
 * L1 solver: Extreme-Point First-Fit Decreasing.
 *
 * Greedy and deterministic: units sorted by volume ↓ / weight ↓ / input order ↑,
 * placed at the lowest → deepest → leftmost extreme point that satisfies all
 * hard constraints. Sub-second for typical manifests (≤ 500 units).
 */
export function solveL1(
  container: ContainerType,
  items: CargoItem[],
  options: SolveOptions = {}
): LoadPlan {
  const clearance = options.clearance ?? 0;
  const supportRatio = options.supportRatio ?? DEFAULT_SUPPORT_RATIO;
  const W = container.innerDim.w;
  const L = container.innerDim.l;
  const H = container.innerDim.h;

  const units: Unit[] = [];
  let seq = 0;
  for (let skuIdx = 0; skuIdx < items.length; skuIdx++) {
    const it = items[skuIdx]!;
    const qty = Math.max(0, Math.floor(it.qty));
    for (let k = 0; k < qty; k++) units.push({ ...it, skuIdx, seq: seq++ });
  }
  units.sort(
    (a, b) =>
      b.dim.l * b.dim.w * b.dim.h - a.dim.l * a.dim.w * a.dim.h ||
      b.weight - a.weight ||
      a.seq - b.seq
  );

  const placed: PlacedBox[] = [];
  const unplacedUnits: Unit[] = [];
  let points: Point[] = [{ x: 0, y: 0, z: 0 }];
  let totalWeight = 0;
  let hitWeightLimit = false;

  for (const u of units) {
    let done = false;
    const sorted = [...points].sort((p, q) => p.z - q.z || p.y - q.y || p.x - q.x || 0);
    for (const pt of sorted) {
      for (const dims of orientations(u)) {
        const [dx, dy, dz] = dims;
        // x runs along width (cap W), y along depth (cap L), z along height (cap H).
        if (dx > W + EPS || dy > L + EPS || dz > H + EPS) continue;
        if (pt.x + dx > W + EPS || pt.y + dy > L + EPS || pt.z + dz > H + EPS) continue;
        if (totalWeight + u.weight > container.maxWeight + EPS) {
          hitWeightLimit = true;
          continue;
        }
        const cand: Box = { x: pt.x, y: pt.y, z: pt.z, dx, dy, dz };
        if (placed.some((p) => overlaps(cand, p, clearance))) continue;
        if (!supportOk(cand, placed, clearance, supportRatio)) continue;

        const rec: PlacedBox = { ...cand, skuIdx: u.skuIdx, step: placed.length + 1, maxStackOn: u.maxStackOn, stackUsed: 0 };
        placed.push(rec);
        totalWeight += u.weight;

        // Register stacking pressure on bearers directly below (top face + clearance == rec.z).
        for (const p of placed) {
          if (p === rec) continue;
          if (
            Math.abs(p.z + p.dz + clearance - rec.z) < 1e-3 &&
            p.x < rec.x + rec.dx && p.x + p.dx > rec.x &&
            p.y < rec.y + rec.dy && p.y + p.dy > rec.y
          ) {
            p.stackUsed++;
          }
        }

        // New extreme points + projection lift (raises in-plane points to the new top face).
        const lifted: Point[] = [];
        for (const p of points) {
          if (
            p.x >= rec.x - EPS && p.x < rec.x + rec.dx + EPS &&
            p.y >= rec.y - EPS && p.y < rec.y + rec.dy + EPS &&
            p.z < rec.z + rec.dz + EPS
          ) {
            lifted.push({ x: p.x, y: p.y, z: rec.z + rec.dz + clearance });
          }
        }
        points.push(
          { x: rec.x + rec.dx + clearance, y: rec.y, z: rec.z },
          { x: rec.x, y: rec.y + rec.dy + clearance, z: rec.z },
          { x: rec.x, y: rec.y, z: rec.z + rec.dz + clearance },
          ...lifted
        );
        points = dedupeAndCap(points, rec);
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) unplacedUnits.push(u);
  }

  // Aggregate unplaced units by SKU.
  const unplacedMap = new Map<string, UnplacedGroup>();
  for (const u of unplacedUnits) {
    const g = unplacedMap.get(u.id);
    if (g) g.qty++;
    else unplacedMap.set(u.id, { skuId: u.id, qty: 1, reason: hitWeightLimit ? 'weight-limit' : 'no-fit' });
  }

  const volumeUtil =
    placed.reduce((s, p) => s + p.dx * p.dy * p.dz, 0) /
    (L * W * H);
  let cx = 0, cy = 0, cz = 0;
  for (const p of placed) {
    const m = items[p.skuIdx]!.weight;
    cx += m * (p.x + p.dx / 2);
    cy += m * (p.y + p.dy / 2);
    cz += m * (p.z + p.dz / 2);
  }
  const tw = Math.max(totalWeight, EPS);
  const cogX = ((cx / tw - W / 2) / (W / 2)) * 100;
  const cogY = ((cy / tw - L / 2) / (L / 2)) * 100;
  const cogZ = cz / tw;

  const base: Omit<LoadPlan, 'warnings'> = {
    schema: 'loadwise/plan',
    engineVersion: ENGINE_VERSION,
    solverId: SOLVER_ID,
    container,
    options: { clearance, supportRatio },
    placements: placed.map<Placement>((p) => ({
      skuId: items[p.skuIdx]!.id,
      step: p.step,
      pos: { x: p.x, y: p.y, z: p.z },
      dim: { dx: p.dx, dy: p.dy, dz: p.dz },
    })),
    unplaced: [...unplacedMap.values()].sort((a, b) => (a.skuId < b.skuId ? -1 : 1)),
    stats: {
      volumeUtil,
      weightUtil: totalWeight / container.maxWeight,
      loaded: placed.length,
      totalQty: units.length,
      weight: totalWeight,
      maxWeight: container.maxWeight,
      cogX,
      cogY,
      cogZ,
    },
  };
  return { ...base, warnings: buildWarnings(base, cogY) };
}
