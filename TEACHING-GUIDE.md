# LOOPLAB teaching guide · v1.0.0-rc.1

LOOPLAB is a bench for connecting what a controller calculates to what a machine does. The core loop is **choose a system → run → change one setting → compare → explain → keep a record**. It needs no hardware, account or network connection.

Start with **How to use this bench** in Controller settings, or **Project → Quick guide**. The guide pauses playback and works offline. Close it and Resume to continue.

## A first five-minute session

1. Choose **Motor & flywheel**, then **Starter tuning**. Switching the model by itself preserves your gains; Starter tuning gives the selected model its starting settings.
2. Press **Replay**. Compare the cyan actual-output trace with the dashed green target. Watch the motor and the numerical readouts.
3. Pause. Read **Drive command** and **Delivered effort**: the first is the controller's request; the second follows through an actuator lag.
4. Choose **Reset run** for a complete 24-second preview. **Pin baseline**, change P, and compare the new actual-output trace with the purple baseline.
5. Open **Experiments**, name the complete response and save it. Use **Project → Export JSON** to keep a portable backup.

The machine is driven by the same simulation as the charts. Its decorative rotation is slowed for visibility. A full preview is already calculated when the app opens; Replay animates that calculation. It is not a live connection to real equipment.

## A short vocabulary

| Term | On this bench |
| --- | --- |
| Process / plant | The physical model: cart, chamber, tank, motor or spring |
| Target / setpoint | The output you want the process to reach |
| Actual output | The model's position, temperature range, level or speed |
| Feedback | What the sensor reports; it may contain noise or delay |
| Error | Target minus sensor feedback; the summary's Current error is the absolute difference from actual output |
| P contribution | A correction based on the present feedback and weighted target |
| I contribution | A correction based on accumulated feedback error |
| D contribution | A correction opposing the filtered rate of change of feedback |
| Drive command | P + I + D after the command limits are applied |
| Delivered effort | The actuator's lagged response to the command |
| Load | An external term in the process balance; negative values oppose positive output |
| Saturation | The requested command exceeds what the actuator is allowed to command |
| Anti-windup | Holds integration when it would push the command farther into saturation |

Outputs are normalized to 0–100% of each model's range. A value of 70 is not 70 °C, 70 RPM or 70 mm. Equal gains or loads on different models are not physically equivalent. The full equations and their assumptions are in [MODEL.md](MODEL.md).

## Three controlled comparisons

Easy mode contains three comparisons that hold the other conditions fixed. Choose one under **Guided comparisons**, select **Load comparison**, then Replay. The purple trace is the reference; the current trace changes just the named gain. **Restore prior setup** returns to the preceding setup and baseline for the current session.

| Exercise | Fixed conditions | Measured result in this model |
| --- | --- | --- |
| P · A stronger push | Motor, I = 0, D = 0; P changes 0.6 → 2.4 | Error at 24 s falls from 32.94 to 12.73 units; P alone still leaves offset |
| I · Remove the offset | Motor, P = 1.6, D = 0.12; I changes 0 → 0.8 | Error at 24 s falls from 17.50 to about 0.00 units; peak rises from 52.50 to 72.80% |
| D · Calm the motion | Spring, P = 0.8, I = 0.1; D changes 0 → 2 | Peak falls from 86.98 to 69.10%; final error falls from 6.00 to 0.90 units |

These are finite-window observations of these specific configurations. They do not say that increasing a gain always improves a controller. A stronger P can increase oscillation; I can accumulate too much correction; D can amplify noisy feedback.

Ask after each comparison:

- What changed in the first few seconds, and what changed at 24 seconds?
- Did the command hit a limit?
- Which term supplies the sustained command near the target?
- Are you comparing the same model, target and load conditions?

## Read the mechanisms

| System | Read the scene | Try next |
| --- | --- | --- |
| Motorized cart | Motor, screw and carriage translate commanded effort into travel; the target marker shows the desired position | Change inertia and observe acceleration, overshoot and end-stop contact |
| Thermal chamber | Heating and active cooling change the normalized thermal state; feedback returns to the controller | Compare two thermal inertias with the same gains |
| Water tank | A positive pump command fills the tank; gravity drainage removes water | Lower the target during playback and watch the pump coast down before drainage takes over |
| Motor & flywheel | Drive/braking effort changes speed; inertia resists speed changes | Use the P and I examples to distinguish fast response from persistent offset |
| Spring–mass–damper | Force moves a mass against a restoring spring and damping | Use the D example, then vary mechanical damping separately from controller D |

The drawings explain causal relationships. They are not calibrated mechanical drawings, wiring diagrams or component sizing tools.

## Exercise: command versus delivered effort

Choose Motor & flywheel and Starter tuning. In Advanced, increase actuator lag. Replay and pause while the output is rising. Compare drive command and delivered effort, then use **Inside the controller** to see the P/I/D contributions.

Pin a full baseline and repeat with a different lag. Keep inertia, target and gains unchanged. Record which trace moves first and how the lag changes the peak and final error. An immediate command limit change does not instantly remove effort already stored in the lagged actuator state.

## Exercise: the tank cannot pump backward

Choose Water tank and Starter tuning. Replay until the level is above 50%, then Pause. Lower the target to 20% and Resume.

