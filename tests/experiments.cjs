const { chromium } = require("playwright");
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  os = require("os"),
  assert = require("assert");
const root = path.resolve(__dirname, ".."),
  out = fs.mkdtempSync(path.join(os.tmpdir(), "looplab-experiments-"));
console.log("Experiment artifacts:", out);
const source = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .replace(
    '        window.addEventListener("resize", draw);',
    '        window.testRead = () => ({state:{...state},trace:trace.map(p=>({...p})),changed:experimentChanged});\n        window.addEventListener("resize", draw);',
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
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      }),
      p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await p.goto("http://127.0.0.1:" + server.address().port);
    const stored = async () => {
      await p.waitForFunction(
        () => document.getElementById("save").textContent === "Saved locally",
      );
      return p.evaluate(() =>
        JSON.parse(localStorage.getItem("looplab-v0.1.0")),
      );
    };
    const openShelf = async () => {
      if (!(await p.locator("#experimentsPanel").evaluate((e) => e.open)))
        await p.locator("#experimentsPanel > summary").click();
    };
    const add = async (name) => {
      await openShelf();
      await p.locator("#experimentName").fill(name);
      await p.locator("#saveExperiment").click();
      return stored();
    };
    const dismiss = async () => {
      if (await p.locator("#notice").isVisible())
        await p.locator("#dismissNotice").click();
    };
    const input = async (id, val) => p.locator("#" + id).fill(String(val));
    await p.locator("#plant").selectOption("spring");
    await p.locator("#starter").click();
    let data = await add("Spring starter"),
      first = data.experiments[0];
    assert.equal(data.version, 4);
    assert.equal(first.trace.length, 1200);
    assert.equal(first.selected, true);
    assert.equal(await p.locator("#comparisonRows tr").count(), 2);
    const live = await p.evaluate(() => testRead().trace);
    assert(
      first.trace.every((v, i) =>
        ["y", "u", "t"].every((k) => Math.abs(v[k] - live[i][k]) < 1e-6),
      ),
    );
    await input("kpNumber", 1.2);
    await p.locator("#kpNumber").press("Tab");
    assert.deepStrictEqual(
      (await stored()).experiments[0],
      first,
      "saved trace/settings must remain unchanged by tuning",
    );
    data = await add("Lower P");
    assert.equal(await p.locator("#comparisonLegend > span").count(), 2);
    assert.equal(await p.locator("#comparisonRows tr").count(), 3);
    // Editing a name and clicking Load must work in a single click (blur must not replace the target).
    const rename = p.locator("#name-" + first.id);
    await rename.fill("Spring · reference");
    await p.locator('[data-load="' + first.id + '"]').click();
    assert.equal(await p.locator("#kpNumber").inputValue(), "2");
    assert.equal((await stored()).experiments[0].name, "Spring · reference");
    const replay = await p.evaluate(() => testRead().trace);
    assert(
      first.trace.every((v, i) => Math.abs(v.y - replay[i].y) < 1e-6),
      "loaded setup reproduces saved trace",
    );
    await p.locator("#theme").selectOption("light");
    await p.locator("#advancedMode").click();
    await p.locator('[data-load="' + first.id + '"]').click();
    assert.equal(await p.locator("#theme").inputValue(), "light");
    assert.equal(await p.locator("body").getAttribute("data-mode"), "advanced");
    await p.locator("#advancedPanel > summary").click();
    await input("noise", 1.2);
    await input("delay", 0.2);
    await p.locator("#eventEnabled").check();
    await input("eventStart", 5);
    await input("eventDuration", 3);
    await input("eventLoad", -8);
    data = await add("Sensor and load");
    const scheduled = data.experiments.at(-1);
    assert.equal(
      await p
        .locator("#comparisonRows tr")
        .last()
        .locator("td")
        .nth(3)
        .innerText(),
      "—",
    );
    await p.locator("#starter").click();
    await p.locator('[data-load="' + scheduled.id + '"]').click();
    const repeat = await p.evaluate(() => testRead().trace);
    assert(
      scheduled.trace.every((v, i) => Math.abs(v.y - repeat[i].y) < 1e-6),
      "seeded noisy delayed event replay is deterministic",
    );
    await p.locator("#plant").selectOption("tank");
    await p.locator("#starter").click();
    assert(!(await p.locator("#comparisonLegend").isVisible()));
    assert.equal(await p.locator("#comparisonRows tr").count(), 1);
    data = await add("Tank");
    assert.equal(data.experiments.filter((e) => e.selected).length, 4);
    data = await add("Tank spare");
    const spare = data.experiments.at(-1);
    assert(!spare.selected);
    await p.locator("#compare-" + spare.id).click();
    assert(!(await p.locator("#compare-" + spare.id).isChecked()));
    await p.locator("#compare-" + first.id).uncheck();
    await p.locator("#compare-" + spare.id).check();
    assert.equal(
      (await stored()).experiments.filter((e) => e.selected).length,
      4,
    );
    const fullBefore = (await stored()).experiments;
    await p.locator('[data-remove="' + spare.id + '"]').click();
    assert.equal((await stored()).experiments.length, 4);
    await p.locator("#undoDelete").click();
    assert.deepStrictEqual((await stored()).experiments, fullBefore);
    await p.reload();
    await openShelf();
    assert.equal((await stored()).experiments.length, 5);
    assert.equal(
      await p.locator("#comparisonLegend > span").count(),
      2,
      "only tank records visible",
    );
    // Mixed or partial traces cannot masquerade as repeatable complete experiments.
    await p.locator("#play").click();
    await p.waitForTimeout(180);
    await p.locator("#play").click();
    assert(await p.locator("#saveExperiment").isDisabled());
    await p.locator("#kpNumber").fill("3");
    await p.locator("#kpNumber").press("Tab");
    assert((await p.evaluate(() => testRead())).changed);
    assert(await p.locator("#saveExperiment").isDisabled());
    await p.locator("#step").click();
    assert(!(await p.locator("#saveExperiment").isDisabled()));
    // Names are inert text in the shelf, legend and popup report.
    const literal = '<img src=x onerror=window.name="bad">';
    await p.locator("#name-" + spare.id).fill(literal);
    await p.locator("#name-" + spare.id).press("Tab");
    assert.equal(await p.locator("#experimentList img").count(), 0);
    assert.equal(await p.evaluate(() => window.name), "");
    await p.locator("#projectMenu > summary").click();
    const dl = p.waitForEvent("download");
    await p.locator("#export").click();
    await (await dl).saveAs(path.join(out, "project.json"));
    const exported = JSON.parse(
      fs.readFileSync(path.join(out, "project.json")),
    );
    await p.locator("#reset").click();
    assert.equal((await stored()).experiments.length, 0);
    await p
      .locator("#importFile")
      .setInputFiles(path.join(out, "project.json"));
    await p.waitForFunction(() =>
      document
        .getElementById("experimentCount")
        .textContent.startsWith("5 saved"),
    );
    assert.deepStrictEqual((await stored()).experiments, exported.experiments);
    const mutations = [
      (x) => x.experiments[0].trace.pop(),
      (x) => (x.experiments[0].trace[3].t = 2),
      (x) => (x.experiments[0].trace[0].s = 50),
      (x) => (x.experiments[0].trace[0].u = 101),
      (x) => (x.experiments[1].id = x.experiments[0].id),
      (x) => (x.experiments[1].name = x.experiments[0].name),
      (x) => x.experiments.forEach((e) => (e.selected = true)),
      (x) => (x.experiments[0].state.kp = "bad"),
      (x) => (x.experiments[0].modelVersion = 99),
    ];
    for (const mutate of mutations) {
      const bad = structuredClone(exported);
      mutate(bad);
      await p
        .locator("#importFile")
        .setInputFiles({
          name: "invalid.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(bad)),
        });
      await p.waitForFunction(() =>
        document
          .getElementById("noticeText")
          .textContent.startsWith("Import rejected"),
      );
      assert.deepStrictEqual(
        (await stored()).experiments,
        exported.experiments,
      );
    }
    const popup = p.waitForEvent("popup");
    await p.locator("#report").click();
    const report = await popup;
    await report.waitForLoadState();
    assert((await report.locator("body").innerText()).includes(literal));
    assert.equal(await report.locator("img").count(), 2);
    assert.equal(await report.evaluate(() => window.name), "");
    assert(
      (await report.locator("body").innerText()).includes(
        "Saved response comparisons",
      ),
    );
    await report.pdf({
      path: path.join(out, "comparison-report.pdf"),
      format: "A4",
      printBackground: true,
    });
    await report.close();
    await p.locator("#projectMenu > summary").click();
    await dismiss();
    // Earlier projects have no shelf: retain existing saved work on import.
    await p
      .locator("#importFile")
      .setInputFiles({
        name: "v3.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            format: "looplab-project",
            version: 3,
            state: exported.state,
          }),
        ),
      });
    await p.waitForFunction(() =>
      document
        .getElementById("noticeText")
        .textContent.startsWith("Earlier project imported"),
    );
    assert.deepStrictEqual((await stored()).experiments, exported.experiments);
    await dismiss();
    // Full shelf fails gracefully; it never truncates older work.
    const packed = structuredClone(exported);
    packed.experiments = [];
    for (let i = 0; i < 12; i++)
      packed.experiments.push({
        ...structuredClone(first),
        id: "full-" + i,
        name: "Trial " + (i + 1),
        selected: i < 4,
      });
    await p
      .locator("#importFile")
      .setInputFiles({
        name: "full.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(packed)),
      });
    await p.waitForFunction(() =>
      document
        .getElementById("experimentCount")
        .textContent.startsWith("12 saved"),
    );
    assert(await p.locator("#saveExperiment").isDisabled());
    assert.equal((await stored()).experiments.length, 12);
    await p
      .locator("#importFile")
      .setInputFiles(path.join(out, "project.json"));
    await p.waitForFunction(() =>
      document
        .getElementById("experimentCount")
        .textContent.startsWith("5 saved"),
    );
    // Prepare a readable visual comparison and check responsive shelf behavior.
    await openShelf();
    await p.locator("#name-" + spare.id).fill("Tank · repeat");
    await p.locator("#name-" + spare.id).press("Tab");
    await p.locator("#plant").selectOption("spring");
    await p.locator("#starter").click();
    for (const record of (await stored()).experiments)
      if (record.selected) await p.locator("#compare-" + record.id).uncheck();
    for (const record of (await stored()).experiments.filter(
      (e) => e.state.plant === "spring",
    ))
      await p.locator("#compare-" + record.id).check();
    await p.locator("#theme").selectOption("dark");
    await p.locator("#easyMode").click();
    await dismiss();
    await stored();
    await p.locator("#guidePanel > summary").click();
    await p.screenshot({ path: path.join(out, "desktop.png"), fullPage: true });
    for (const theme of ["light", "contrast"]) {
      await p.locator("#theme").selectOption(theme);
      await stored();
      await p.screenshot({
        path: path.join(out, theme + ".png"),
        fullPage: true,
      });
    }
    await p.locator("#theme").selectOption("dark");
    await stored();
    for (const width of [390, 320, 680]) {
      await p.setViewportSize({ width, height: 844 });
      await p.reload();
      await openShelf();
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) await p.evaluate(() => scrollTo(0, 0));
      if (width === 390)
        await p.screenshot({
          path: path.join(out, "mobile.png"),
          fullPage: true,
        });
      const cb = p.locator("[data-compare]").first();
      await cb.focus();
      const checked = await cb.isChecked();
      await p.keyboard.press("Space");
      assert.equal(await cb.isChecked(), !checked);
      await stored();
    }
    assert.deepStrictEqual(errors, []);
    console.log(
      "PASS: immutable captures; repeatable loads (noise, delay, timed load); rename/blur action; four overlays and system filtering; removal undo; partial/mixed protection; reload; v4 roundtrip; legacy preservation; strict shelf imports; safe text; PDF; shelf limit; themes/mobile/keyboard.",
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
