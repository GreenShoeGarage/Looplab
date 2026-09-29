const assert = require("assert");
const model = require("./model-harness.cjs")();
const passive = {
  pEnabled: false,
  iEnabled: false,
  dEnabled: false,
  noise: 0,
  delay: 0,
  eventEnabled: false,
};
function simulate(config, initial, duration, dt) {
  model.reset({ ...passive, ...config });
  model.initialize(...initial);
  for (let n = 0; n < Math.round(duration / dt); n++) model.advance(dt);
  return model.get();
}
const observed = {};
// Closed-form, unclipped process solutions over a mass/capacity sweep.
for (const mass of [0.5, 1.5, 4]) {
  const time = 2,
    force = 12;
  const cases = [
    {
      plant: "cart",
      initial: 0,
      exact:
        (force / 0.8) *
        (time - (mass / 0.8) * (1 - Math.exp((-0.8 * time) / mass))),
      limit: 0.3,
    },
    {
      plant: "motor",
      initial: 0,
      exact: (force / 0.8) * (1 - Math.exp((-0.8 * time) / mass)),
      limit: 0.15,
    },
    {
      plant: "heater",
      initial: 0,
      exact: (force / 0.12) * (1 - Math.exp((-0.12 * time) / (2.3 * mass))),
      limit: 0.1,
    },
    {
      plant: "tank",
      initial: 64,
      exact: (8 - (2 * time) / (2 * mass)) ** 2,
      limit: 0.25,
      load: 0,
    },
  ];
  // General damped oscillator solution includes under- and overdamped cases.
  for (const damping of [0.1, 0.55, 1.8]) {
    const alpha = damping / (2 * mass),
      discriminant = alpha * alpha - 0.35 / mass;
    const term =
      discriminant < 0
        ? Math.cos(Math.sqrt(-discriminant) * time) +
          (alpha / Math.sqrt(-discriminant)) *
            Math.sin(Math.sqrt(-discriminant) * time)
        : Math.cosh(Math.sqrt(discriminant) * time) +
          (alpha / Math.sqrt(discriminant)) *
            Math.sinh(Math.sqrt(discriminant) * time);
    cases.push({
      plant: "spring",
      initial: 20,
      exact: 20 * Math.exp(-alpha * time) * term,
      limit: 0.25,
      load: 0,
      damping,
    });
  }
  for (const c of cases) {
    const config = {
      plant: c.plant,
      inertia: mass,
      disturbance: c.load ?? force,
      drain: 2,
      stiffness: 0.35,
      damping: c.damping ?? 0.55,
    };
    const coarse = Math.abs(
      simulate(config, [c.initial], time, 0.02).position - c.exact,
    );
    const fine = Math.abs(
      simulate(config, [c.initial], time, 0.005).position - c.exact,
    );
    assert(
      coarse < c.limit,
      `${c.plant} M=${mass} error ${coarse} exceeds ${c.limit}`,
    );
    assert(
      fine < coarse * 0.35,
      `${c.plant} must converge with smaller timestep`,
    );
    observed[c.plant] = Math.max(observed[c.plant] || 0, coarse);
  }
}
console.log(
  "PASS: 21 closed-form process cases; error decreases with timestep. Max output errors:",
  observed,
);
// Independent continuous-time RK4 reference for delivered-effort decay and plant coupling.
// State vector = [output, velocity, delivered effort]; all tests remain away from bounds.
const balances = {
  cart: ([y, v, a], m) => [v, (0.65 * a - 0.8 * v) / m],
  heater: ([y, v, a], m) => [(0.82 * a - 0.12 * y) / (2.3 * m), 0],
  tank: ([y, v, a], m) => [(0.5 * a - 2 * Math.sqrt(y)) / m, 0],
  motor: ([y, v, a], m) => [(1.5 * a - 0.8 * y) / m, 0],
  spring: ([y, v, a], m) => [v, (0.9 * a - 0.55 * v - 0.35 * y) / m],
};
function rk4(plant, mass, lag) {
  let x = [30, 0, 40];
  const h = 0.00025;
  const derivative = (s) => [...balances[plant](s, mass), -s[2] / (lag + 0.04)];
  for (let n = 0; n < 4000; n++) {
    const k1 = derivative(x),
      k2 = derivative(x.map((v, i) => v + (h * k1[i]) / 2));
    const k3 = derivative(x.map((v, i) => v + (h * k2[i]) / 2)),
      k4 = derivative(x.map((v, i) => v + h * k3[i]));
    x = x.map((v, i) => v + (h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) / 6);
  }
  return x;
}
const coupling = {};
for (const plant of Object.keys(balances))
  for (const inertia of [0.5, 2, 4])
    for (const lag of [0.12, 0.3, 1]) {
      const exact = rk4(plant, inertia, lag),
        config = {
          plant,
          inertia,
          lag,
          stiffness: 0.35,
          damping: 0.55,
          drain: 2,
        };
      const coarse = simulate(config, [30, 0, 40], 1, 0.02),
        coarseOutput = coarse.position;
      assert(
        coarse.trace.every((p) => p.y > 0 && p.y < 100),
        "reference must not test clipping",
      );
      const fine = simulate(config, [30, 0, 40], 1, 0.005);
      const error = Math.abs(coarseOutput - exact[0]);
      assert(
        error < 1,
        `${plant} actuator/plant reference error ${error} exceeds 1 normalized unit`,
      );
      assert(
        Math.abs(fine.position - exact[0]) < Math.max(0.0001, error * 0.4),
        `${plant} actuator/plant must converge`,
      );
      assert(
        Math.abs(fine.actuator - 40 * Math.exp(-1 / (lag + 0.04))) < 0.15,
        "actuator decay convergence",
      );
      coupling[plant] = Math.max(coupling[plant] || 0, error);
    }
console.log(
  "PASS: 45 actuator/plant RK4 cases; no boundaries; timestep convergence. Max output errors:",
  coupling,
);
// Metrics have explicit finite-window meaning, including re-entry after an excursion.
const trace = Array.from({ length: 1200 }, (_, i) => ({
  t: (i + 1) * 0.02,
  y: i < 99 ? 0 : 70,
}));
let stats = model.stats(trace, { setpoint: 70, eventEnabled: false });
assert.equal(stats.settle, 2);
assert.equal(stats.error, 0);
assert.equal(stats.overshoot, 0);
trace[1150].y = 72;
stats = model.stats(trace, { setpoint: 70, eventEnabled: false });
assert.equal(stats.settle, null);
trace[1150].y = 70;
trace[500].y = 84;
stats = model.stats(trace, { setpoint: 70, eventEnabled: false });
assert.equal(stats.overshoot, 20);
assert(Math.abs(stats.settle - 10.04) < 1e-10);
assert.equal(
  model.stats(trace, { setpoint: 70, eventEnabled: true }).step,
  false,
);
assert.equal(
  model.stats(trace, { setpoint: 70, eventEnabled: false }, true).step,
  false,
);
console.log(
  "PASS: finite-window settling, re-entry, overshoot and scheduled/mixed metric flags.",
);
