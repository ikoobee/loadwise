import type { CargoItem, LoadPlan, Placement } from './types.js';

export interface ValidationIssue {
  code:
    | 'overlap'
    | 'out-of-bounds'
    | 'weight-exceeded'
    | 'unsupported'
    | 'stack-exceeded'
    | 'blocked-path'
    | 'step-sequence';
  message: string;
  step?: number;
}

const EPS = 1e-6;

/**
 * Validate a LoadPlan against the hard constraints. Independent of the solver —
 * used by tests, guide rendering, and third-party audits to re-check any plan
 * (including hand-edited or externally generated ones).
 */
export function validatePlan(plan: LoadPlan, items: CargoItem[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { container, placements, options } = plan;
  const W = container.innerDim.w;
  const L = container.innerDim.l;
  const H = container.innerDim.h;
  const byId = new Map(items.map((it) => [it.id, it]));
  const box = (p: Placement) => ({
    x: p.pos.x, y: p.pos.y, z: p.pos.z,
    dx: p.dim.dx, dy: p.dim.dy, dz: p.dim.dz,
  });

  for (const p of placements) {
    const b = box(p);
    if (
      b.x < -EPS || b.y < -EPS || b.z < -EPS ||
      b.x + b.dx > W + EPS || b.y + b.dy > L + EPS || b.z + b.dz > H + EPS
    ) {
      issues.push({ code: 'out-of-bounds', step: p.step, message: `unit #${p.step} (${p.skuId}) exceeds container bounds` });
    }
    const item = byId.get(p.skuId);
    if (item && !fitsOrientation(item, p)) {
      issues.push({ code: 'out-of-bounds', step: p.step, message: `unit #${p.step} (${p.skuId}) orientation violates its rotation mode` });
    }
  }

  for (let i = 0; i < placements.length; i++) {
    const a = placements[i]!;
    for (let j = i + 1; j < placements.length; j++) {
      const b = placements[j]!;
      const ba = box(a), bb = box(b);
      if (
        ba.x < bb.x + bb.dx && ba.x + ba.dx > bb.x &&
        ba.y < bb.y + bb.dy && ba.y + ba.dy > bb.y &&
        ba.z < bb.z + bb.dz && ba.z + ba.dz > bb.z
      ) {
        issues.push({ code: 'overlap', step: a.step, message: `unit #${a.step} overlaps unit #${b.step}` });
      }
    }
  }

  const totalWeight = placements.reduce((s, p) => s + (byId.get(p.skuId)?.weight ?? 0), 0);
  if (totalWeight > container.maxWeight + EPS) {
    issues.push({ code: 'weight-exceeded', message: `total weight ${totalWeight.toFixed(1)} kg exceeds limit ${container.maxWeight} kg` });
  }

  // Support & stacking: floor, or ≥ supportRatio of bottom face resting on boxes
  // whose stack capacity is not exceeded.
  const stackUsed = new Map<number, number>();
  for (const p of placements) {
    const b = box(p);
    if (b.z < EPS) continue; // on the floor
    let supportedArea = 0;
    const totalArea = b.dx * b.dy;
    for (const q of placements) {
      if (q.step === p.step) continue;
      const bq = box(q);
      if (Math.abs(bq.z + bq.dz + options.clearance - b.z) >= 1e-3) continue;
      const ox = Math.max(0, Math.min(b.x + b.dx, bq.x + bq.dx) - Math.max(b.x, bq.x));
      const oy = Math.max(0, Math.min(b.y + b.dy, bq.y + bq.dy) - Math.max(b.y, bq.y));
      supportedArea += ox * oy;
      if (ox > 0 && oy > 0) stackUsed.set(q.step, (stackUsed.get(q.step) ?? 0) + 1);
    }
    const item = byId.get(p.skuId);
    if (supportedArea / Math.max(totalArea, EPS) < plan.options.supportRatio - 1e-6) {
      issues.push({ code: 'unsupported', step: p.step, message: `unit #${p.step} bottom support ${(supportedArea / totalArea * 100).toFixed(0)}% below required ${plan.options.supportRatio * 100}%` });
    }
    if (item && b.z > EPS) {
      // every bearer directly below must still have stack capacity
      for (const q of placements) {
        if (q.step === p.step) continue;
        const bq = box(q);
        if (Math.abs(bq.z + bq.dz + options.clearance - b.z) >= 1e-3) continue;
        const ox = Math.min(b.x + b.dx, bq.x + bq.dx) - Math.max(b.x, bq.x);
        const oy = Math.min(b.y + b.dy, bq.y + bq.dy) - Math.max(b.y, bq.y);
        if (ox > 0 && oy > 0) {
          const bearer = byId.get(q.skuId);
          const used = stackUsed.get(q.step) ?? 0;
          if (bearer && used > bearer.maxStackOn) {
            issues.push({ code: 'stack-exceeded', step: q.step, message: `unit #${q.step} (${q.skuId}) carries ${used} layers, exceeds maxStackOn ${bearer.maxStackOn}` });
          }
        }
      }
    }
  }

  for (let i = 0; i < placements.length; i++) {
    if (placements[i]!.step !== i + 1) {
      issues.push({ code: 'step-sequence', message: `steps must be 1..n in order, got #${placements[i]!.step} at index ${i}` });
      break;
    }
  }

  // Door-side insertion feasibility: cargo loaded later (higher step) must not
  // have an earlier cargo sitting door-wards of it with an overlapping width ×
  // height footprint — that earlier box would block the straight push-in path
  // from the door. Tolerance absorbs the inter-cargo clearance gap.
  const pathTol = options.clearance + 1e-3;
  for (let s = 0; s < placements.length; s++) {
    const p = placements[s]!;
    const bp = box(p);
    for (let t = 0; t < s; t++) {
      const q = placements[t]!;
      const bq = box(q);
      const footprintOverlap =
        bp.x < bq.x + bq.dx && bp.x + bp.dx > bq.x &&
        bp.z < bq.z + bq.dz && bp.z + bp.dz > bq.z;
      const blocksDoorSide = bq.y + bq.dy > bp.y + bp.dy + pathTol;
      if (footprintOverlap && blocksDoorSide) {
        issues.push({
          code: 'blocked-path',
          step: p.step,
          message: `unit #${p.step} (${p.skuId}) cannot be pushed in from the door: unit #${q.step} (${q.skuId}) blocks its path`,
        });
      }
    }
  }

  return issues;
}

function fitsOrientation(item: CargoItem, p: Placement): boolean {
  const { l, w, h } = item.dim;
  const { dx, dy, dz } = p.dim;
  const sorted = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y).join(',');
  if (item.rotation === 'any') return true; // any permutation is legal
  if (item.rotation === 'upright') return dz === h && sorted(dx, dy, dz) === sorted(l, w, h);
  return dx === l && dy === w && dz === h;
}
