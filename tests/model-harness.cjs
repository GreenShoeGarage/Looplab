// DOM-free access to the shipped simulation; instrumentation never enters index.html.
const fs = require("fs"),
  vm = require("vm"),
  path = require("path");
module.exports = function createModel() {
  const elements = {};
  const ctx = new Proxy({}, { get: () => () => {} });
  const el = (id) =>
    (elements[id] ||= {
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
      addEventListener() {},
      getBoundingClientRect() {
        return { width: 700, height: 260 };
      },
      getContext() {
        return ctx;
      },
    });
  const sandbox = {
    document: {
      getElementById: el,
      createElement: () => el(Math.random()),
      body: { setAttribute() {} },
    },
    localStorage: { getItem: () => null, setItem() {} },
    window: { devicePixelRatio: 1, addEventListener() {} },
    setTimeout() {},
    clearTimeout() {},
    setInterval() {},
    clearInterval() {},
    confirm: () => true,
    console,
  };
  let js = fs
    .readFileSync(path.join(__dirname, "../index.html"), "utf8")
    .match(/<script>([\s\S]*?)<\/script>/)[1];
  js = js.replace(
    "})();",
    "globalThis.model={get:()=>({state,trace,t,position,velocity,actuator}),reset:config=>{state={...defaults,...config};clearSimulation()},initialize:(y,v=0,a=0)=>{position=y;velocity=v;actuator=a;previousMeasurement=y},advance,stats:experimentStats};})();",
  );
  vm.runInNewContext(js, sandbox);
  return sandbox.model;
};
