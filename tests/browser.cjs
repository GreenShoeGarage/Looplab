const { chromium } = require("playwright"),
  http = require("http"),
  fs = require("fs"),
  assert = require("assert");
const path = require("path"),
  os = require("os");
const root = path.resolve(__dirname, "..");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "looplab-check-"));
console.log("Artifacts:", artifacts);
const errors = [],
  requests = [];
let server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(fs.readFileSync(root + "/index.html"));
});
async function range(p, id, value) {
  await p.locator("#" + id).fill(String(value));
}
server.listen(0, "127.0.0.1", async () => {
  const baseUrl = "http://127.0.0.1:" + server.address().port + "/";
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.BROWSER_EXECUTABLE
        ? { executablePath: process.env.BROWSER_EXECUTABLE }
        : {}),
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => requests.push(r.url()));
    p.on("dialog", (d) => {
      console.log("DIALOG", d.message());
      d.accept();
    });
    await p.goto(baseUrl);
    await p.locator("#advancedMode").click();
    for (let plant of ["cart", "heater", "tank", "motor", "spring"]) {
      await p.locator("#plant").selectOption(plant);
      await p.locator("#starter").click();
      if (["tank", "spring"].includes(plant)) {
        if (!(await p.locator("#advanced").isVisible()))
          await p.locator("#advancedPanel > summary").click();
        let id = plant === "tank" ? "drain" : "stiffness";
        let prior = await p.locator("#chart").evaluate((c) => c.toDataURL());
        await range(p, id, plant === "tank" ? 4 : 0.9);
        assert.notEqual(
          await p.locator("#chart").evaluate((c) => c.toDataURL()),
          prior,
        );
        if (plant === "spring") await range(p, "damping", 2);
        await p.locator("#starter").click();
        await p.locator("#advancedPanel > summary").click();
      }
      assert.equal(await p.locator("#" + plant + "Scene").isVisible(), true);
      await p
        .locator("#machine")
        .screenshot({ path: artifacts + "/" + plant + ".png" });
      assert(Number.parseFloat(await p.locator("#readout").innerText()) > 60);
    }
    console.log("PASS: all five models load and render without page errors.");
    await p.locator("#plant").selectOption("motor");
    await p.locator("#starter").click();
    await p.locator("#baseline").click();
    await p.locator("#plant").selectOption("tank");
    assert((await p.locator("#baselineNote").innerText()).includes("hidden"));
    await p.locator("#plant").selectOption("motor");
    assert((await p.locator("#baselineNote").innerText()).includes("shown"));
    await p.locator("#play").click();
    await p.waitForTimeout(300);
    await p.locator("#play").click();
    const paused = await p.locator("#readout").innerText();
    await p.waitForTimeout(100);
    assert.equal(await p.locator("#readout").innerText(), paused);
    await p.locator("#play").click();
    await p.waitForTimeout(200);
    await p.locator("#play").click();
    assert.notEqual(await p.locator("#readout").innerText(), paused);
    await p.locator("#inspector > summary").click();
    await p.locator("#pEnabled").uncheck();
    assert.equal(await p.locator("#pTerm").innerText(), "+0.0%");
    await p.locator("#iEnabled").uncheck();
    assert.equal(await p.locator("#iTerm").innerText(), "+0.0%");
    await p.locator("#starter").click();
    await p.locator("#advancedPanel > summary").click();
    await range(p, "noise", 1.2);
    await range(p, "delay", 0.4);
    await range(p, "power", 35);
    await p.locator("#eventEnabled").check();
    await range(p, "eventStart", 6);
    await range(p, "eventDuration", 3);
    await range(p, "eventLoad", -8);
    await p.waitForFunction(
      () => document.getElementById("save").textContent === "Saved locally",
    );
    await p.reload();
    assert.equal(await p.locator("#noise").inputValue(), "1.2");
    assert.equal(await p.locator("#delay").inputValue(), "0.4");
    assert(await p.locator("#eventEnabled").isChecked());
    await p.locator("#advancedPanel > summary").click();
    await p.locator("#projectMenu > summary").click();
    const downloadPromise = p.waitForEvent("download");
    await p.locator("#export").click();
    let download = await downloadPromise;
    await download.saveAs(artifacts + "/looplab-roundtrip.json");
    let data = JSON.parse(
      fs.readFileSync(artifacts + "/looplab-roundtrip.json"),
    );
    assert.equal(data.state.plant, "motor");
    assert.equal(data.baselinePlant, "motor");
    await p.locator("#reset").click();
    await p
      .locator("#importFile")
      .setInputFiles(artifacts + "/looplab-roundtrip.json");
    await p.waitForFunction(
      () => document.getElementById("plant").value === "motor",
    );
    assert.equal(await p.locator("#plant").inputValue(), "motor");
    assert.equal(await p.locator("#noise").inputValue(), "1.2");
    console.log(
      "PASS: pause/resume, switches, baselines, schedule, autosave reload, JSON round trip.",
    );
    let old = {
      format: "looplab-project",
      version: 1,
      state: {
        plant: "heater",
        setpoint: 70,
        kp: 1.8,
        ki: 0.16,
        kd: 0.35,
        inertia: 1.8,
        lag: 0.3,
      },
      baseline: null,
    };
    fs.writeFileSync(artifacts + "/looplab-legacy.json", JSON.stringify(old));
    await p
      .locator("#importFile")
      .setInputFiles(artifacts + "/looplab-legacy.json");
    await p.waitForFunction(
      () => document.getElementById("plant").value === "heater",
    );
    assert.equal(await p.locator("#plant").inputValue(), "heater");
    assert.equal(await p.locator("#noise").inputValue(), "0");
    await p.locator("#plant").selectOption("spring");
    await p.locator("#starter").click();
    if (!(await p.locator("#report").isVisible()))
      await p.locator("#projectMenu > summary").click();
    let pop = p.waitForEvent("popup");
    await p.locator("#report").click();
    const report = await pop;
    await report.waitForLoadState();
    assert(
      (await report.locator("body").innerText()).includes("Spring–mass–damper"),
    );
    assert.equal(await report.locator("img").count(), 2);
    await report.pdf({
      path: artifacts + "/looplab-report.pdf",
      format: "A4",
      printBackground: true,
    });
    await report.screenshot({
      path: artifacts + "/looplab-report.png",
      fullPage: true,
    });
    await report.close();
    await p.locator("#advancedPanel > summary").click();
    await p.locator("#kp").focus();
    let before = Number(await p.locator("#kp").inputValue());
    await p.keyboard.press("ArrowRight");
    assert(Number(await p.locator("#kp").inputValue()) > before);
    for (let theme of ["dark", "light", "contrast"]) {
      await p.locator("#theme").selectOption(theme);
      assert.equal(
        await p.locator("body").getAttribute("class"),
        theme === "dark" ? "" : theme,
      );
      await p.screenshot({
        path: artifacts + "/looplab-" + theme + ".png",
        fullPage: true,
      });
    }
    await p.locator("#theme").selectOption("dark");
    await p.screenshot({ path: artifacts + "/desktop.png", fullPage: true });
    await p.setViewportSize({ width: 390, height: 844 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: artifacts + "/looplab-mobile.png",
      fullPage: true,
    });
    await p.locator("#plant").selectOption("tank");
    await p.locator("#starter").click();
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const local = await c.newPage();
    await c.setOffline(true);
    await local.goto("file://" + root + "/index.html");
    await local.reload();
    assert.equal(await local.locator("#readout").isVisible(), true);
    await c.setOffline(false);
    assert.equal(errors.length, 0, errors.join("\n"));
    assert(requests.every((r) => r.startsWith(baseUrl)));
    console.log(
      "PASS: legacy JSON, print report, keyboard slider, three themes, 390px layout, standalone offline reload, no external requests.",
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
