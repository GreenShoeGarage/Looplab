const { chromium } = require("playwright");
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  os = require("os"),
  assert = require("assert");
const root = path.resolve(__dirname, ".."),
  out = fs.mkdtempSync(path.join(os.tmpdir(), "looplab-inspection-"));
console.log("Inspection artifacts:", out);
const source = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .replace(
    '        window.addEventListener("resize", draw);',
    '        window.testRead = () => ({state:{...state},trace:trace.map(p=>({...p})),t,position,changed:experimentChanged});\n        window.addEventListener("resize", draw);',
  );
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(source);
});
server.listen(0, "127.0.0.1", async () => {
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.BROWSER_EXECUTABLE
        ? { executablePath: process.env.BROWSER_EXECUTABLE }
        : {}),
      args: ["--no-sandbox", "--disable-gpu"],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    const url = "http://127.0.0.1:" + server.address().port;
    await p.goto(url);
    const stored = async () => {
      await p.waitForFunction(
        () => document.getElementById("save").textContent === "Saved locally",
      );
      return p.evaluate(() =>
        JSON.parse(localStorage.getItem("looplab-v0.1.0")),
      );
    };
    const menu = async () => {
      if (!(await p.locator("#projectMenu").evaluate((e) => e.open)))
        await p.locator("#projectMenu > summary").click();
    };
    const download = async (id, name) => {
      const pending = p.waitForEvent("download");
      await p.locator("#" + id).click();
      const dest = path.join(out, name);
      await (await pending).saveAs(dest);
      return dest;
    };
    // Native keyboard inspection reads the exact recorded samples without seeking the machine.
    await p.locator("#sampleInspector > summary").click();
    const before = await p.evaluate(() => testRead());
    const slider = p.locator("#sampleTime");
    await slider.focus();
    await slider.press("Home");
    assert.equal(await p.locator("#sampleTimeValue").innerText(), "0.02 s");
    assert(
      (await slider.getAttribute("aria-valuetext")).includes("0.02 seconds"),
    );
    const cells = await p.locator("#sampleValues dd").allTextContents();
    ["y", "s", "measured", "u", "p", "i", "d"].forEach((k, i) =>
      assert.equal(cells[i], before.trace[0][k].toFixed(2) + "%"),
    );
    await slider.press("ArrowRight");
    assert.equal(await p.locator("#sampleTimeValue").innerText(), "0.04 s");
    assert.equal(
      (await p.evaluate(() => testRead())).position,
      before.position,
    );
    await p.locator("#latestSample").click();
    assert.equal(await slider.inputValue(), "1199");
    const box = await p.locator("#chart").boundingBox();
    await p
      .locator("#chart")
      .click({ position: { x: 42 + (box.width - 56) / 2, y: 90 } });
    assert(Math.abs(Number(await slider.inputValue()) - 599) <= 2);
    assert.equal(await p.locator(":focus").getAttribute("id"), "sampleTime");
    // An exported CSV reproduces all current samples, including contribution sums and flags.
    const csvFile = await download("exportCSV", "complete.csv");
    const rows = fs
      .readFileSync(csvFile, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((r) => r.split(","));
    assert.equal(rows.length, 1201);
    assert.equal(rows[0].length, 18);
    const cols = rows[0];
    before.trace.forEach((sample, i) => {
      const r = rows[i + 1];
      assert.equal(r.length, cols.length);
      for (const [col, key] of [
        ["time_s", "t"],
        ["output_pct", "y"],
        ["sensor_pct", "measured"],
        ["command_pct", "u"],
        ["p_pct", "p"],
        ["i_pct", "i"],
        ["d_pct", "d"],
        ["load_units", "load"],
      ])
        assert(Math.abs(Number(r[cols.indexOf(col)]) - sample[key]) < 1e-8);
      assert.equal(r[2], "false");
      assert.equal(r[1], "complete");
    });
    // Keep one named comparison and a pinned baseline for snapshot and recovery testing.
    await p.locator("#baseline").click();
    await p.locator("#experimentsPanel > summary").click();
    await p.locator("#experimentName").fill("Cart reference");
    await p.locator("#saveExperiment").click();
    const original = await stored();
    assert(
      (await p.locator("#sampleComparisons").innerText()).includes(
        "Cart reference",
      ),
    );
    const png = await download("exportPNG", "chart.png");
    const bytes = fs.readFileSync(png);
    assert.equal(bytes.readUInt32BE(16), 1440);
    assert.equal(bytes.readUInt32BE(20), 873);
    assert(bytes.length > 25000);
    const unchanged = await p.evaluate(() => testRead());
    assert.equal(unchanged.t, before.t);
    assert.equal(unchanged.position, before.position);
    // CSV captures only recorded data when paused or modified live.
    await p.locator("#play").click();
    await p.waitForTimeout(230);
    await p.locator("#play").click();
    await p.locator("#kpNumber").fill("2.2");
    await p.locator("#kpNumber").press("Tab");
    const partial = await p.evaluate(() => testRead());
    assert(partial.changed && partial.trace.length < 1200);
    const partialRows = fs
      .readFileSync(await download("exportCSV", "partial.csv"), "utf8")
      .trim()
      .split(/\r?\n/);
    assert.equal(partialRows.length, partial.trace.length + 1);
    assert(partialRows[1].startsWith("cart,partial,true,"));
    await p.locator("#play").click();
    await p.waitForTimeout(100);
    await slider.focus();
    await slider.press("Home");
    const pausedTime = (await p.evaluate(() => testRead())).t;
    await p.waitForTimeout(100);
    assert.equal((await p.evaluate(() => testRead())).t, pausedTime);
    // Fresh start checkpoints include the shelf and baseline, are detached, and survive reload.
    await menu();
    await p.locator("#reset").click();
    await stored();
    let checkpoint = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("looplab-v0.1.0-checkpoint")),
    );
    assert.equal(checkpoint.reason, "Fresh start");
    assert.equal(checkpoint.project.state.kp, 2.2);
    assert.deepStrictEqual(
      checkpoint.project.experiments,
      original.experiments,
    );
    assert.equal(checkpoint.project.baseline.length, 1200);
    await p.locator("#kpNumber").fill("3");
    await p.locator("#kpNumber").press("Tab");
    await stored();
    assert.equal(
      await p.evaluate(
        () =>
          JSON.parse(localStorage.getItem("looplab-v0.1.0-checkpoint")).project
            .state.kp,
      ),
      2.2,
    );
    await p.reload();
    await menu();
    await p.locator("#restoreCheckpoint").click();
    let restored = await stored();
    assert.equal(restored.state.kp, 2.2);
    assert.deepStrictEqual(restored.experiments, original.experiments);
    assert.equal(restored.baseline.length, 1200);
    await p.locator("#restoreCheckpoint").click();
    restored = await stored();
    assert.equal(restored.state.kp, 3);
    assert.equal(restored.experiments.length, 0);
    // Valid imports replace the checkpoint; invalid imports must not touch it or the current project.
    const imported = structuredClone(original);
    imported.state.plant = "motor";
    await p.locator("#importFile").setInputFiles({
      name: "project.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(imported)),
    });
    await p.waitForFunction(
      () => document.getElementById("plant").value === "motor",
    );
    await stored();
    checkpoint = await p.evaluate(() =>
      localStorage.getItem("looplab-v0.1.0-checkpoint"),
    );
    assert.equal(JSON.parse(checkpoint).reason, "import");
    await p.locator("#importFile").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
    await p.waitForFunction(() =>
      document
        .getElementById("noticeText")
        .textContent.startsWith("Import rejected"),
    );
    assert.equal(
      await p.evaluate(() => localStorage.getItem("looplab-v0.1.0-checkpoint")),
      checkpoint,
    );
    assert.equal((await stored()).state.plant, "motor");
    // Escape returns focus to the disclosure without swallowing native keyboard controls.
    await p.locator("#restoreCheckpoint").focus();
    await p.keyboard.press("Escape");
    assert.equal(
      await p.locator("#projectMenu").evaluate((e) => e.open),
      false,
    );
    assert.equal(
      await p.locator(":focus").evaluate((e) => e.parentElement.id),
      "projectMenu",
    );
    // A pagehide flush catches an edit before the debounce expires.
    await p.evaluate(() => {
      const e = document.getElementById("kp");
      e.value = "3.4";
      e.dispatchEvent(new Event("input"));
      window.dispatchEvent(new Event("pagehide"));
    });
    assert.equal((await stored()).state.kp, 3.4);
    const lastGood = await p.evaluate(() =>
      localStorage.getItem("looplab-v0.1.0"),
    );
    // Quota failure retains prior stored bytes, reports failure, and offers a session checkpoint.
    await p.evaluate(() => {
      window.realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new DOMException("Full", "QuotaExceededError");
      };
    });
    await p.locator("#kpNumber").fill("3.5");
    await p.locator("#kpNumber").press("Tab");
    await p.waitForFunction(() =>
      document
        .getElementById("save")
        .textContent.includes("Storage unavailable"),
    );
    assert.equal(
      await p.evaluate(() => localStorage.getItem("looplab-v0.1.0")),
      lastGood,
    );
    await menu();
    await p.locator("#reset").click();
    assert(
      (await p.locator("#checkpointStatus").innerText()).includes(
        "This tab only",
      ),
    );
    await p.locator("#restoreCheckpoint").click();
    assert.equal(await p.locator("#kpNumber").inputValue(), "3.5");
    await p.evaluate(() => {
      Storage.prototype.setItem = window.realSet;
      window.dispatchEvent(new Event("pagehide"));
    });
    await stored();
    // Damaged primary data still leaves a valid checkpoint accessible; raw bytes remain downloadable.
    await p.evaluate(() =>
      localStorage.setItem("looplab-v0.1.0", "{unreadable-original"),
    );
    await p.reload();
    await menu();
    assert(!(await p.locator("#restoreCheckpoint").isDisabled()));
    await p.locator("#restoreCheckpoint").click();
    await stored();
    assert.equal(
      await p.evaluate(() => localStorage.getItem("looplab-v0.1.0-recovery")),
      "{unreadable-original",
    );
    // Recovery and inspection remain usable on narrow viewports and all themes.
    await p.locator("#projectMenu > summary").click();
    for (const width of [320, 390, 680]) {
      await p.setViewportSize({ width, height: 844 });
      await p.reload();
      await p.locator("#sampleInspector > summary").click();
      await slider.focus();
      await slider.press("Home");
      await slider.press("ArrowRight");
      assert.equal(await p.locator("#sampleTimeValue").innerText(), "0.04 s");
      for (const theme of ["dark", "light", "contrast"]) {
        await p.locator("#theme").selectOption(theme);
        await stored();
        assert(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
      await p.locator("#theme").selectOption("dark");
      await stored();
      if (width === 390) {
        await p.locator("#dismissNotice").click();
        await p.evaluate(() => scrollTo(0, 0));
        await p.screenshot({
          path: path.join(out, "mobile.png"),
          fullPage: true,
        });
        await p
          .locator(".response")
          .screenshot({ path: path.join(out, "mobile-inspection.png") });
      }
    }
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.reload();
    await p.locator("#sampleInspector > summary").click();
    await slider.focus();
    await slider.press("Home");
    if (await p.locator("#notice").isVisible())
      await p.locator("#dismissNotice").click();
    await p.locator("#guidePanel > summary").click();
    await p.evaluate(() => scrollTo(0, 0));
    await p.screenshot({ path: path.join(out, "desktop.png"), fullPage: true });
    // Browser security settings that block storage do not prevent simulation/export.
    const blocked = await context.newPage();
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = function () {
        throw new DOMException("Denied", "SecurityError");
      };
      Storage.prototype.setItem = function () {
        throw new DOMException("Denied", "SecurityError");
      };
    });
    blocked.on("pageerror", (e) => errors.push(e.message));
    await blocked.goto(url);
    assert.equal(
      await blocked.locator("#sampleTimeValue").textContent(),
      "24.00 s",
    );
    await blocked.locator("#kpNumber").fill("2.5");
    await blocked.locator("#kpNumber").press("Tab");
    await blocked.waitForFunction(() =>
      document
        .getElementById("save")
        .textContent.includes("Storage unavailable"),
    );
    assert(!(await blocked.locator("#exportCSV").isDisabled()));
    await blocked.close();
    assert.deepStrictEqual(errors, []);
    console.log(
      "PASS: exact keyboard/tap inspection; CSV samples and partial/mixed labels; self-contained PNG; pause and physical-state preservation; checkpoint capture, reload, swap, invalid-import isolation and corruption recovery; pagehide flush; quota/security failures; Escape focus; 320/390/680px themes.",
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
