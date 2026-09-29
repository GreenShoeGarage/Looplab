# LOOPLAB model notes · v1.0.0-rc.1

These are defined educational models, not identified models of particular equipment. All process outputs y are normalized to 0–100. Time is simulated seconds, effort is percent command capacity, and each model's load has the normalized units of its governing balance. Equal gain or load numbers across models do not imply equal physical values.

## Controller and timing

Fixed integration step: dt = 0.02 s. Preview and replay use the same step and end at 24 simulated seconds. Playback speed changes how many fixed steps are executed. Playback accumulates elapsed foreground wall time and executes fixed steps. A 0.1 s per-frame catch-up cap avoids large jumps after a stall; hidden tabs pause. Under heavy load, actual playback may still slow.

The sensor samples the process before the plant integration step. Feedback delay selects a previous sample, rounding delay/dt to the nearest step; prehistory is zero. Uniform noise in [-noise, +noise] is then added. Sensor values may extend outside 0–100 even though the actual process is bounded. Noise uses a deterministic 32-bit linear congruential generator with seed 12345, reset for every run.

- e = setpoint − sensor measurement
- P = Kp × (β × setpoint − sensor measurement); β defaults to 1 and is adjustable from 0 to 1
- Measurement rate = (current measurement − previous measurement) / dt
- Filtered rate follows `filtered += min(1, dt / τ) × (rate − filtered)`; τ defaults to 0.12 s and is adjustable from 0.02 to 1 s
- D = −Kd × filtered rate (derivative on measurement avoids target-step kick)
- I = Ki × integral memory
- Raw command = P + I + D

With anti-windup enabled (the default), the integral accumulates e × dt except when the current raw command is at/outside its command bound and the error would drive farther into that bound. With anti-windup disabled it continues accumulating even at command saturation, subject to the memory cap. Errors in the opposite direction can unwind the integral. Integral memory has a secondary bound of ±350 unit·s by default, configurable from 0 to 1000 unit·s. Lowering this cap while paused immediately clamps existing memory; a zero cap prevents any integral contribution. Disabling I or setting its gain to zero clears the memory. P and D switches zero their contribution; derivative filtering continues while D is disabled.

Command bounds are [0, capacity] for the tank pump and [-capacity, capacity] otherwise. Capacity ranges from 5% to 100%. Delivered actuator effort a follows:

`a += (command − a) × min(1, dt / (lag + 0.04))`

The minimum 0.04 s smoothing exists even when the lag slider is zero. Delivered effort is not instantaneously clipped when capacity changes during a run.

## Process equations

M is the inertia/capacity/mass control. L is the sum of the manual and scheduled external loads. All equations below describe rates before bounding y.

| Process | Governing model |
| --- | --- |
| Cart | dv/dt = (0.65a − 0.8v + L) / M; dy/dt = v |
| Chamber | dy/dt = (0.82a − 0.12y + L) / (2.3M) |
| Tank | dy/dt = (0.5a − c√y + L) / M |
| Motor | dy/dt = (1.5a − 0.8y + L) / M |
| Spring | dv/dt = (0.9a − bv − ky + L) / M; dy/dt = v |

Tank c is the drain coefficient; spring b is damping and k is stiffness. Cart and spring use semi-implicit Euler (update velocity, then position); the other plants use explicit Euler. The tank's square root is evaluated at max(0, y).

All plants are bounded to 0–100. At a cart/spring end stop, velocity is set to zero. Excess tank inflow at full level is discarded as overflow; outflow from an empty tank is bounded away. The motor's rated-speed cap is a simplifying artificial boundary, not a motor torque-speed curve. The thermal boundaries similarly limit the educational range. These constraints can conceal divergence, so reaching a boundary must not be interpreted as controller stability.

Positive load assists positive motion/heating/speed/filling. Negative load opposes it. For the motor, the load brake represents a negative external torque. For the tank, a negative load is extra outflow; it is separate from the gravity drain. The tank pump cannot reverse. Chamber negative command represents active cooling.

## Starter tuning

Loading a starter restores setpoint 70%, all PID terms enabled, full command capacity, zero noise/delay, no external load, derivative filtering of 0.12 s, P weighting of 1, a 350 unit·s memory cap, and anti-windup enabled. It preserves a pinned baseline. Switching systems alone preserves the current gains and common parameters.

| Model | Kp | Ki | Kd | M | Actuator lag | Extra parameters |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cart | 1.8 | 0.16 | 0.35 | 1.8 | 0.30 | Fixed drag 0.8 |
| Chamber | 1.8 | 0.16 | 0.35 | 1.8 | 0.30 | Fixed heat loss 0.12 |
| Tank | 2.4 | 0.50 | 0.25 | 1.5 | 0.25 | c = 2 |
| Motor | 1.6 | 0.80 | 0.12 | 2.5 | 0.12 | Fixed drag 0.8 |
| Spring | 2.0 | 0.35 | 2.0 | 1.5 | 0.12 | k = 0.35, b = 0.55 |

These are useful starting examples, not claimed optimal tunings. Changing setpoint, noise, delays, plant parameters or actuator limits can require different gains.

## Metrics and trace timing

