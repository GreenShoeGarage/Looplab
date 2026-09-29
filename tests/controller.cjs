const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const els = {};
let callback;
const context2d = new Proxy({}, { get: () => () => {} });
function el(id) {
  return (els[id] ||= {
    value: id === "speed" ? "1" : "",
    style: { setProperty() {} },
    setAttribute() {},
    querySelector() {
      return el(Math.random());
    },
    textContent: "",
    firstChild: { textContent: "" },
    append() {},
    insertBefore() {},
    addEventListener(type, fn) {
      this[type] = fn;
    },
    getBoundingClientRect() {
      return { width: 700, height: 260 };
    },
    getContext() {
      return context2d;
    },
  });
}
const sandbox = {
  document: {
    getElementById: el,
    createElement: () => el(Math.random()),
    body: { className: "", setAttribute() {} },
  },
  localStorage: { getItem: () => null, setItem() {} },
  window: { devicePixelRatio: 1, addEventListener() {} },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: (fn) => {
    callback = fn;
    return 1;
  },
  clearInterval: () => {
    callback = null;
  },
  confirm: () => true,
  console,
};
let js = fs
  .readFileSync(require("path").join(__dirname, "../index.html"), "utf8")
  .match(/<script>([\s\S]*?)<\/script>/)[1];
js = js.replace(
  "})();",
  ";globalThis.test={get:()=>({state,trace,t,filteredD,position,integral,baseline}),run,clearSimulation,advance,initialize:y=>{position=y;actuator=0;velocity=0;previousMeasurement=y;}};})();",
);
vm.runInNewContext(js, sandbox);
const q = sandbox.test;
assert(q);
q.get().state.kd = 0;
q.run();
const noD = q.get().trace.map((p) => p.y);
q.get().state.kd = 4;
q.run();
assert(q.get().trace.some((p, i) => Math.abs(p.y - noD[i]) > 1));
assert(Number.isFinite(q.get().filteredD));
el("play").onclick();
for (let i = 0; i < 50; i++) callback();
const paused = q.get().t;
el("play").onclick();
assert(!callback);
el("play").onclick();
callback();
assert(q.get().t > paused && q.get().t < paused + 0.03);
el("kp").input({ target: { value: "3" } });
assert(q.get().t > paused);
assert(el("overshoot").textContent === "Mixed run");
for (let plant of ["cart", "heater"]) {
  q.get().state.plant = plant;
  for (let kd of [0, 4]) {
    q.get().state.kd = kd;
    q.run();
    assert(
      q
        .get()
        .trace.every(
          (p) =>
            Object.values(p).every(
              (v) => typeof v === "boolean" || Number.isFinite(v),
            ) &&
            Math.abs(p.u) <= 100 &&
            p.y >= 0 &&
            p.y <= 100,
        ),
    );
  }
}
q.get().state.kp = 0;
q.get().state.ki = 0;
q.get().state.kd = 0;
q.get().state.disturbance = 0;
q.run();
assert(q.get().trace.every((p) => p.y === 0 && p.u === 0));
console.log(
  "PASS: D changes trajectory; pause/resume preserves time; live tuning preserves time; mixed metrics; both plants finite and bounded; zero controller gives zero response.",
);

for (let key of ["pEnabled", "iEnabled", "dEnabled"]) q.get().state[key] = true;
q.get().state.kp = 8;
q.get().state.ki = 1;
q.get().state.kd = 0;
q.run();
assert(q.get().trace.some((p) => p.saturated && p.held));
assert(q.get().trace.every((p) => Math.abs(p.p + p.i + p.d - p.raw) < 1e-9));
for (let key of ["pEnabled", "iEnabled", "dEnabled"])
  q.get().state[key] = false;
