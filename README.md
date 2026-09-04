# LoadWise

[![CI](https://github.com/ikoobee/loadwise/actions/workflows/ci.yml/badge.svg)](https://github.com/ikoobee/loadwise/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](CHANGELOG.md)

**[中文文档](README.zh-CN.md)**

Deterministic, constraint-aware container loading engine for cross-border
shipping. Given a cargo manifest and a container, LoadWise produces a 3D
loading plan that respects real-world hard constraints — payload limits,
stacking rules, rotation modes, cargo clearance, and bottom support — and is
reproducible byte-for-byte for the same input.

## Why

Spreadsheets estimate; LoadWise computes. Mis-estimated container loads cost
real money — volume wasted on heavy-only loads, payload wasted on bulky-only
loads, or a container that simply does not fit everything booked. Existing open
source stops at bin-packing libraries; LoadWise models the constraints that
matter in export logistics and outputs an auditable plan.

## Current capabilities

- `solveL1` — L1 solver (Extreme-Point First-Fit Decreasing), interactive-speed:
  ~350 ms for a 266-unit five-SKU manifest, ~190 ms for a 2,000-unit input
- Hard constraints: total weight, per-item stack limits (`maxStackOn`),
  rotation modes (`any` / `upright` / `fixed`), inter-cargo clearance,
  ≥ 75 % bottom-support requirement
- `validatePlan` — standalone plan validator reusing the same invariants
  (audit any plan, including hand-edited or third-party ones)
- Standard container library: 20GP / 40GP / 40HQ / 45HQ / 13.5 m box truck
- Center-of-gravity report and weight/volume-limit warnings (W/M awareness)
- Deterministic output with engine version stamped on every plan

## Quick start

```bash
git clone git@github.com:ikoobee/loadwise.git
cd loadwise
pnpm install
pnpm test        # 11 tests, all green
```

Use the engine from TypeScript:

```ts
import { solveL1, validatePlan, CONTAINERS, classifyDensity } from '@loadwise/core';

const manifest = [
  {
    id: 'chair', name: 'Beach chair carton',
    dim: { l: 80, w: 60, h: 45 },   // cm
    weight: 12,                      // kg per unit
    qty: 60,
    maxStackOn: 5,                   // up to 5 more layers on top
    rotation: 'any' as const,
  },
  {
    id: 'appliance', name: 'Small appliance',
    dim: { l: 55, w: 45, h: 40 }, weight: 9, qty: 80,
    maxStackOn: 6, rotation: 'upright' as const,
  },
];

const plan = solveL1(CONTAINERS['40HQ']!, manifest, { clearance: 1 });

plan.stats.volumeUtil;   // e.g. 0.54
plan.stats.weight;       // loaded kg
plan.warnings;           // e.g. weight/volume-limit advisories
plan.placements[0];      // { skuId, step, pos, dim } — unit #1 goes here

validatePlan(plan, manifest); // [] — zero violations, always re-checkable
```

## Design guarantees

- **Determinism is a contract.** Same engine version + same input ⇒ identical
  output. No randomness, no timestamps, fully ordered tie-breakers. Enforced by
  a double-run equality test in CI.
- **Pure functions.** The core has zero dependencies and touches no DOM, file
  system, or network — it runs identically in a browser worker, Node, or a
  future native port.
- **Stable plan schema.** `LoadPlan` JSON is versioned and append-only; plans
  produced by older versions keep rendering.

## Roadmap

- Web viewer with step-by-step 3D animation and printable loading guide
- CLI (`loadwise plan manifest.xlsx -o plan.json`)
- Self-hosted HTTP API + Docker image
- Public benchmark set (`bench/`) with per-version result snapshots

See [CHANGELOG.md](CHANGELOG.md) for what landed in each version.

## Contributing

Issues and PRs are welcome. By contributing you agree that your contributions
are licensed under the project's MIT license (inbound = outbound).

## License

[MIT](LICENSE) © 2026 Ethan (ikoobee)

## ☕ Sponsor

If LoadWise saves you a container or two, consider supporting the project:

[![GitHub Sponsors](https://img.shields.io/badge/GitHub-Sponsors-ea4aaa.svg)](https://github.com/sponsors/ikoobee)