Controller contributions and sensor feedback are calculated before a step; actual output is recorded after that step at its ending timestamp. There is therefore one 0.02 s sample offset between feedback and the plotted actual output even with zero sensor delay. Loads are annotated at their onset/removal time. Rendered spinning shafts, pump rotors and fan are schematic and slowed; state changes and actual output are not slowed independently of simulation time.

Overshoot uses the greatest actual output above target, relative to the target. Rise uses the first 10% and 90% crossings. Settling uses the final uninterrupted in-band segment, with a one-second minimum duration. These are finite-window observations, not guarantees of asymptotic stability. Live changes or a scheduled disturbance mark the run mixed and suppress those step metrics. Final error always uses actual output.

## Audit behavior in v0.6.1

The process equations and integration step are unchanged. Paused controller edits reevaluate P/I/D, saturation and command without advancing time or accumulating integral memory. Setting I to zero clears its memory immediately. Manual loads update their readout and chart marker at the paused time. Reports pause playback before capture and distinguish final setup values from a run that was modified during recording. Boundary contact is tracked and explained in the result text.


## Guided comparisons in v0.7.0

Each example runs two fresh 24-second simulations from zero state with identical model parameters. The first becomes the pinned baseline; only the named gain changes in the second. Target is 70, noise/delay/load are zero, command capacity is 100, and controller filter/weight/memory settings use their defaults. P and I examples use the motor preset; the P example sets I and D to zero. The D example uses the spring preset with P = 0.8 and I = 0.1, to avoid end-stop contact in either response.

Reported error is the absolute actual-output error at 24 seconds. Peak is maximum actual output, expressed as a percentage of the model range, not overshoot percentage. These findings describe only the specified examples. Changing any simulation setting clears the guided interpretation; it does not erase the pinned reference. Mode and theme changes leave the simulation untouched.

The v0.7 defaults reproduce the v0.6.1 controller equations and starter responses. Easy and Advanced share one simulation and state model; neither uses an approximate substitute controller.


## Saved experiments in v0.8.0

The controller and process equations are unchanged. A saved experiment contains its setup, a `modelVersion: 1` marker, boundary-contact flag and 1,200 samples covering 0.02–24.00 seconds. Stored samples contain time, actual output, command and target. Time/output/command are rounded to six decimal places for compact backups; this limits rounding discrepancy to at most 0.0000005 of the corresponding unit. Full-precision simulation remains unchanged.

Only complete runs with constant setup values can be captured; a preconfigured timed load is a deterministic part of that setup. Interactive changes during a recording are not recorded as an event sequence, so the app requires Reset run before saving those settings. Loading always starts a fresh calculation from zero physical state with the same noise seed. It does not alter the stored trace.

Saved trace overlays use actual output only. Command, feedback and target lines describe the current run. The legend and table identify each saved target separately. Only the same physical system is overlaid; different setpoints, loads or model parameters are allowed and should be considered when interpreting comparisons. Imported traces are range/time/type validated but are supplied data, not independently authenticated physical measurements.

Formats v1–v3 import as earlier setup documents and retain the current shelf. Format v4 explicitly includes and replaces it. At most 12 records and four selections are accepted. Saved records require unique names/identifiers, a recognized model version, a valid setup and a complete fixed-step trace with constant target and appropriate command bounds. Any invalid record rejects the import before changing current work.


## Recording inspection and exports in v0.9.0

The equations, fixed-step integration and project format v4 are unchanged. The response inspector indexes the existing trace; it does not resimulate or seek the physical scene. Its feedback, controller and load values describe the start of the selected step; actual output and the displayed timestamp describe its end. Editing while paused can therefore change the current controller meters without changing the last recorded sample. A new run clears the inspection cursor.

CSV uses one header row and one row per current sample. It includes model identifier; complete/partial status; a settings-changed boolean; time (s); actual output, target, sensor, command and P/I/D (%); feedback error and load (normalized model units); integral memory (unit·s); raw command (%); and saturation, held-integration and memory-cap booleans. Numeric values are rounded to nine decimal places. No saved-experiment names or arbitrary text are included. A preconfigured timed load has `settings_changed=false` because it does not involve interactive edits; the load column records its action.

PNG draws from the same trace renderer at a fixed 1,440-pixel width. It includes visible same-system saved outputs and the baseline, with names, patterns and target labels. The current target, command and sensor traces remain those of the current recording. Exported charts omit the inspection cursor and state any model boundary contact. The chart clips plotted values to its −100…110 display domain; CSV retains actual numeric values, including feedback outside that domain.

Recovery checkpoints store project data only. Restoring validates the project and recalculates the response from zero state and the initial noise seed. It cannot reconstruct a partial recording with interactive edits. The checkpoint is a separate local browser record, not a new field in JSON format v4.


## v1.0 release-candidate validation

Model and controller equations are unchanged. [VALIDATION.md](VALIDATION.md) records 21 closed-form parameter cases and 45 independent RK4 actuator/plant cases, including timestep-convergence checks and their numerical limits. This evidence concerns the defined normalized models, not identified hardware. The process-boundary observation now remains visible when mixed-run metrics are suppressed and is included in Print / PDF reports.
