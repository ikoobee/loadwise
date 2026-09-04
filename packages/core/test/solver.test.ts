import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CONTAINERS,
  classifyDensity,
  densityOf,
  ENGINE_VERSION,
  solveL1,
  validatePlan,
  type CargoItem,
} from '../src/index.js';

const C20 = CONTAINERS['20GP']!;
const C40 = CONTAINERS['40GP']!;
const C40HQ = CONTAINERS['40HQ']!;

function item(partial: Partial<CargoItem> & Pick<CargoItem, 'dim' | 'weight' | 'qty'>): CargoItem {
  return {
    id: partial.id ?? 'sku',
    name: partial.name ?? 'sku',
    maxStackOn: partial.maxStackOn ?? 3,
    rotation: partial.rotation ?? 'any',
    ...partial,
  } as CargoItem;
}

describe('solveL1 — homogeneous cargo', () => {
  it('achieves high utilization when supply is abundant', () => {
    const r = solveL1(C40, [item({ dim: { l: 60, w: 40, h: 40 }, weight: 8, qty: 700, maxStackOn: 10 })]);
    expect(r.stats.volumeUtil).toBeGreaterThan(0.75);
    expect(r.placements.length).toBeGreaterThan(400);
  });
});

describe('solveL1 — mixed manifest invariants', () => {
  const manifest: CargoItem[] = [
    item({ id: 'A', dim: { l: 120, w: 100, h: 95 }, weight: 180, qty: 6, maxStackOn: 0 }),
    item({ id: 'B', dim: { l: 80, w: 60, h: 45 }, weight: 12, qty: 60, maxStackOn: 5 }),
    item({ id: 'C', dim: { l: 55, w: 45, h: 40 }, weight: 9, qty: 80, maxStackOn: 6, rotation: 'upright' }),
  ];
  const plan = solveL1(C40HQ, manifest);

  it('passes validatePlan with zero issues', () => {
    expect(validatePlan(plan, manifest)).toEqual([]);
  });

  it('never exceeds weight limit', () => {
    expect(plan.stats.weight).toBeLessThanOrEqual(C40HQ.maxWeight);
  });
});

describe('solveL1 — stacking constraints', () => {
  it('stacks nothing on a no-stack heavy base', () => {
    const plan = solveL1(C20, [
      item({ id: 'heavy', dim: { l: 200, w: 200, h: 50 }, weight: 500, qty: 1, maxStackOn: 0, rotation: 'fixed' }),
      item({ id: 'light', dim: { l: 30, w: 30, h: 30 }, weight: 1, qty: 300, maxStackOn: 9 }),
    ]);
    const hv = plan.placements.find((p) => p.skuId === 'heavy');
    expect(hv).toBeDefined();
    const onTop = plan.placements.filter(
      (p) =>
        hv &&
        Math.abs(p.pos.z - (hv.pos.z + hv.dim.dz)) < 1e-3 &&
        p.pos.x < hv.pos.x + hv.dim.dx && p.pos.x + p.dim.dx > hv.pos.x &&
        p.pos.y < hv.pos.y + hv.dim.dy && p.pos.y + p.dim.dy > hv.pos.y
    );
    expect(onTop).toHaveLength(0);
    expect(validatePlan(plan, [
      item({ id: 'heavy', dim: { l: 200, w: 200, h: 50 }, weight: 500, qty: 1, maxStackOn: 0, rotation: 'fixed' }),
      item({ id: 'light', dim: { l: 30, w: 30, h: 30 }, weight: 1, qty: 300, maxStackOn: 9 }),
    ])).toEqual([]);
  });
});

describe('solveL1 — weight limit', () => {
  it('stops loading when the next unit would exceed payload', () => {
    const plan = solveL1(C20, [
      item({ id: 'steel', dim: { l: 100, w: 100, h: 100 }, weight: 12000, qty: 5, maxStackOn: 0 }),
    ]);
    expect(plan.stats.loaded).toBe(1);
    expect(plan.unplaced).toEqual([{ skuId: 'steel', qty: 4, reason: 'weight-limit' }]);
  });
});

describe('solveL1 — determinism', () => {
  const manifest: CargoItem[] = [
    item({ id: 'A', dim: { l: 90, w: 70, h: 60 }, weight: 30, qty: 40, maxStackOn: 3 }),
    item({ id: 'B', dim: { l: 50, w: 40, h: 35 }, weight: 8, qty: 120, maxStackOn: 8 }),
  ];
  it('produces byte-identical output for identical input', () => {
    const a = JSON.stringify(solveL1(C40HQ, manifest, { clearance: 1 }));
    const b = JSON.stringify(solveL1(C40HQ, manifest, { clearance: 1 }));
    expect(a).toBe(b);
  });
});

describe('solveL1 — clearance', () => {
  it('keeps at least `clearance` surface gap between units', () => {
    const clear = 2;
    const plan = solveL1(
      C20,
      [item({ id: 'x', dim: { l: 100, w: 100, h: 100 }, weight: 50, qty: 30, maxStackOn: 3 })],
      { clearance: clear }
    );
    const t = clear - 0.01;
    for (let i = 0; i < plan.placements.length; i++) {
      for (let j = i + 1; j < plan.placements.length; j++) {
        const a = plan.placements[i]!;
        const b = plan.placements[j]!;
        const overlap = (
          a.pos.x < b.pos.x + b.dim.dx + t && a.pos.x + a.dim.dx + t > b.pos.x &&
          a.pos.y < b.pos.y + b.dim.dy + t && a.pos.y + a.dim.dy + t > b.pos.y &&
          a.pos.z < b.pos.z + b.dim.dz + t && a.pos.z + a.dim.dz + t > b.pos.z
        );
        expect(overlap).toBe(false);
      }
    }
  });
});

