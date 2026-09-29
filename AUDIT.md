# LOOPLAB quality audit · v0.6.1

Scope: review the existing v0.6.0 instrument for functional correctness, understandable workflows, and visual quality. No new models or learning modules were added.

## Findings and resolution

| Priority | Finding | Resolution | Evidence / confidence |
| --- | --- | --- | --- |
| P0 | A malformed saved model name caused a startup exception and left the tool unusable. | Validate saved state before use. Open defaults on failure; preserve the original JSON in a recovery copy and expose a download. | Reproduced in Chromium; cold-start and byte-for-byte recovery tests pass. High. |
| P1 | Changing a gain while paused updated the setting but left P/I/D meters and commanded effort stale. | Centralized the current controller calculation; reevaluate without advancing time. Zero I gain immediately clears its memory. | Paused numeric edits, limit changes and zero-I tests pass. High. |
| P1 | Imports did not reject future schema versions and only loosely validated baseline samples. | Validate known v1/v2 formats, strict numeric/boolean types, bounds and monotonic sample times before replacing state. Reject files over 2 MB. | Invalid-version, negative-inertia, out-of-window baseline and string-payload imports preserve the experiment. High. |
| P2 | Manual load changes while paused did not immediately update the load readout. | Update the displayed load and transition marker at the current simulation time. | Paused-load test passes without advancing time. High. |
| P2 | Reports could capture a running recording without clearly identifying its time or changed configuration. | Pause before capture, show elapsed time and state whether setup values changed midstream. Render the contribution chart even with the inspection panel closed. | Report popup, both image dimensions and PDF generation checked. High. |
| P2 | Early playback text could imply the full 24-second observation window had elapsed. | Add explicit run state and clock; use in-progress text and provisional settling notation. Explain process boundary contact. | Browser state checks and code review. High. |
| P2 | Phone users had to scroll through the full control bench before seeing a machine. | Collapse tuning on phones and prioritize the physical scene. Keep playback accessible while scrolling. | First-screen machine and no horizontal overflow at 320/390/680px. High. |
| P2 | Rotary knobs looked interactive but were decorative; gains lacked direct numeric entry. | Connect vertical knob dragging to the gain; add exact numeric inputs and keep native keyboard sliders. | Drag, numeric and keyboard browser checks. High. |
| P2 | Project actions were buried in model settings, while all secondary details occupied the main workspace. | Separate Project actions, group advanced parameters, and collapse controller inspection. Collapsing desktop tuning reclaims width. | Desktop/phone workflow and screenshot review. Medium–high. |
| P2 | Light-theme trace swatches had poor separation from the page surface. | Keep chart legends on a dark instrument surface in all themes; retain text and line patterns. | Screenshot review and automated scan. Medium–high. |

## Simulation assessment

The existing process equations remain useful as explicitly normalized educational models. No claim is made that they identify or calibrate a particular machine. Four independent mathematical references were checked:

- Motor first-order response under constant external load.
- Chamber first-order thermal response.
- Nonlinear gravity draining of the tank.
- Damped spring free response before any end-stop contact.

All pass the documented numerical tolerances. Additional tests cover command limits, conditional anti-windup, disabled terms, repeatable noise, feedback delay, disturbance timing and all five starter configurations. Hard process bounds remain a modeling assumption; the UI now calls out contact rather than presenting bounded motion as proof of stability.

## UI review

The revised hierarchy is **choose the system → tune → watch → inspect**. The physical scene and response recorder have priority. Secondary controller details are available in one expandable panel. The appearance uses a consistent dark instrument face, readable light and high-contrast themes, restrained accent color, smaller tactile knobs, consistent control sizes, and aligned numerical readouts.

The phone layout puts the machine within the first viewport. Desktop tuning can be collapsed to expand the workspace. The labels inside the mechanical drawings remain small on narrow phones, but the process, command, feedback and load values are repeated in readable text outside the drawing.

## Verification limits and next checkpoint

Headless Chromium 153 was used for functional and layout checks. An axe-core 4.13.0 scan with WCAG 2 A/AA and 2.1 AA tags reported no detectable violations in the tested dark, light and contrast states. Canvas/graphic contrast remained an incomplete/manual-review item. This is not a full accessibility certification.

Remaining checks are Safari/Firefox, a physical iPhone, screen-reader behavior, and longer-duration or hardware-derived model validation. These are stated limits, not evidence of a known failure. See TEST-REPORT.md for the executed tests. Further feature work should use this reviewed build as its baseline.


