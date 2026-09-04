import type { ContainerType } from './types.js';

/**
 * Standard container library. Inner dimensions are nominal industry values in
 * cm; per-shipping-line variations must be modeled with a custom ContainerType.
 */
export const CONTAINERS: Record<string, ContainerType> = {
  '20GP': { id: '20GP', name: '20ft General Purpose', innerDim: { l: 589, w: 235, h: 239 }, maxWeight: 21700 },
  '40GP': { id: '40GP', name: '40ft General Purpose', innerDim: { l: 1203, w: 235, h: 239 }, maxWeight: 26700 },
  '40HQ': { id: '40HQ', name: '40ft High Cube', innerDim: { l: 1203, w: 235, h: 269 }, maxWeight: 26500 },
  '45HQ': { id: '45HQ', name: '45ft High Cube', innerDim: { l: 1351, w: 245, h: 269 }, maxWeight: 27600 },
  TRUCK13: { id: 'TRUCK13', name: '13.5m Box Truck', innerDim: { l: 1350, w: 245, h: 260 }, maxWeight: 25000 },
};

export function listContainers(): ContainerType[] {
  return Object.values(CONTAINERS);
}