q.run();
assert(
  q.get().trace.every((p) => p.p === 0 && p.i === 0 && p.d === 0 && p.u === 0),
);
q.get().state.iEnabled = true;
q.get().state.ki = 0.2;
q.run();
assert(q.get().trace.some((p) => p.i !== 0));
el("play").onclick();
callback();
el("play").onclick();
const before = q.get().t;
el("iEnabled").checked = false;
el("iEnabled").onchange();
assert(q.get().t === before);
assert(q.get().integral === 0);
assert(el("iTerm").textContent === "+0.0%");
console.log(
  "PASS: saturation/anti-windup; exact P+I+D sum; term disabling; integral reset; paused toggles preserve time.",
);
for (let k of ["pEnabled", "iEnabled", "dEnabled"]) q.get().state[k] = true;
Object.assign(q.get().state, {
  kp: 1.8,
  ki: 0.16,
  kd: 0.35,
  noise: 2,
  delay: 0,
  power: 100,
  eventEnabled: false,
  disturbance: 0,
});
q.run();
let first = q.get().trace.map((p) => p.measured);
q.run();
assert.deepStrictEqual(
  q.get().trace.map((p) => p.measured),
  first,
);
assert(
  q
    .get()
    .trace.some(
      (p, i) => i > 0 && Math.abs(p.measured - q.get().trace[i - 1].y) > 0.01,
    ),
);
Object.assign(q.get().state, { noise: 0, delay: 1 });
q.run();
assert(
  q
    .get()
    .trace.slice(0, 50)
    .every((p) => p.measured === 0),
);
assert(q.get().trace.some((p) => p.measured > 0));
Object.assign(q.get().state, {
  delay: 0,
  power: 20,
  eventEnabled: true,
  eventStart: 8,
  eventDuration: 4,
  eventLoad: -12,
});
q.run();
assert(q.get().trace.every((p) => Math.abs(p.u) <= 20));
assert(
  q
    .get()
    .trace.filter((p) => p.t < 8)
    .every((p) => p.load === 0),
);
assert(
  q
    .get()
    .trace.filter((p) => p.t > 8.03 && p.t < 12)
    .every((p) => p.load === -12),
);
assert(
  q
    .get()
    .trace.filter((p) => p.t > 12.03)
    .every((p) => p.load === 0),
);
assert(q.get().trace.some((p) => p.saturated && p.held));
console.log(
  "PASS: seeded noise reproducibility; sensor noise applied; one-second feedback delay; scheduled event onset/end; reduced command limits with anti-windup.",
);
for (let plant of ["cart", "heater", "tank", "motor", "spring"]) {
  q.get().state.plant = plant;
  el("starter").onclick();
  assert(
    q
      .get()
      .trace.every((p) =>
        Object.values(p).every(
          (v) => typeof v === "boolean" || Number.isFinite(v),
        ),
      ),
  );
  assert(
    Math.abs(q.get().position - 70) < 6,
    plant + " starter must approach target",
  );
  console.log(plant + " starter final: " + q.get().position.toFixed(3));
}
Object.assign(q.get().state, { plant: "tank", setpoint: 90 });
el("starter").onclick();
let initialLevel = q.get().position;
for (let k of ["pEnabled", "iEnabled", "dEnabled"]) q.get().state[k] = false;
for (let n = 0; n < 200; n++) q.advance(0.02);
assert(q.get().position < initialLevel);
assert(q.get().trace.every((p) => p.u >= 0));
Object.assign(q.get().state, {
  plant: "motor",
  inertia: 2.5,
  lag: 0,
  disturbance: 12,
  eventEnabled: false,
  pEnabled: false,
  iEnabled: false,
  dEnabled: false,
});
q.clearSimulation();
for (let n = 0; n < 250; n++) q.advance(0.02);
let analytic = (12 / 0.8) * (1 - Math.exp((-0.8 * 5) / 2.5));
assert(
  Math.abs(q.get().position - analytic) < 0.025,
  "motor agrees with analytic first-order response",
);
Object.assign(q.get().state, {
  plant: "spring",
  inertia: 1,
  stiffness: 0.35,
  damping: 0.05,
  disturbance: 12,
  noise: 0,
  delay: 0,
});
q.clearSimulation();
for (let n = 0; n < 1200; n++) q.advance(0.02);
const lowDamping = q.get().trace.map((p) => p.y);
assert(
  Math.max(...lowDamping) > (12 / 0.35) * 1.5,
  "low damping overshoots spring equilibrium",
);
q.get().state.damping = 2;
q.clearSimulation();
for (let n = 0; n < 1200; n++) q.advance(0.02);
assert(
  Math.max(...q.get().trace.map((p) => p.y)) < Math.max(...lowDamping) - 15,
  "damping reduces spring overshoot",
);
console.log(
  "PASS: five usable presets; tank only fills and drains naturally; motor analytical reference; spring restoring force and damping.",
);

