import { describe, expect, it } from 'vitest';
import { CONTAINERS } from '@loadwise/core';
import { doorViewTransform, projectDoorView, topViewTransform, projectTopView, GUIDE_PAD } from '../src/views/guide.js';

const C20 = CONTAINERS['20GP']!; // 589 × 235 × 239

describe('doorViewTransform', () => {
  it('scales the width×height face to fit the canvas', () => {
    const t = doorViewTransform(C20, 640, 300);
    // width fits: (640-46-16)/235 = 2.459..., height fits: (300-26-34)/239 = 1.004...
    expect(t.s).toBeCloseTo(1.0041, 3);
    // frame height in px
    expect(C20.innerDim.h * t.s).toBeLessThanOrEqual(300 - GUIDE_PAD.t - GUIDE_PAD.b + 1e-9);
    expect(C20.innerDim.w * t.s).toBeLessThanOrEqual(640 - GUIDE_PAD.l - GUIDE_PAD.r + 1e-9);
  });

  it('maps z = 0 to the frame bottom edge (oy), higher z to smaller canvas y', () => {
    const t = doorViewTransform(C20, 640, 300);
    const bottom = { pos: { x: 0, y: 0, z: 0 }, dim: { dx: 10, dy: 10, dz: 10 }, skuId: 'a', step: 1 };
    const top = { ...bottom, pos: { x: 0, y: 0, z: 229 } };
    const rb = projectDoorView(bottom, t);
    const rt = projectDoorView(top, t);
    // a z=0 box rests its bottom edge exactly on the frame bottom (oy)
    expect(rb.y + rb.h).toBeCloseTo(t.oy, 6);
    expect(rt.y + rt.h).toBeCloseTo(t.oy - 229 * t.s, 6);
    expect(rt.y).toBeLessThan(rb.y);
  });

  it('maps x = 0 to the left frame edge', () => {
    const t = doorViewTransform(C20, 640, 300);
    const p = { pos: { x: 0, y: 0, z: 0 }, dim: { dx: 50, dy: 50, dz: 50 }, skuId: 'a', step: 1 };
    const r = projectDoorView(p, t);
    expect(r.x).toBeCloseTo(t.ox, 6);
    expect(r.w).toBeCloseTo(50 * t.s, 6);
  });
});

describe('topViewTransform / projectTopView', () => {
  it('maps the rear-left corner to the top-left of the frame, depth toward the door', () => {
    const t = topViewTransform(C20, 640, 300);
    // width fits at (640-62)/235 = 2.459; depth fits at (300-60)/589 = 0.4075 → scale by depth
    expect(t.s).toBeCloseTo((300 - GUIDE_PAD.t - GUIDE_PAD.b) / 589, 6);
    const rearLeft = { pos: { x: 0, y: 0, z: 0 }, dim: { dx: 50, dy: 100, dz: 50 }, skuId: 'a', step: 1 };
    const r = projectTopView(rearLeft, t);
    expect(r.x).toBeCloseTo(t.ox, 6);
    expect(r.y).toBeCloseTo(t.oy, 6);
    expect(r.w).toBeCloseTo(50 * t.s, 6);
    expect(r.h).toBeCloseTo(100 * t.s, 6);
  });

  it('is independent of height (footprint projection only)', () => {
    const t = topViewTransform(C20, 640, 300);
    const low = { pos: { x: 10, y: 20, z: 0 }, dim: { dx: 50, dy: 60, dz: 10 }, skuId: 'a', step: 1 };
    const high = { ...low, pos: { x: 10, y: 20, z: 200 } };
    expect(projectTopView(high, t)).toEqual(projectTopView(low, t));
  });
});