Watch for a zero pump command rather than a negative command. Delivered effort can remain positive briefly because of lag. The level falls through gravity drainage; the controller cannot actively empty the tank with reverse pumping.

This recording contains a live change, so its step metrics show **Mixed run** and it cannot be saved as a repeatable experiment. **Trace CSV** preserves the samples you observed. Reset run would calculate a new run from an empty tank with the new target; it would not replay your interactive target change.

## Exercise: noisy feedback and derivative filtering

Load the D guided comparison, then choose Advanced. Set sensor noise to 2, keep delay at zero, and compare derivative filter values of 0.02 s and 0.6 s. Calculate a fresh complete response for each and inspect the controller-contribution chart.

Watch how the D contribution reacts to feedback noise. A longer filter smooths its response but also delays it; compare actual motion as well as effort. Noise uses the same fixed random seed for each new run, so repeated runs with identical settings reproduce the same sequence. Changing simulation settings clears the canned guided explanation because it no longer describes a one-gain comparison.

## Exercise: capacity and windup

Choose Water tank and Starter tuning. In Advanced, reduce command capacity to 20%. With the default drain coefficient, maximum steady inflow is 10 normalized flow units and gravity outflow at the 70% target is greater than that. The target cannot be sustained with this capacity.

Compare anti-windup on and off. Observe integral memory and the saturation indicator. With anti-windup off, memory can accumulate up to its configured cap even while more command cannot be delivered. During a replay, pause and raise capacity; observe what the stored integral does afterward. Repeat from Starter tuning for a controlled comparison.

Live capacity changes produce a mixed recording. Export its CSV before Reset run if you want to retain it. A memory cap is a numerical bound; it does not make an unreachable target reachable.

## Use the recorder carefully

**Inspect a moment** offers an ordinary keyboard slider. Arrow keys move one sample (0.02 s), Home selects the first recorded sample, and End selects the latest. Tapping the chart selects the nearest sample available at that time. Selecting pauses playback; it does not rewind the physical scene. Follow latest returns the cursor to the newest sample and Resume continues the machine.

Actual output is recorded at the end of a step. Sensor feedback, command, contributions and load describe the start of that step. Even with zero sensor delay, feedback can therefore differ from the actual output in the same row. Paused tuning can update the current controller meters without replacing the last recorded sample.

| Metric | Interpretation | Limit |
| --- | --- | --- |
| Overshoot | Highest actual output above target, divided by target | A clipped process peak can hide what an unbounded model would do |
| Rise time | Time between first 10% and 90% target crossings | A speed measure, not a stability test |
| Settling time | Start of the final uninterrupted in-band segment, with at least one second observed | Band is ±2% of target, minimum 0.5 unit; the finite recording cannot prove future settling |
| Current error | Absolute actual-output error at the recording end | Small final error does not describe the transient |
| Peak in comparison table | Greatest output as a percentage of model range | This is not the same as overshoot percentage |

An asterisk on settling means the result is provisional during playback. Scheduled events and live edits suppress step metrics. A model-boundary warning still matters when those metrics are suppressed. All simulations end after 24 simulated seconds; a process may need longer to reveal its behavior.

## Keep a useful comparison

Save only complete runs with fixed settings; a predefined timed load is allowed because it is repeatable. Keep up to 12 named experiments and select up to four overlays. Only selected responses for the current physical system are visible. Other-system selections remain remembered and count toward the four-selection limit.

Record what you held fixed: target, gains and term switches, model parameters, command capacity, lag, sensor noise/delay, loads and controller options. A changed target or model condition makes a saved overlay a different experiment even if its color looks similar.

Suggested record:

- Question: what effect are you investigating?
- Controlled change: which one setting changes?
- Fixed conditions: what remains constant?
- Observation: what do the trace, physical scene and command show?
- Interpretation: what explanation fits those observations?
- Limitation: did a bound, noise, delay or the 24-second window affect the conclusion?

## Choose an output and recover your work

| Output / action | Keeps | Does not keep |
| --- | --- | --- |
| Export JSON | Current settings, one baseline, all named experiments and selections | Partial playback history or a sequence of live changes |
| Trace CSV | Current recorded samples, P/I/D and limiting flags, partial/complete and changed-settings markers | Saved overlay samples and the full project setup |
| Chart PNG | Labeled current response, visible comparisons, final gains and recording context | A reloadable project or separate contribution plot |
| Print / PDF | Settings, assumptions, observations, metrics and both charts, plus selected comparisons | An editable simulation project |
| Restore checkpoint | Project just before the latest successful import or Fresh start; restoring swaps it with the current project | Full version history or partial-playback restoration |

Autosave is local to the browser and origin. Export JSON before moving the file, changing browser/profile or clearing storage. If storage is unavailable, the app says so; a new checkpoint may exist only in the current tab. Importing v4 replaces the shelf; earlier formats retain it. Malformed imports leave current work untouched. A damaged saved project can be downloaded as an unmodified recovery copy.

## Beyond this bench

Use LOOPLAB to form explanations and compare defined teaching models. Real tuning also depends on units, identified dynamics, sensor/actuator characteristics, sampling, constraints and the actual operating envelope. The application does not validate a physical controller. See [MODEL.md](MODEL.md), [VALIDATION.md](VALIDATION.md) and [TEST-REPORT.md](TEST-REPORT.md) for the equations and the scope of verification.
