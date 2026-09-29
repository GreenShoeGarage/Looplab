# LOOPLAB changes

## v1.0.0-rc.1

- Added an offline Quick guide with keyboard focus restoration and a direct path to guided comparisons.
- Added a complete teaching guide covering the mechanisms, controlled experiments, metrics, exports and recovery.
- Added 21 closed-form model cases, 45 actuator/plant RK4 comparisons, timestep convergence and finite-window metric references.
- Preserve boundary warnings in mixed recordings and include the current observation in reports.
- Added cross-engine release workflows and documented the host limitations that prevented Firefox/WebKit verification.
- Kept the numerical engine, starter responses and v4 project format unchanged; v1–v4 imports remain supported.

## v0.9.0

- Added keyboard/touch response inspection with exact recorded values, a chart cursor and saved-output comparisons.
- Added current-trace CSV and self-contained PNG exports, with partial/mixed recording context.
- Added persistent, swappable recovery checkpoints before import or Fresh start; invalid imports leave checkpoints untouched.
- Flush pending autosaves on page hide/leave and clearly report quota or blocked-storage failures.
- Added mobile inspector layouts, Project-menu Escape focus, and a more precise physical-scene accessible label.
- Verified numerical regressions, export data, recovery paths, six theme/mode accessibility scans and narrow layouts.

## v0.8.0

- Added up to 12 named experiments with complete, immutable response snapshots and repeatable loading.
- Added four selectable same-system response overlays with distinct patterns and a numerical comparison table.
- Added inline renaming, removal and one-step undo.
- New v4 JSON backups include the entire shelf; v1–v3 imports retain existing saved experiments.
- Reports include selected comparison responses and their complete settings.
- Added strict trace/shelf validation and full browser coverage for capture, restore, limits, safe names, reports and responsive layouts.

## v0.7.0

- Added persistent Easy and Advanced views with a shared simulation.
- Added guided P, I and D comparisons, pinned reference traces, measured outcomes, and a one-step restore of the prior setup.
- Added configurable derivative filtering, proportional setpoint weighting, integral memory cap and conditional anti-windup.
- Preserved the original default model responses and v1/v2 import compatibility; new exports use project format v3.
- Updated reports, recovery validation, keyboard paths, mobile layout and teaching documentation.

## v0.6.1

- Audited and polished the five-model instrument.
- Fixed paused readouts, damaged-settings recovery, import validation and report snapshots.
- Improved desktop/phone layout, exact gain entry and tactile knob behavior.
- Added mathematical reference checks and browser regression coverage.
