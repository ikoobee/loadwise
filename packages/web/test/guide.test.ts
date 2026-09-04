import { describe, expect, it } from 'vitest';
import { CONTAINERS } from '@loadwise/core';
import { doorViewTransform, projectDoorView, GUIDE_PAD } from '../src/views/guide.js';

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
