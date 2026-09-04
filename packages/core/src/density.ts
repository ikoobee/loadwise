import type { CargoItem } from './types.js';

/**
 * Sea-freight W/M convention: 1 CBM is charged as 1000 kg. Cargo denser than
 * the ratio is "heavy" (weight-limited), lighter cargo is "light/bulky"
 * (volume-limited). Air freight uses 167 kg per CBM instead.
 */
export const SEA_WM_RATIO_KG_PER_CBM = 1000;

/** Volumetric density of one unit, kg per m³ (derived — never stored). */
export function densityOf(item: CargoItem): number {
  const volumeM3 = (item.dim.l * item.dim.w * item.dim.h) / 1e6;
  return item.weight / Math.max(volumeM3, 1e-9);
}

export type DensityClass = 'heavy' | 'balanced' | 'light';

export function classifyDensity(
  item: CargoItem,
  wmRatio: number = SEA_WM_RATIO_KG_PER_CBM
): DensityClass {
  const d = densityOf(item) / wmRatio;
  if (d >= 1.25) return 'heavy';
  if (d <= 0.8) return 'light';
  return 'balanced';
}
