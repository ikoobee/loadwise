/**
 * Domain model for LoadWise.
 *
 * Coordinate system (the single convention across the whole system):
 *   x — width  (left → right)
 *   y — depth  (container rear 0 → door)
 *   z — height (floor 0 → up)
 * Units: centimeters and kilograms.
 */

/** Dimensions in cm: l = nominal length (depth), w = width, h = height. */
export interface Dim3 {
  l: number;
  w: number;
  h: number;
}

/** Rotation constraint of a cargo item. */
export type RotationMode =
  | 'any' // free rotation on all six faces
  | 'upright' // keep upright (h vertical), base may rotate 90°
  | 'fixed'; // no rotation at all

/** A cargo SKU definition (one manifest line). */
export interface CargoItem {
  id: string;
  name: string;
  dim: Dim3;
  /** Gross weight per unit, kg. */
  weight: number;
  /** Number of units of this SKU to load. */
  qty: number;
  /** How many more layers may be stacked on top of this item (0 = no stacking on it). */
  maxStackOn: number;
  rotation: RotationMode;
}

/** A container type with inner dimensions and payload limit. */
export interface ContainerType {
  id: string;
  name: string;
  innerDim: Dim3;
  /** Maximum cargo weight, kg. */
  maxWeight: number;
}

/** Axis-aligned placement of one cargo unit in the container. */
export interface Placement {
  skuId: string;
  /** Loading order, 1-based. */
  step: number;
  pos: { x: number; y: number; z: number };
  /** Actual occupied size after rotation. */
  dim: { dx: number; dy: number; dz: number };
}

export interface SolveOptions {
  /** Required surface gap between cargo units (and to walls along y growth), cm. Default 0. */
  clearance?: number;
  /** Minimum ratio of bottom face that must be supported. Default 0.75. */
  supportRatio?: number;
}

export interface LoadPlanStats {
  volumeUtil: number;
  weightUtil: number;
  loaded: number;
  totalQty: number;
  weight: number;
  maxWeight: number;
  /** Center of gravity offsets in percent of half-extents (positive x = right, positive y = toward door). */
  cogX: number;
  cogY: number;
  cogZ: number;
}

export interface UnplacedGroup {
  skuId: string;
  qty: number;
  reason: 'weight-limit' | 'no-fit';
}

/** Stable output of a solver run. Same engine version + same input ⇒ byte-identical output. */
export interface LoadPlan {
  schema: 'loadwise/plan';
  engineVersion: string;
  solverId: string;
  container: ContainerType;
  /** Options actually applied (frozen defaults included). */
  options: Required<SolveOptions>;
  placements: Placement[];
  unplaced: UnplacedGroup[];
  stats: LoadPlanStats;
  warnings: string[];
}
