const { chromium } = require("playwright");
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  os = require("os"),
  assert = require("assert");
const root = path.resolve(__dirname, ".."),
  out = fs.mkdtempSync(path.join(os.tmpdir(), "looplab-learning-"));
console.log("Learning artifacts:", out);
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(fs.readFileSync(path.join(root, "index.html")));
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
    const url = "http://127.0.0.1:" + server.address().port;
    await p.goto(url);
    const saved = async () => {
      await p.waitForFunction(
        () => document.getElementById("save").textContent === "Saved locally",
      );
      return p.evaluate(() =>
        JSON.parse(localStorage.getItem("looplab-v0.1.0")),
      );
    };
    assert.equal(await p.locator("body").getAttribute("data-mode"), "easy");
    assert(await p.locator("#guidePanel").isVisible());
    assert(!(await p.locator("#advancedPanel").isVisible()));
    await p.locator("#baseline").click();
    const original = await saved();
    for (const id of ["p", "i", "d"]) {
      await p.locator("#lessonSelect").selectOption(id);
      await p.locator("#loadLesson").click();
      assert(await p.locator("#lessonResult").isVisible());
      const data = await saved();
      assert.equal(data.state.lessonId, id);
      assert.equal(data.baseline.length, 1200);
      assert.equal(data.baselinePlant, id === "d" ? "spring" : "motor");
      assert(
        (await p.locator("#lessonResultText").innerText()).includes(
          "Error at 24 s:",
        ),
      );
      await p.locator("#undoLesson").click();
      assert.deepStrictEqual(
        await saved(),
        original,
        "restore prior setup and baseline exactly",
      );
    }
    await p.locator("#lessonSelect").selectOption("d");
    await p.locator("#loadLesson").click();
    const guide = await saved();
    await p.reload();
    assert(await p.locator("#lessonResult").isVisible());
    assert.equal(await p.locator("#lessonSelect").inputValue(), "d");
    await p.locator("#play").click();
    await p.waitForTimeout(300);
    await p.locator("#play").click();
    const clock = await p.locator("#runTime").innerText();
    const output = await p.locator("#readout").innerText();
    assert(
      (await p.locator("#lessonResultText").innerText()).includes(
        "in progress",
      ),
    );
    await p.locator("#advancedMode").click();
    assert.equal(await p.locator("#runTime").innerText(), clock);
    assert.equal(await p.locator("#readout").innerText(), output);
    assert.equal((await saved()).state.lessonId, "d");
    await p.locator("#advancedPanel > summary").click();
    await p.locator("#derivativeFilter").fill("0.5");
    await p.locator("#setpointWeight").fill("0.4");
    await p.locator("#integralLimit").fill("10");
    await p.locator("#antiWindup").uncheck();
    assert.equal(await p.locator("#runTime").innerText(), clock);
    assert(
      !(await p.locator("#lessonResult").isVisible()),
      "changed setup clears guided claims",
    );
    await p.locator("#easyMode").click();
    assert(await p.locator("#customSetup").isVisible());
    const configured = await saved();
    await p.reload();
    assert.equal(await p.locator("body").getAttribute("data-mode"), "easy");
    assert.equal(await p.locator("#derivativeFilter").inputValue(), "0.5");
    assert(await p.locator("#customSetup").isVisible());
    await p.locator("#projectMenu > summary").click();
    const download = p.waitForEvent("download");
    await p.locator("#export").click();
    await (await download).saveAs(path.join(out, "roundtrip.json"));
    const exported = JSON.parse(
      fs.readFileSync(path.join(out, "roundtrip.json")),
    );
    assert.equal(exported.version, 4);
    await p.locator("#starter").click();
    assert.equal(await p.locator("#integralLimit").inputValue(), "350");
    await p
      .locator("#importFile")
      .setInputFiles(path.join(out, "roundtrip.json"));
    await p.waitForFunction(
      () => document.getElementById("derivativeFilter").value === "0.5",
    );
    assert.deepStrictEqual((await saved()).state, configured.state);
    for (const patch of [
      { derivativeFilter: 0 },
      { setpointWeight: 1.1 },
      { integralLimit: -1 },
      { antiWindup: "yes" },
      { mode: "bad" },
      { lessonId: "bad" },
    ]) {
      const data = { ...exported, state: { ...exported.state, ...patch } };
      await p.locator("#importFile").setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
      });
      await p.waitForFunction(() =>
        document
          .getElementById("noticeText")
          .textContent.startsWith("Import rejected"),
      );
      assert.deepStrictEqual((await saved()).state, configured.state);
    }
    const pop = p.waitForEvent("popup");
    await p.locator("#report").click();
    const report = await pop;
    await report.waitForLoadState();
    const text = await report.locator("body").innerText();
    assert(text.includes("0.5 s / 0.4") && text.includes("±10 unit·s / Off"));
    await report.pdf({
      path: path.join(out, "report.pdf"),
      format: "A4",
      printBackground: true,
    });
    await report.close();
    await p.locator("#projectMenu > summary").click();
    await p.locator("#dismissNotice").click();
    // v2 projects migrate without silently changing the controller equations.
    await p.locator("#importFile").setInputFiles({
      name: "legacy-v2.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "looplab-project",
          version: 2,
          state: {
            plant: "motor",
            kp: 1.6,
            ki: 0.8,
            kd: 0.12,
            inertia: 2.5,
            lag: 0.12,
          },
        }),
      ),
    });
    await p.waitForFunction(
      () => document.body.getAttribute("data-mode") === "advanced",
    );
    const legacy = await saved();
    assert.equal(legacy.state.derivativeFilter, 0.12);
    assert.equal(legacy.state.setpointWeight, 1);
    assert.equal(legacy.state.integralLimit, 350);
    assert.equal(legacy.state.antiWindup, true);
    assert.equal(await p.locator("#readout").innerText(), "70.0%");
    await p.locator("#easyMode").click();
    await p.locator("#dismissNotice").click();
    // Finish on a useful repeatable comparison for visual review.
    await p.locator("#lessonSelect").selectOption("d");
    await p.locator("#loadLesson").click();
    for (const theme of ["dark", "light", "contrast"]) {
      await p.locator("#theme").selectOption(theme);
      await saved();
      await p.screenshot({
        path: path.join(out, "easy-" + theme + ".png"),
        fullPage: true,
      });
    }
    await p.locator("#theme").selectOption("dark");
    await saved();
    await p.locator("#advancedMode").click();
    await p.locator("#advancedPanel > summary").click();
    await p.locator("#derivativeFilter").scrollIntoViewIfNeeded();
    await saved();
    await p.screenshot({
      path: path.join(out, "advanced.png"),
      fullPage: true,
    });
    await p.locator("#easyMode").click();
    await saved();
    for (const width of [390, 320, 680]) {
      await p.setViewportSize({ width, height: 844 });
      await p.reload();
      assert((await p.locator("#machine").boundingBox()).y < 600);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390)
        await p.screenshot({
          path: path.join(out, "mobile.png"),
          fullPage: true,
        });
      await p.locator("#tuningPanel > summary").focus();
      await p.keyboard.press("Space");
      await p.locator("#lessonSelect").selectOption("i");
      await p.locator("#loadLesson").click();
      await saved();
      assert(await p.locator("#lessonResult").isVisible());
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await p.locator("#advancedMode").focus();
      await p.keyboard.press("Enter");
      await p.locator("#advancedPanel > summary").click();
      await p.locator("#derivativeFilter").focus();
      await p.keyboard.press("ArrowRight");
      assert.equal(await p.locator("#derivativeFilter").inputValue(), "0.13");
      await p.locator("#easyMode").click();
      await saved();
    }
    assert.deepStrictEqual(errors, []);
    console.log(
      "PASS: three guided comparisons, restore prior setup, reload, mode preservation, paused Advanced edits, v4 roundtrip, strict imports, report, mobile, keyboard, and themes.",
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
