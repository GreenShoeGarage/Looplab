# LOOPLAB v1.0.0-rc.1 verification

## Simulation tests — passed

`node tests/controller.cjs`

The existing checks cover P/I/D contribution sums, derivative effectiveness, integral clearing, saturation/anti-windup, pause/resume, live tuning, finite and bounded states, seeded noise, sensor delay, timed loads, tank-only positive pumping, five starter responses and spring damping.

Independent reference comparisons:

| Model | Case | Maximum accepted absolute error |
| --- | --- | ---: |
| Motor | Constant load 12, inertia 2.5, 5-second first-order response | 0.025 normalized unit |
| Chamber | Constant load 12, inertia 1.8, 5-second thermal response | 0.01 normalized unit |
| Tank | Gravity drain from level 64 for 2 seconds; capacity 1.5, drain 2 | 0.03 normalized unit |
| Spring | Free decay from displacement 20 for 1 second; mass 1.5, k 0.35, damping 0.55 | 0.06 normalized unit |

All passed. Baseline starter outputs after 24 seconds remain: cart 68.725; chamber 71.885; tank 69.998; motor 70.000; spring 69.931. These are model observations, not universal controller targets.

## Advanced controller and guided examples — passed

Added to `tests/controller.cjs`:

- Unclipped weighted P agrees with the direct algebraic result; I continues to integrate the full error when P weight is zero.
- Disabling conditional anti-windup permits accumulation at saturation while the configured memory cap remains enforced.
- Zero memory cap produces zero I contribution.
- Increasing the derivative time constant reduces RMS derivative effort in a seeded noisy-feedback case.
- Each guided comparison demonstrates its stated effect numerically.

| Example | Absolute error at 24 s, before → after | Peak output, before → after |
| --- | ---: | ---: |
| P 0.6 → 2.4, motor | 32.94 → 12.73 units | 37.06 → 57.27% |
| I 0 → 0.8, motor | 17.50 → 0.00 units | 52.50 → 72.80% |
| D 0 → 2, spring | 6.00 → 0.90 units | 86.98 → 69.10% |

These finite-window outcomes are specific to the example configurations. The D comparison stays below the upper travel boundary in both runs.

## Browser workflows — passed

`node tests/browser.cjs` with Playwright and Chromium 153:

- Five scenes, model controls, starter tuning and system-aware baselines.
- Pause/resume, P/I switches, schedule/noise/delay/limit settings.
- Autosave reload, JSON round trip, legacy v1 import.
- Project report with two chart images and successful browser PDF output.
- Keyboard gain control, three themes and 390px layout without horizontal overflow.
- Standalone-file offline reload and no external application requests.

## Audit regressions — passed

`node tests/audit.cjs`:

- Paused P changes agree with the current error and do not advance time.
- Zero I gain immediately clears contribution and memory.
- Paused command-limit and manual-load changes immediately update displays.
- Dragging the rotary control adjusts the gain; exact numeric entry works.
- Invalid/future imports leave the current experiment intact.
- Malformed saved settings open defaults; a recovery download preserves the exact original bytes and remains available after reload.
- Background-tab playback pauses.
- A report includes usable chart images when controller inspection is collapsed.
- Desktop tuning collapse increases usable workspace width.
- Desktop dark, light and high-contrast screenshots reviewed.
- 320px, 390px and 680px layouts have no horizontal overflow, expose the machine within the first screen, and support keyboard expansion and tuning.

No application page errors were observed in the passing runs.

## Learning workflows — passed

`node tests/learning.cjs` with Playwright and Chromium 153:

- Cold-start Easy mode; three complete guided comparisons; exact restoration of the prior setup and pinned baseline.
- Guided setup and comparison survive reload; in-progress replay uses provisional wording.
- Switching mode preserves a paused machine, clock, baseline and guide; custom hidden settings remain indicated in Easy.
- New Advanced edits work while paused without advancing time; changing the setup clears the canned guided explanation.
- v4 JSON round trip preserves the controller settings; v2 migration restores the original defaults and numerical response. The existing browser suite covers v1 migration.
- Invalid filter, weight, memory cap, mode, lesson identifier and anti-windup values are rejected without replacing the current setup.
- Reports include the active derivative filter, P weighting, integral cap and anti-windup state; PDF generation succeeds.
- Easy/Advanced keyboard workflows, all themes, and 320/390/680px layouts with the machine in the first viewport.

## Named experiments and comparisons — passed

`node tests/experiments.cjs` with Playwright and Chromium 153:

- Complete captures contain 1,200 samples; later tuning leaves stored settings and response unchanged.
- Loading reproduces the saved trace within its rounding tolerance, including seeded noise, sensor delay and a scheduled load.
- Theme/mode survive loading; editing a name then clicking Load works in one click.
- Four-overlay limit, system filtering, remembered selections, names/patterns in the legend and table rows behave correctly.
- Partial recordings and recordings changed during playback cannot be saved; Reset run enables a repeatable capture.
- Rename, removal and one-step undo preserve data; selections and records survive reload.
- Fresh start clears the shelf after confirmation; a v4 backup restores every saved record. Earlier v3 import retains the shelf; the other suites verify v1/v2 migration.
- Invalid sample counts/timing, changed targets, out-of-bound commands, duplicate names/IDs, excessive selections, invalid settings and unknown model versions reject the whole import without changing current data.
- HTML-looking names render as inert text in the shelf, legend and report. No injected image or script executes.
- Comparison reports include selected same-system responses and produce a PDF.
- A 12-record shelf refuses further captures without truncating work.
- Desktop and 320/390/680px layouts, dark/light/high contrast and keyboard selection pass. The comparison table scrolls within its region on narrow screens.

