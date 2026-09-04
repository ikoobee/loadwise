# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `@loadwise/core`: deterministic L1 solver (EP-FFD) with hard constraints —
  weight limit, stack limits, rotation modes, inter-cargo clearance, and
  75% bottom-support sampling; standard container library (20GP/40GP/40HQ/45HQ/truck);
  plan validator (`validatePlan`) reusing the same invariant checks; density helper.
- `@loadwise/web`: web viewer wired to the core engine — solving runs in a Web
  Worker (UI thread stays free), step-by-step 3D animation with camera presets,
  KPI panel with weight meter and W/M advisories, loading-sequence list, and a
  door-view loading guide canvas (depth-faded projection, current step outlined);
  light/dark theme.