## v0.7.0 follow-up

The functional fixes above remain in place, with the numerical, workflow and audit regression suites rerun. New release checks are recorded in TEST-REPORT.md.

| Review item | Resolution | Confidence |
| --- | --- | --- |
| Guided D example initially contacted the upper travel limit | Lowered its fixed P/I gains so both comparison traces remain within the process range | High; simulated peaks checked |
| A long Advanced rail spread the machine and recorder apart | Limit the desktop control rail height and allow scrolling inside it; keep normal phone page flow | High; screenshots and keyboard workflows checked |
| Easy view could conceal custom physics/controller settings | Preserve every setting and show an explicit custom-setup reminder | High; mode/reload tests |
| Guides could imply a valid controlled comparison after manual edits | Clear guided interpretation on simulation changes; retain the pinned reference trace for free tuning | High; browser tests |

Automated accessibility scanning covered both modes and all three themes with no detectable violations. Graphic contrast and screen-reader behavior still require manual review. Cross-browser and physical-device limits remain as described above.


## v0.8.0 follow-up

| Review item | Resolution | Confidence |
| --- | --- | --- |
| Saving a partial or interactively modified recording could imply it was repeatable | Capture requires a complete fixed-setup run; planned timed loads remain supported | High; capture gating and noisy/event replay checks |
| Rename-on-blur could replace a Load button before the click completed | Rename updates labels and overlays without replacing the row's interactive controls | High; single-click browser regression |
| A generic legend element had an unsupported accessible label | Give the saved-response legend an explicit group role | High; targeted accessibility recheck |
| Older project imports have no shelf and could erase later saved work | Preserve the shelf for v1–v3 imports; v4 and Fresh start explicitly replace or clear it | High; import, round-trip and reset checks |

The numerical reference, general browser, learning and earlier audit suites pass. TEST-REPORT.md records new shelf checks and continuing cross-browser/device limits.


## v0.9.0 follow-up

| Review item | Resolution | Confidence |
| --- | --- | --- |
| Canvas traces lacked an equivalent way to read arbitrary samples with a keyboard | Added a native time slider, labeled numerical values and a chart cursor; inspection leaves physical state fixed | High; exact sample comparisons, focus and pause checks |
| A bare chart image would omit recording and overlay context | PNG includes system, duration, final gains, line-pattern legend, visible saved targets, axes and model limitations | High; download checks and visual review |
| Fresh start or an import could replace saved work without an in-app recovery path | Keep one validated, detached, swappable project checkpoint; show date and persistence status | High; shelf/baseline reload, swap and invalid-import checks |
| Leaving during the save debounce could lose the latest edit | Flush pending writes on pagehide or hidden-tab transition | High; immediate pagehide regression |
| Quota/security errors could imply that data had been persisted | Retain prior stored bytes, report failure and label any new checkpoint as session-only | High; injected quota and security failures |
| Phone inspection must remain usable without expanding the whole control rail | Keep inspection inside the recorder, use two-column values on narrow screens and native touch controls | High; 320/390/680px workflows and visual review |

The model responses remain unchanged. Automated checks do not substitute for a full screen-reader audit or physical-device/cross-browser testing; these remain v1.0 work.


## v1.0.0-rc.1 release review

| Finding | Severity / confidence | Resolution / status |
| --- | --- | --- |
| Mixed-run metric suppression hid the process-boundary observation | P1 / high | Preserve it in the machine interpretation and Print / PDF report; browser regression passes |
| Basic help was dispersed across controls and separate files | P2 / high | Added a compact offline Quick guide that pauses playback and links into existing examples; native modal focus and closure checked |
| Adding help to the Advanced rail changed scrolling and let an automated knob target sit under the sticky toolbar | P2 / high | Keep the inline entry in Easy, retain Project help in both modes, add scroll padding; existing drag regression passes |
| The numerical references did not cover cart motion or the full actuator/plant coupling | P2 / high | Added 21 closed-form parameter cases and 45 independent RK4 coupling cases with convergence checks |
| Firefox/WebKit coverage was incomplete | Release gate / high | Attempted both engines; host process permissions and missing libraries prevented app execution. Deliver as v1.0.0-rc.1 with runnable follow-up tests |

Primary workflow remains choose → run → change → compare → explain → export. No additional physical models or tuning mechanisms were added. Current data and v1–v4 import compatibility are preserved. Feature development is frozen for this candidate; the remaining stable-release work is browser verification and any resulting repairs. Physical-device and assistive-technology review remain explicitly unverified.