// Independent closed-form checks for the process equations (no active controller).
Object.assign(q.get().state, {
  plant: "heater",
  inertia: 1.8,
  lag: 0,
  disturbance: 12,
  eventEnabled: false,
  noise: 0,
  delay: 0,
  pEnabled: false,
  iEnabled: false,
  dEnabled: false,
});
q.clearSimulation();
for (let n = 0; n < 250; n++) q.advance(0.02);
let heatExact = 100 * (1 - Math.exp((-0.12 * 5) / (1.8 * 2.3)));
assert(
  Math.abs(q.get().position - heatExact) < 0.01,
  "thermal model follows the first-order closed-form response",
);
Object.assign(q.get().state, {
  plant: "tank",
  inertia: 1.5,
  drain: 2,
  disturbance: 0,
});
q.clearSimulation();
q.initialize(64);
for (let n = 0; n < 100; n++) q.advance(0.02);
let tankExact = (8 - (2 * 2) / (2 * 1.5)) ** 2;
assert(
  Math.abs(q.get().position - tankExact) < 0.03,
  "gravity draining follows square-root closed form",
);
Object.assign(q.get().state, {
  plant: "spring",
  inertia: 1.5,
  stiffness: 0.35,
  damping: 0.55,
});
q.clearSimulation();
q.initialize(20);
for (let n = 0; n < 50; n++) q.advance(0.02);
let alpha = 0.55 / (2 * 1.5),
  omega = Math.sqrt(0.35 / 1.5 - alpha ** 2),
  springExact =
    20 *
    Math.exp(-alpha) *
    (Math.cos(omega) + (alpha / omega) * Math.sin(omega));
assert(
  Math.abs(q.get().position - springExact) < 0.06,
  "spring free response follows damped oscillator solution",
);
console.log(
  "PASS: independent thermal, nonlinear tank-drain, and damped-spring reference solutions.",
);

// Independent controller identities and qualitative effects for v0.7 controls.
q.get().state.plant = "motor";
el("starter").onclick();
Object.assign(q.get().state, {
  kp: 1,
  ki: 0,
  kd: 0,
  setpoint: 30,
  setpointWeight: 0.4,
});
q.clearSimulation();
q.advance(0.02);
assert.equal(q.get().trace[0].p, 12, "weighted P acts on beta*r-y");
Object.assign(q.get().state, { kp: 0, ki: 0.5, setpointWeight: 0 });
q.clearSimulation();
q.advance(0.02);
assert.equal(q.get().trace[0].i, 0.3, "I still integrates full target error");

Object.assign(q.get().state, {
  kp: 8,
  ki: 2,
  setpoint: 90,
  power: 5,
  setpointWeight: 1,
  integralLimit: 20,
  antiWindup: true,
});
q.run();
assert(q.get().trace.some((p) => p.held));
assert.equal(q.get().integral, 0);
q.get().state.antiWindup = false;
q.run();
assert(q.get().trace.every((p) => !p.held && Math.abs(p.memory) <= 20));
assert.equal(
  q.get().integral,
  20,
  "cap applies even without conditional anti-windup",
);
q.get().state.integralLimit = 0;
q.run();
assert(q.get().trace.every((p) => p.i === 0 && p.memory === 0));

el("starter").onclick();
Object.assign(q.get().state, {
  kp: 0,
  ki: 0,
  kd: 2,
  noise: 2,
  derivativeFilter: 0.02,
});
q.run();
const rms = (data) =>
  Math.sqrt(data.reduce((sum, p) => sum + p.d * p.d, 0) / data.length);
const fastNoise = rms(q.get().trace);
q.get().state.derivativeFilter = 0.6;
q.run();
assert(
  rms(q.get().trace) < fastNoise / 5,
  "longer derivative filter reduces noisy derivative effort",
);
console.log(
  "PASS: weighted proportional identity; full-error integral; anti-windup toggle; configurable and zero memory caps; derivative noise filtering.",
);

for (const lesson of ["p", "i", "d"]) {
  el("lessonSelect").value = lesson;
  el("loadLesson").onclick();
  const { trace, baseline, state } = q.get();
  const peak = (arr) => Math.max(...arr.map((p) => p.y));
  const error = (arr) => Math.abs(arr.at(-1).s - arr.at(-1).y);
  assert.equal(state.lessonId, lesson);
  if (lesson === "p") assert(error(trace) < error(baseline) - 10);
  if (lesson === "i") assert(error(trace) < 1 && error(baseline) > 10);
  if (lesson === "d") assert(peak(trace) < peak(baseline) - 10);
  console.log(
    `Guided ${lesson.toUpperCase()}: final error ${error(baseline).toFixed(2)} → ${error(trace).toFixed(2)}; peak ${peak(baseline).toFixed(2)} → ${peak(trace).toFixed(2)}.`,
  );
}
