import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTAINERS,
  ENGINE_VERSION,
  solveL1,
  validatePlan,
  type CargoItem,
  type LoadPlan,
  type LoadingOrder,
} from '../src/index.js';

/**
 * Golden set — loads bench/cases/*.json, solves, re-validates, asserts quality
 * ranges, and locks the exact metrics into bench/snapshots/*.json.
 *
 * Determinism makes the snapshot a regression gate: identical input must yield
 * byte-identical metrics. A snapshot mismatch means solver behavior changed —
 * review it, then regenerate with:  UPDATE_SNAPSHOTS=1 pnpm test
 * Duration is reported to the console only (machine-dependent, never asserted).
 */

const CASES_DIR = fileURLToPath(new URL('../../../bench/cases', import.meta.url));
const SNAP_DIR = fileURLToPath(new URL('../../../bench/snapshots', import.meta.url));
const UPDATE = !!process.env.UPDATE_SNAPSHOTS;

interface BenchCase {
  id: string;
  description: string;
  container: string;
  items: CargoItem[];
  options?: { clearance?: number; loadingOrder?: LoadingOrder };
  expect: { volumeUtil?: [number, number]; loaded?: [number, number] };
}

function metrics(plan: LoadPlan): Record<string, string | number> {
  return {
    engineVersion: ENGINE_VERSION,
    placed: plan.placements.length,
    unplaced: plan.unplaced.reduce((n, g) => n + g.qty, 0),
    volumeUtil: plan.stats.volumeUtil.toFixed(6),
    weightUtil: plan.stats.weightUtil.toFixed(6),
    loadedWeight: Math.round(plan.stats.weight),
    cogX: plan.stats.cogX.toFixed(3),
    cogY: plan.stats.cogY.toFixed(3),
    warnings: plan.warnings.length,
  };
}

const files = readdirSync(CASES_DIR).filter((f) => f.endsWith('.json')).sort();

describe('golden set', () => {
  if (files.length === 0) it('has cases', () => expect(files.length).toBeGreaterThan(0));

  for (const file of files) {
    const tc = JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8')) as BenchCase;
    const container = CONTAINERS[tc.container] ?? (tc.container === 'CUSTOM' ? undefined : undefined);

    describe(tc.id, () => {
      if (!container) {
        it('references a known container', () => expect(container).toBeDefined());
        return;
      }
      const t0 = performance.now();
      const plan = solveL1(container, tc.items, tc.options ?? {});
      const ms = performance.now() - t0;

      it('produces a valid plan (validatePlan: zero issues)', () => {
        expect(validatePlan(plan, tc.items)).toEqual([]);
      });

      if (tc.expect.loaded) {
        it(`loads ${tc.expect.loaded[0]}..${tc.expect.loaded[1]} units (took ${ms.toFixed(0)}ms)`, () => {
          expect(plan.stats.loaded).toBeGreaterThanOrEqual(tc.expect.loaded![0]);
          expect(plan.stats.loaded).toBeLessThanOrEqual(tc.expect.loaded![1]);
        });
      }
      if (tc.expect.volumeUtil) {
        it(`keeps volume utilization within [${tc.expect.volumeUtil[0]}, ${tc.expect.volumeUtil[1]}]`, () => {
          expect(plan.stats.volumeUtil).toBeGreaterThanOrEqual(tc.expect.volumeUtil![0]);
          expect(plan.stats.volumeUtil).toBeLessThanOrEqual(tc.expect.volumeUtil![1]);
        });
      }

      it('matches the committed snapshot (regression gate)', () => {
        const snapPath = join(SNAP_DIR, file);
        const current = metrics(plan);
        if (UPDATE || !existsSync(snapPath)) {
          mkdirSync(SNAP_DIR, { recursive: true });
          writeFileSync(snapPath, JSON.stringify(current, null, 2) + '\n');
          console.log(`[golden] snapshot ${UPDATE ? 'updated' : 'created'}: ${file}`);
          return;
        }
        const committed = JSON.parse(readFileSync(snapPath, 'utf8'));
        expect(current).toEqual(committed);
      });
    });
  }
});
