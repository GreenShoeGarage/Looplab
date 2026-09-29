# LOOPLAB model validation · v1.0.0-rc.1

This verifies the implementation of LOOPLAB's defined educational models. It is not validation against measured equipment. Production integration remains at 0.02 s; all previous starter responses and project formats are preserved.

## Independent checks

`node tests/references.cjs` uses the shipped simulation through a DOM-free harness. Test-only access is absent from the delivered HTML.

The first group covers 21 closed-form cases. Inertia/capacity/mass is 0.5, 1.5 or 4. Cart, motor and chamber receive a constant load of 12 with PID disabled and zero actuator effort. The tank drains from level 64 with drain coefficient 2. Spring free response starts at displacement 20, stiffness 0.35, and damping 0.1, 0.55 or 1.8. Each case runs for two seconds and stays away from process bounds.

| Model | Closed-form reference | Maximum observed absolute output error at dt = 0.02 s | Accepted bound |
| --- | --- | ---: | ---: |
| Cart | Constant-force motion with linear velocity drag | 0.268916 | 0.30 |
| Chamber | First-order thermal response | 0.017698 | 0.10 |
| Tank | Square-root gravity drainage | 0.111268 | 0.25 |
| Motor | First-order speed response | 0.031168 | 0.15 |
| Spring | Damped oscillator, including underdamped and overdamped cases | 0.162987 | 0.25 |

Errors are normalized output units on the 0–100 model range. Repeating at dt = 0.005 s reduces every error to less than 35% of its production-step value. These closed forms are calculated independently of the app's discrete update sequence.

## Actuator and process coupling

The second group covers 45 cases: each of five models, inertia/mass 0.5, 2 or 4, and actuator lag 0.12, 0.3 or 1 s. Initial output is 30, velocity is zero and delivered effort is 40%. With the PID disabled, command becomes zero and delivered effort decays into the plant. Runs last one second with no noise, delay, loads or boundary contact.

An independent fourth-order Runge–Kutta reference integrates the continuous differential balances with a 0.00025 s timestep. It includes the actuator state and each plant's coupling coefficient. Production Euler/semi-implicit Euler results are compared with this reference and repeated at dt = 0.005 s to check convergence.

| Model | Maximum observed output difference at dt = 0.02 s |
| --- | ---: |
| Cart | 0.404969 |
| Chamber | 0.522141 |
| Tank | 0.625840 |
| Motor | 0.997148 |
| Spring | 0.786882 |

Every tested production-step difference is below 1 normalized output unit. Every finer-step difference is below 40% of the coarse difference (with a 0.0001 numerical floor). The finer-step actuator state also agrees with its exponential decay within 0.15 effort unit.

The largest error is close to the one-unit bound in a low-inertia motor case. This is useful evidence of discretization sensitivity. These limits are test-case acceptance bounds, not a universal accuracy guarantee for every controller, parameter combination or duration. Noise, feedback delay, saturation and discontinuous boundary contacts are covered by separate behavioral tests; they are intentionally excluded from this smooth convergence comparison.

## Controller and metric checks

`tests/controller.cjs` retains the independent motor/chamber/tank/spring references, contribution identities, weighted proportional behavior, full-error integral action, saturation, anti-windup, memory caps, seeded noise, sensor delay, event timing, disabled-term behavior and guided-example comparisons.

`tests/references.cjs` additionally checks finite-window settling, re-entry following an excursion, overshoot, and suppression of step metrics for scheduled or interactively modified runs. The browser release suite verifies that a model-boundary warning survives that suppression and appears in the report.

## Interpretation and evidence limits

- The default starter outputs after 24 seconds remain cart 68.725, chamber 71.885, tank 69.998, motor 70.000 and spring 69.931.
- Process bounds are deliberate. They can hide unbounded divergence; hitting one is not evidence of controller stability.
- The synthetic models have no calibration or uncertainty estimate tied to real hardware.
- The 24-second observation window cannot establish asymptotic stability.
- Browser-engine numerical parity is evaluated separately in [TEST-REPORT.md](TEST-REPORT.md).

Validation confidence is high for the enumerated deterministic checks. Generalization to untested conditions or physical equipment is outside this release's claims.
