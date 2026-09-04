import { describe, expect, it } from 'vitest';
import { CONTAINERS, solveL1, type Placement } from '@loadwise/core';
import { cargoWorldCenter, type ContainerMeters } from '../src/views/world-mapping.js';

const C20 = CONTAINERS['20GP']!;
const size: ContainerMeters = { L: C20.innerDim.l / 100, W: C20.innerDim.w / 100, H: C20.innerDim.h / 100 };

function place(x: number, y: number, z: number, dx: number, dy: number, dz: number): Placement {
  return { skuId: 'a', step: 1, pos: { x, y, z }, dim: { dx, dy, dz } };
}

describe('cargoWorldCenter', () => {
  it('centers a corner box inside the container (adds its own half extents)', () => {
    // 1 m³ crate at the rear-left floor corner of a 20GP
    const c = cargoWorldCenter(place(0, 0, 0, 100, 100, 100), size);
    expect(c.x).toBeCloseTo(-size.W / 2 + 0.5, 9); // not −W/2 (that pokes through the wall)
    expect(c.y).toBeCloseTo(0.5, 9);
    expect(c.z).toBeCloseTo(-size.L / 2 + 0.5, 9); // rear wall at −L/2, not centered on it
  });

  it("keeps every solved placement's world AABB inside the container AABB", () => {
    const plan = solveL1(C20, [
      { id: 'a', name: 'a', dim: { l: 90, w: 70, h: 60 }, weight: 20, qty: 60, maxStackOn: 3, rotation: 'any' },
      { id: 'b', name: 'b', dim: { l: 50, w: 40, h: 35 }, weight: 6, qty: 80, maxStackOn: 8, rotation: 'upright' },
    ], { clearance: 1 });
    const EPS = 1e-9;
    for (const p of plan.placements) {
      const c = cargoWorldCenter(p, size);
      const sx = p.dim.dx / 200, sy = p.dim.dz / 200, sz = p.dim.dy / 200;
      expect(c.x - sx).toBeGreaterThanOrEqual(-size.W / 2 - EPS);
      expect(c.x + sx).toBeLessThanOrEqual(size.W / 2 + EPS);
      expect(c.y - sy).toBeGreaterThanOrEqual(-EPS);
      expect(c.y + sy).toBeLessThanOrEqual(size.H + EPS);
      expect(c.z - sz).toBeGreaterThanOrEqual(-size.L / 2 - EPS);
      expect(c.z + sz).toBeLessThanOrEqual(size.L / 2 + EPS);
    }
  });
});
