import type { Placement } from '@loadwise/core';

/** Container size in meters. */
export interface ContainerMeters { L: number; W: number; H: number }

/**
 * Map a placement (cm, x=width / y=depth rear→door / z=height) to three.js
 * world space (meters, container centered on the floor):
 *   world x = [−W/2, W/2]  ← cargo x + half its width
 *   world y = [0, H]       ← cargo z + half its height
 *   world z = [−L/2, L/2]  ← cargo y + half its depth (rear = −L/2, door = +L/2)
 *
 * Returns the box CENTER (all three axes must add the box's own half extent —
 * omitting it shifts every box by half its size, poking cargo through walls).
 */
export function cargoWorldCenter(
  p: Placement,
  c: ContainerMeters
): { x: number; y: number; z: number } {
  return {
    x: p.pos.x / 100 + p.dim.dx / 200 - c.W / 2,
    y: p.pos.z / 100 + p.dim.dz / 200,
    z: p.pos.y / 100 + p.dim.dy / 200 - c.L / 2,
  };
}
