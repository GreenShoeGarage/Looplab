// Cross-engine release workflows. BROWSERS defaults to Chromium and Firefox.
const pw = require("playwright"),
  fs = require("fs"),
  path = require("path"),
  http = require("http"),
  os = require("os"),
  assert = require("assert");
const root = path.resolve(__dirname, ".."),
  out = fs.mkdtempSync(path.join(os.tmpdir(), "looplab-release-"));
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(fs.readFileSync(path.join(root, "index.html")));
});
const csvReference = {};
console.log("Release artifacts:", out);
server.listen(0, "127.0.0.1", async () => {
  try {
    for (const engine of (process.env.BROWSERS || "chromium,firefox").split(
      ",",
    )) {
      const watchdog = setTimeout(() => {
        console.error(
          `TIMEOUT: ${engine} release workflow did not complete in 150 seconds.`,
        );
        process.exit(1);
      }, 150000);
      console.log(`Checking ${engine}...`);
      const browser = await pw[engine].launch({
        ...(engine === "chromium" && process.env.BROWSER_EXECUTABLE
          ? { executablePath: process.env.BROWSER_EXECUTABLE }
          : {}),
        ...(engine === "chromium"
          ? { args: ["--no-sandbox", "--disable-gpu"] }
          : {}),
      });
      try {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          acceptDownloads: true,
          reducedMotion: "reduce",
        });
        const p = await context.newPage(),
          errors = [],
          requests = [];
        p.on("pageerror", (e) => errors.push(e.message));
        p.on("dialog", (d) => d.accept());
        p.on("request", (r) => {
          if (
            !r.url().startsWith("http://127.0.0.1:") &&
            !r.url().startsWith("blob:")
          )
            requests.push(r.url());
        });
        await p.goto(
          "http://127.0.0.1:" + server.address().port + "/tools/looplab/",
        );
        assert((await p.locator("header").innerText()).includes("v1.0.0"));
        const stored = async () => {
          await p.waitForFunction(
            () =>
              document.getElementById("save").textContent === "Saved locally",
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
          let d = p.waitForEvent("download");
          await p.locator("#" + id).click();
          const file = path.join(out, engine + "-" + name);
          await (await d).saveAs(file);
          return file;
        };
        // All five models must give the same numbers on both engines, not merely render.
        for (const plant of ["cart", "heater", "tank", "motor", "spring"]) {
          await p.locator("#plant").selectOption(plant);
          await p.locator("#starter").click();
          const data = fs
            .readFileSync(await download("exportCSV", plant + ".csv"), "utf8")
            .trim()
            .split(/\r?\n/)
            .slice(1)
            .map((r) => r.split(",").slice(3, 15).map(Number));
          assert.equal(data.length, 1200);
          assert(data.every((row) => row.every(Number.isFinite)));
          if (csvReference[plant])
            data.forEach((row, i) =>
              row.forEach((value, k) =>
                assert(
                  Math.abs(value - csvReference[plant][i][k]) < 1e-7,
                  `${plant} sample ${i} differs across engines`,
                ),
              ),
            );
          else csvReference[plant] = data;
        }
        if (await p.locator("#notice").isVisible())
          await p.locator("#dismissNotice").click();
        // Help uses a native modal: keyboard closure restores focus, and opening pauses playback.
        await p.locator("#play").click();
        await p.waitForTimeout(160);
        await p.locator("#tuningHelp").click();
        const clock = await p.locator("#runTime").innerText();
        await p.waitForTimeout(120);
        assert.equal(await p.locator("#runTime").innerText(), clock);
        assert(await p.locator("#helpDialog").evaluate((e) => e.open));
        assert.equal(await p.locator(":focus").getAttribute("id"), "closeHelp");
        await p.keyboard.press("Escape");
        assert(!(await p.locator("#helpDialog").evaluate((e) => e.open)));
        assert.equal(
          await p.locator(":focus").getAttribute("id"),
          "tuningHelp",
        );
        await p.locator("#advancedMode").click();
        await menu();
        await p.locator("#openHelp").click();
        await p.locator("#helpExamples").click();
        assert.equal(await p.locator("body").getAttribute("data-mode"), "easy");
        assert.equal(
          await p.locator(":focus").getAttribute("id"),
          "lessonSelect",
        );
        await p.locator("#lessonSelect").selectOption("d");
        await p.locator("#loadLesson").click();
        assert(await p.locator("#lessonResult").isVisible());
        // Save, compare, restore after reset/reload, and round-trip the portable JSON.
        await p.locator("#experimentsPanel > summary").click();
        await p.locator("#experimentName").fill("Damped spring");
        await p.locator("#saveExperiment").click();
        await p.locator("#kdNumber").fill("1");
        await p.locator("#kdNumber").press("Tab");
        await p.locator("#experimentName").fill("Less damping");
        await p.locator("#saveExperiment").click();
        const original = await stored();
        assert.equal(original.experiments.length, 2);
        assert.equal(await p.locator("#comparisonLegend > span").count(), 2);
        await menu();
        const backup = await download("export", "project.json");
        await p.locator("#reset").click();
        await stored();
        await p.reload();
        await menu();
        await p.locator("#restoreCheckpoint").click();
        assert.deepStrictEqual(
          (await stored()).experiments,
          original.experiments,
        );
        await p.locator("#importFile").setInputFiles(backup);
        await stored();
        assert.deepStrictEqual(
          (await stored()).experiments,
          original.experiments,
        );
        // Keyboard sample inspection and the self-contained chart export.
        await p.locator("#projectMenu > summary").click();
        await p.locator("#sampleInspector > summary").click();
        await p.locator("#sampleTime").focus();
        await p.keyboard.press("Home");
        await p.keyboard.press("ArrowRight");
        assert.equal(await p.locator("#sampleTimeValue").innerText(), "0.04 s");
        await p.keyboard.press("End");
        assert.equal(
          await p.locator("#sampleTimeValue").innerText(),
          "24.00 s",
        );
        const image = fs.readFileSync(await download("exportPNG", "chart.png"));
        assert.equal(image.readUInt32BE(16), 1440);
        // A boundary warning must remain visible even when step metrics are suppressed.
        await p.locator("#plant").selectOption("cart");
        await p.locator("#starter").click();
        await p.locator("#advancedMode").click();
        if (!(await p.locator("#advancedPanel").evaluate((e) => e.open)))
          await p.locator("#advancedPanel > summary").click();
        await p.locator("#eventEnabled").check();
        await p.locator("#eventLoad").fill("0");
        assert.equal(await p.locator("#overshoot").innerText(), "Mixed run");
        assert(
          (await p.locator("#interpretation").innerText()).includes(
            "model boundary",
          ),
        );
        await menu();
        const opened = p.waitForEvent("popup");
        await p.locator("#report").click();
        const report = await opened;
        await report.waitForLoadState();
        assert.equal(await report.locator("img").count(), 2);
        assert(
          await report
            .locator("img")
            .evaluateAll((items) =>
              items.every((img) => img.complete && img.naturalWidth > 250),
            ),
        );
        assert(
          (await report.locator("body").innerText()).includes("model boundary"),
        );
        if (engine === "chromium")
          await report.pdf({
            path: path.join(out, "report.pdf"),
            format: "A4",
            printBackground: true,
          });
        await report.close();
        // Modal scrolling, keyboard access, and responsive layouts in each theme.
        await p.locator("#projectMenu > summary").click();
        await p.locator("#starter").click();
        await p.locator("#easyMode").click();
        for (const width of [320, 390, 680]) {
          await p.setViewportSize({ width, height: 844 });
          await p.reload();
          if (await p.locator("#notice").isVisible())
            await p.locator("#dismissNotice").click();
          for (const theme of ["dark", "light", "contrast"]) {
            await p.locator("#theme").selectOption(theme);
            await stored();
            await menu();
            await p.locator("#openHelp").click();
            const fits = await p.locator("#helpDialog").evaluate((e) => ({
              overflow: e.scrollWidth > e.clientWidth,
              rect: e.getBoundingClientRect().toJSON(),
            }));
            assert(!fits.overflow);
            assert(
              fits.rect.x >= 0 &&
                fits.rect.right <= width &&
                fits.rect.y >= 0 &&
                fits.rect.bottom <= 844,
            );
            await p.locator("#helpDialog button").last().click();
            assert(!(await p.locator("#helpDialog").evaluate((e) => e.open)));
            await p.locator("#projectMenu > summary").click();
            assert(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            );
          }
          if (width === 390) {
            await p.locator("#theme").selectOption("dark");
            await stored();
            await p.evaluate(() => scrollTo(0, 0));
            await p.screenshot({
              path: path.join(out, engine + "-mobile.png"),
              fullPage: true,
            });
          }
        }
        await p.setViewportSize({ width: 1440, height: 1000 });
        await p.reload();
        await p.locator("#theme").selectOption("dark");
        await stored();
        await menu();
        await p.locator("#openHelp").click();
        await p.screenshot({
          path: path.join(out, engine + "-help.png"),
          fullPage: true,
        });
        await p.keyboard.press("Escape");
        await p.locator("#projectMenu > summary").click();
        assert.deepStrictEqual(errors, []);
        assert.deepStrictEqual(requests, []);
        // The actual single-file distribution must reload with the network unavailable.
        const local = await context.newPage();
        await local.goto("file://" + path.join(root, "index.html"));
        await context.setOffline(true);
        await local.reload();
        assert.equal(
          await local.locator("#sampleTimeValue").textContent(),
          "24.00 s",
        );
        await local.locator("#plant").selectOption("tank");
        await local.locator("#starter").click();
        assert(
          (await local.locator("#systemLabel").innerText()).includes(
            "Water tank",
          ),
        );
        console.log(
          `PASS ${engine} ${browser.version()}: five-model CSV checks; help/focus/pause; guides; shelf/overlays; JSON/checkpoint reload; CSV/PNG/report; boundary warning; three phone widths and themes; offline standalone; no page errors/external requests.`,
        );
      } finally {
        await browser.close();
        clearTimeout(watchdog);
      }
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