No application page errors were observed in these passing runs. Test instrumentation exposes a read-only copy of simulation data in the test server only; it is absent from the delivered application.

## Inspection, exports and recovery — passed

`node tests/inspection.cjs` with Playwright and Chromium 153:

- Home/End and arrow-key inspection read the recorded values; chart selection puts focus on the accessible slider. The physical state stays unchanged, and selecting during replay pauses the clock.
- A complete CSV contains 1,200 samples plus its header; all tested time/output/feedback/command/P/I/D/load values agree with the simulation to within 1e-8. Partial and interactively modified runs export only their observed samples and carry explicit status flags.
- PNG downloads have the fixed 1,440-pixel width and sufficient image data; a populated comparison export was visually reviewed for axes, line patterns, names, duration and footer context.
- Fresh start checkpoints include settings, all experiments and the pinned baseline. Later tuning does not mutate them. Reload and successive restore operations recover and swap the complete projects.
- Imports capture a checkpoint only after validation succeeds. Invalid JSON leaves both current project and checkpoint untouched.
- Pending saves flush on pagehide. Simulated quota errors leave prior saved bytes intact and produce a visible failure status; a session checkpoint still restores. Blocking both storage reads and writes does not prevent simulation or export controls.
- A valid checkpoint remains usable after corruption of the primary project. The original corrupt bytes remain in the separate recovery download.
- Escape closes Project and returns focus to its summary. Inspector controls and three themes work at 320, 390 and 680 pixels with no document overflow.

The six retained executable suites passed: controller, general browser, audit, learning, experiments and inspection. No application page errors were observed in the passing browser runs. Desktop and phone layouts and the PNG output were reviewed visually.

## Automated accessibility scan

axe-core 4.13.0; WCAG 2 A/AA and 2.1 AA rules; advanced controls, controller inspection, recorded-sample inspection, Project menu and the populated experiment shelf expanded. No detectable violations in Easy or Advanced across dark, light and high-contrast themes. The Quick guide modal was also checked in all three themes with no violations or incomplete checks. Graphic/canvas color contrast required manual review; semantic text labels and trace patterns remain necessary. The explicit group role on the saved-response legend remains in place. The remaining incomplete item is graphic contrast. This does not replace a screen-reader audit.

## v1.0 release gate

| Target | Result | Scope |
| --- | --- | --- |
| Numerical suite and expanded reference suite | Passed | Original controller/plant identities plus 21 closed-form cases, 45 RK4 coupling cases, convergence and metric references |
| Chromium 153.0.8010.0, Linux, Playwright 1.62.1 | Passed | Full release workflow and retained regression suites |
| Firefox 153.0 test engine | Blocked by host | Browser parent launched; creating even a blank page failed with content-process permission errors before application verification |
| WebKit 26.5 test engine | Blocked by host | Missing runtime libraries prevented launch; dependency installation failed under host permissions |
| Safari/iPhone hardware, assistive technology | Not tested | Requires follow-up on those actual targets |

`BROWSERS=chromium node tests/release.cjs` passes with the Chromium executable configured. It exercises all five systems and CSV samples, help opening/pause/keyboard closure/focus return, navigation to guided examples, saved comparisons, JSON round trips, checkpoint restoration after reload, keyboard inspection, PNG, report images/PDF, mixed-run boundary observations, three themes at 320/390/680px, and the actual standalone file with networking disabled. No application page errors or external application requests were observed. The test also compares numerical samples across engines when run successfully with more than one engine; that parity assertion remains unverified here because the other engines could not execute the app.

`node tests/references.cjs` passes all 66 expanded process cases. [VALIDATION.md](VALIDATION.md) records the observed errors, accepted bounds, assumptions and limits. Lower-inertia actuator-coupling cases show appreciable discretization sensitivity, up to 0.997148 normalized output unit in this tested set; these results are not a universal accuracy claim.

The existing controller, browser, audit, learning, experiment and inspection suites remain the regression gates. Together with references and release, there are eight executable suites. `model-harness.cjs` is support code, not a separate suite.

The Quick guide is a native modal with keyboard closure and focus restoration. Its Easy-mode entry stays out of the dense Advanced rail, where Project remains the help entry. A scroll-padding adjustment and a successful rotary-control regression address the observed overlap with the sticky toolbar after control-panel scrolling.

This is a release candidate because the cross-browser gate is incomplete. No known release-blocking application defect remains in the executed checks; host launch failures are not application passes.

## Limits

Firefox could not create a content page on this test host; a separate blank-page probe reproduced a process-permission failure. WebKit could not launch because host libraries were unavailable, and their installer could not run under the host permissions. Firefox, WebKit/Safari and a physical iPhone remain unverified. Scene labels remain small on phones; key numerical values are duplicated outside the scene. Undo removal and the one-step guide restore are session-only. The new project checkpoint persists when local storage succeeds, retains one version, and is not included in JSON exports. Checkpoints and project JSON do not store partial playback history. CSV is the current recording only; PNG and JSON can include saved comparisons. The guide restore recalculates a preview rather than resuming a prior partial recording. Hosted pages have no service-worker offline reload cache; the standalone file supports offline use. Models are normalized teaching systems with finite simulation duration and explicit process bounds.
