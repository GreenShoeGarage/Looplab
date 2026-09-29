const { chromium } = require("playwright");
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  os = require("os"),
  assert = require("assert");
const root = path.resolve(__dirname, ".."),
  out = fs.mkdtempSync(path.join(os.tmpdir(), "looplab-audit-"));
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(fs.readFileSync(path.join(root, "index.html")));
});
console.log("Audit artifacts:", out);
server.listen(0, "127.0.0.1", async () => {
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.BROWSER_EXECUTABLE
        ? { executablePath: process.env.BROWSER_EXECUTABLE }
        : {}),
      args: ["--no-sandbox", "--disable-gpu"],
    });
    const ctx = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      acceptDownloads: true,
    });
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const url = "http://127.0.0.1:" + server.address().port;
    await page.goto(url);
    await page.locator("#advancedMode").click();
    await page.locator("#plant").selectOption("motor");
    await page.locator("#starter").click();
    await page.locator("#play").click();
    await page.waitForTimeout(800);
    await page.locator("#play").click();
    await page.locator("#inspector > summary").click();
    const at = await page.locator("#runTime").innerText();
    const originalP = await page.locator("#pTerm").innerText();
    await page.locator("#kpNumber").fill("3.2");
    await page.locator("#kpNumber").press("Tab");
    assert.notEqual(await page.locator("#pTerm").innerText(), originalP);
    assert.equal(await page.locator("#runTime").innerText(), at);
    const error = Number(
      (await page.locator("#errorNow").innerText()).split(":")[1],
    );
    assert(
      Math.abs(
        parseFloat(await page.locator("#pTerm").innerText()) - 3.2 * error,
      ) < 0.3,
    );
    await page.locator("#kiNumber").fill("0");
    await page.locator("#kiNumber").press("Tab");
    assert.equal(await page.locator("#iTerm").innerText(), "+0.0%");
    assert((await page.locator("#iMemory").innerText()).includes("0.0"));
    await page.locator("#advancedPanel > summary").click();
    await page.locator("#power").fill("15");
    assert(
      Math.abs(parseFloat(await page.locator("#effort").innerText())) <= 15,
    );
    await page.locator("#disturb").click();
    assert.equal(await page.locator("#loadNow").innerText(), "-12.0");
    assert.equal(await page.locator("#runTime").innerText(), at);
    await page.locator("#advancedPanel > summary").click();
    await page.locator("#kpKnob").scrollIntoViewIfNeeded();
    const box = await page.locator("#kpKnob").boundingBox();
    const oldK = Number(await page.locator("#kp").inputValue());
    await page.mouse.move(box.x + 22, box.y + 22);
    await page.mouse.down();
    await page.mouse.move(box.x + 22, box.y + 5, { steps: 3 });
    await page.mouse.up();
    assert(Number(await page.locator("#kp").inputValue()) > oldK);
    assert.equal(await page.locator("#runTime").innerText(), at);
    console.log(
      "PASS: paused contributions, zero-I memory, paused capacity/load updates, exact inputs and knob drag.",
    );
    const state = JSON.parse(
      await page.evaluate(() => localStorage.getItem("looplab-v0.1.0")),
    ).state;
    const before = await page.locator("#plant").inputValue();
    const badCases = [
      { format: "looplab-project", version: 99, state },
      {
        format: "looplab-project",
        version: 2,
        state: { ...state, inertia: -1 },
      },
      {
        format: "looplab-project",
        version: 2,
        state,
        baseline: [{ t: 900, y: 70, u: 1, s: 70 }],
      },
      {
        format: "looplab-project",
        version: 2,
        state: { ...state, kp: "<script>alert(1)</script>" },
      },
    ];
    for (let i = 0; i < badCases.length; i++) {
      const file = path.join(out, "invalid-" + i + ".json");
      fs.writeFileSync(file, JSON.stringify(badCases[i]));
      await page.locator("#importFile").setInputFiles(file);
      await page.locator("#notice").waitFor({ state: "visible" });
      assert(
        (await page.locator("#noticeText").innerText()).startsWith(
          "Import rejected",
        ),
      );
      assert.equal(await page.locator("#plant").inputValue(), before);
      assert.equal(await page.locator("#runTime").innerText(), at);
      await page.locator("#dismissNotice").click();
    }
    // Set a valid control to invalidate any old message, then test malformed storage cold start.
    const broken = JSON.stringify({
      state: { plant: "missing-plant", inertia: -1 },
    });
    await page.evaluate(
      (raw) => localStorage.setItem("looplab-v0.1.0", raw),
      broken,
    );
    await page.reload();
    assert.equal(await page.locator("#plant").inputValue(), "cart");
    assert(await page.locator("#recovery").isVisible());
    const download = page.waitForEvent("download");
    await page.locator("#recovery").click();
    const recovery = await download;
    await recovery.saveAs(path.join(out, "recovered.json"));
    assert.equal(
      fs.readFileSync(path.join(out, "recovered.json"), "utf8"),
      broken,
    );
    await page.locator("#kp").fill("2");
    await page.waitForFunction(
      () => document.getElementById("save").textContent === "Saved locally",
    );
    await page.reload();
    assert.equal(await page.locator("#kp").inputValue(), "2");
    assert(await page.locator("#recovery").isVisible());
    console.log(
      "PASS: invalid/future imports preserve experiment; malformed saved settings recover; original bytes remain downloadable after reload.",
    );
    await page.locator("#dismissNotice").click();
    await page.locator("#play").click();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await page.locator("#runState").innerText(), "Paused");
    await page.evaluate(() => delete document.hidden);
    await page.locator("#dismissNotice").click();
    await page.locator("#inspector > summary").click();
    await page.locator("#projectMenu > summary").click();
    const pop = page.waitForEvent("popup");
    await page.locator("#report").click();
    const report = await pop;
    await report.waitForLoadState();
    assert.equal(await report.locator("img").count(), 2);
    assert(
      await report
        .locator("img")
        .evaluateAll((imgs) => imgs.every((i) => i.naturalWidth > 0)),
    );
    assert((await report.locator("body").innerText()).includes("Recording:"));
    await report.pdf({
      path: path.join(out, "report.pdf"),
      format: "A4",
      printBackground: true,
    });
    await report.close();
    await page.locator("#projectMenu > summary").click();
    // Inspect coherent complete-run screenshots rather than transient editing states.
    await page.locator("#plant").selectOption("spring");
    await page.locator("#starter").click();
    if ((await page.locator("#inspector").getAttribute("open")) !== null)
      await page.locator("#inspector > summary").click();
    await page.waitForFunction(
      () => document.getElementById("save").textContent === "Saved locally",
    );
    const originalWidth = (await page.locator("#machine").boundingBox()).width;
    await page.locator("#tuningPanel > summary").click();
    assert(
      (await page.locator("#machine").boundingBox()).width > originalWidth,
    );
    await page.locator("#tuningPanel > summary").click();
    for (let theme of ["dark", "light", "contrast"]) {
      await page.locator("#theme").selectOption(theme);
      await page.waitForFunction(
        () => document.getElementById("save").textContent === "Saved locally",
      );
      await page.screenshot({
        path: path.join(out, "desktop-" + theme + ".png"),
        fullPage: true,
      });
    }
    await page.locator("#theme").selectOption("dark");
    for (const width of [390, 320, 680]) {
      await page.setViewportSize({ width, height: 844 });
      await page.reload();
      await page.locator("#dismissNotice").click();
      assert(!(await page.locator("#tuningPanel").evaluate((el) => el.open)));
      assert((await page.locator("#machine").boundingBox()).y < 600);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390)
        await page.screenshot({
          path: path.join(out, "mobile.png"),
          fullPage: true,
        });
      await page.locator("#tuningPanel > summary").focus();
      await page.keyboard.press("Space");
      assert(await page.locator("#tuningPanel").evaluate((el) => el.open));
      await page.locator("#kp").focus();
      const val = Number(await page.locator("#kp").inputValue());
      await page.keyboard.press("ArrowRight");
      assert(Number(await page.locator("#kp").inputValue()) > val);
    }
    assert.deepStrictEqual(errors, []);
    console.log(
      "PASS: background pause; report images with inspector closed; dark/light/contrast; 320/390/680px layouts; first-screen machine; keyboard controls.",
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