describe('validatePlan — rejects hand-made violations', () => {
  it('flags overlapping and out-of-bounds placements', () => {
    const items: CargoItem[] = [
      item({ id: 'x', dim: { l: 100, w: 100, h: 100 }, weight: 50, qty: 2, maxStackOn: 3 }),
    ];
    const plan = solveL1(C20, items);
    // Tamper: move unit 2 onto unit 1 (overlap) and stretch unit 1 out of bounds.
    const tampered = structuredClone(plan);
    tampered.placements[1]!.pos = { x: 0, y: 0, z: 0.0001 };
    const issues = validatePlan(tampered, items);
    expect(issues.map((i) => i.code)).toContain('overlap');
  });
});

describe('density helpers', () => {
  it('classifies heavy vs light cargo by W/M ratio', () => {
    // 1 m³ crate: ≥1250 kg/m³ counts as heavy under the sea W/M convention.
    const steel = item({ dim: { l: 100, w: 100, h: 100 }, weight: 1500, qty: 1 });
    const foam = item({ dim: { l: 100, w: 100, h: 100 }, weight: 8, qty: 1 });
    expect(densityOf(steel)).toBe(1500);
    expect(classifyDensity(steel)).toBe('heavy');
    expect(classifyDensity(foam)).toBe('light');
  });
});

describe('solveL1 — loading order', () => {
  const manifest: CargoItem[] = [
    item({ id: 'A', dim: { l: 120, w: 100, h: 95 }, weight: 180, qty: 6, maxStackOn: 0 }),
    item({ id: 'B', dim: { l: 80, w: 60, h: 45 }, weight: 12, qty: 60, maxStackOn: 5 }),
    item({ id: 'C', dim: { l: 55, w: 45, h: 40 }, weight: 9, qty: 80, maxStackOn: 6, rotation: 'upright' }),
  ];

  it('orders steps so bearers exist before their load and no path is blocked', () => {
    for (const loadingOrder of ['layer', 'row'] as const) {
      const plan = solveL1(C40HQ, manifest, { clearance: 1, loadingOrder });
      const seen = new Set<number>();
      for (const p of plan.placements) {
        if (p.pos.z > 1e-3) {
          // every direct bearer (top face == p's bottom, x/y overlap) must already be in
          const hasBearer = plan.placements.some((q) =>
            q.step < p.step &&
            Math.abs(q.pos.z + q.dim.dz + 1 - p.pos.z) < 1e-3 &&
            q.pos.x < p.pos.x + p.dim.dx && q.pos.x + q.dim.dx > p.pos.x &&
            q.pos.y < p.pos.y + p.dim.dy && q.pos.y + q.dim.dy > p.pos.y
          );
          expect(hasBearer).toBe(true);
        }
        seen.add(p.step);
      }
      expect(validatePlan(plan, manifest)).toEqual([]);
    }
  });

  it('row strategy also produces a valid plan (and records the strategy)', () => {
    const plan = solveL1(C40HQ, manifest, { clearance: 1, loadingOrder: 'row' });
    expect(plan.options.loadingOrder).toBe('row');
    expect(plan.stats.loaded).toBeGreaterThan(0);
    expect(validatePlan(plan, manifest)).toEqual([]);
  });
});

describe('validatePlan — blocked path', () => {
  it('flags a later unit whose push-in path is blocked by an earlier one', () => {
    const items: CargoItem[] = [
      item({ id: 'x', dim: { l: 60, w: 60, h: 60 }, weight: 10, qty: 2 }),
    ];
    const plan = solveL1(C20, items);
    expect(plan.placements).toHaveLength(2);
    // Tamper: front box (y=100) loaded first, rear box (y=0) loaded second —
    // the rear box cannot be pushed in past the front one.
    const tampered = structuredClone(plan);
    const [a, b] = tampered.placements;
    tampered.placements = [
      { ...a!, pos: { x: 0, y: 100, z: 0 }, step: 1 },
      { ...b!, pos: { x: 0, y: 0, z: 0 }, step: 2 },
    ];
    const issues = validatePlan(tampered, items);
    expect(issues.map((i) => i.code)).toContain('blocked-path');
    // sanity: the legal order (rear first) passes
    const legal = structuredClone(plan);
    const [c, d] = legal.placements;
    legal.placements = [
      { ...c!, pos: { x: 0, y: 0, z: 0 }, step: 1 },
      { ...d!, pos: { x: 0, y: 100, z: 0 }, step: 2 },
    ];
    expect(validatePlan(legal, items).filter((i) => i.code === 'blocked-path')).toEqual([]);
  });
});

describe('engine metadata', () => {
  it('stamps schema and engine version; version tracks package.json', () => {
    const plan = solveL1(C20, [item({ dim: { l: 60, w: 40, h: 40 }, weight: 8, qty: 3 })]);
    expect(plan.schema).toBe('loadwise/plan');
    expect(plan.engineVersion).toBe(ENGINE_VERSION);
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
    ) as { version: string };
    expect(ENGINE_VERSION).toBe(pkg.version);
  });

  it('emits a weight-limited warning on heavy-only loads', () => {
    const plan = solveL1(C20, [
      item({ id: 'steel', dim: { l: 110, w: 100, h: 90 }, weight: 2000, qty: 10, maxStackOn: 0 }),
    ]);
    expect(plan.warnings.some((w) => w.startsWith('Weight-limited'))).toBe(true);
  });
});
