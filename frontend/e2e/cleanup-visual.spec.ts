import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { defaults } from "../src/editor/model";

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
test("cleanup preserves the four workspace surfaces and their controls", async ({
  page,
  request,
}) => {
  const phase =
    process.env.LABFLOW_CLEANUP_BASELINE === "1" ? "before" : "after";
  const project = await (
    await request.post("/api/projects", {
      data: {
        name: "样式清理验收 · 合成演示",
        description: "Task 08 visual fixture",
      },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-cleanup.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "epoch,accuracy,loss\n1,0.71,0.8\n2,0.82,0.5\n3,0.91,0.2",
          ),
        },
      },
    })
  ).json();
  const config = defaults(data);
  config.style.title = "Learning dynamics · synthetic";
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "训练曲线 · 合成演示", config },
    })
  ).json();
  const exp = await request.post(`/api/projects/${project.id}/experiments`, {
    data: {
      name: "EXP-001 / AdamW baseline",
      status: "completed",
      parameters: { lr: 0.001, seed: 42 },
      metrics: { accuracy: 0.91 },
      notes: "合成演示记录，用于确认清理前后排版一致。",
      tags: ["synthetic"],
      dataset_version_ids: [data.id],
    },
  });
  expect(exp.ok()).toBe(true);
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );
  const surfaces = [
    {
      name: "home",
      url: "/",
      ready: ".home-intro",
      selectors: [
        ".masthead",
        ".workspace-nav",
        ".home-intro",
        ".home-continue",
        ".home-assistant-form",
        ".home-tables",
      ],
    },
    {
      name: "experiments",
      url: `/projects/${project.id}/experiments`,
      ready: ".experiments-table",
      selectors: [
        ".masthead",
        ".lf-page-header",
        ".experiments-table",
        ".lf-chip",
      ],
    },
    {
      name: "data",
      url: `/projects/${project.id}/data`,
      ready: ".data-title h2",
      selectors: [
        ".masthead",
        ".lf-page-header",
        ".data-layout",
        ".dataset-list",
        ".data-detail",
        ".data-table th",
      ],
    },
    {
      name: "editor",
      url: `/projects/${project.id}/figures/${chart.id}`,
      ready: '[data-testid="plot"] .main-svg',
      selectors: [
        ".masthead",
        ".editor",
        ".editor-toolbar",
        ".editor-left",
        ".editor-right",
        ".canvas-stage",
        ".paper-wrap",
        ".figure-info input",
        ".inspector-tabs",
        ".bottom-tabs",
        ".editor-statusbar",
      ],
    },
  ];
  const records: Record<string, unknown> = {};
  for (const surface of surfaces) {
    await page.goto(surface.url);
    await expect(page.locator(surface.ready).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (surface.name === "home")
      await expect(page.locator(".figure-preview").first()).toHaveAttribute(
        "aria-busy",
        "false",
      );
    const measured: Record<string, unknown> = {};
    for (const selector of surface.selectors) {
      const locator = page.locator(selector).first();
      if (!(await locator.count())) continue;
      measured[selector] = await locator.evaluate((el) => {
        const b = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        return {
          box: { x: b.x, y: b.y, width: b.width, height: b.height },
          font: s.fontFamily,
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          radius: s.borderRadius,
          padding: s.padding,
          display: s.display,
          color: s.color,
          background: s.backgroundColor,
        };
      });
    }
    records[surface.name] = measured;
    await page.screenshot({
      path: `../docs/screenshots/refactor-09-regression-${surface.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(1440);
  }
  fs.writeFileSync(
    `../docs/test-evidence/refactor09-current-layout.json`,
    JSON.stringify(records, null, 2) + "\n",
  );

  // Task09 intentionally replaces table/layout geometry. Refresh this explicit
  // visual baseline, retaining the same seven property checks for all surfaces.
  if (process.env.LABFLOW_POLISH_UPDATE_BASELINE === "1") {
    fs.writeFileSync("../docs/test-evidence/refactor09-layout-baseline.json", JSON.stringify(records, null, 2) + "\n");
  }
  if (phase === "after") {
    const previous = JSON.parse(
      fs.readFileSync("../docs/test-evidence/refactor09-layout-baseline.json", "utf8"),
    );
    for (const [surface, elements] of Object.entries(previous)) {
      for (const [selector, styles] of Object.entries(
        elements as Record<string, Record<string, unknown>>,
      )) {
        const current = (
          records[surface] as Record<string, Record<string, unknown>>
        )[selector];
        expect(current, surface + " " + selector).toBeDefined();
        for (const property of [
          "box",
          "font",
          "fontSize",
          "lineHeight",
          "radius",
          "padding",
          "display",
        ]) {
          expect(
            current[property],
            surface + " " + selector + " " + property,
          ).toEqual(styles[property]);
        }
      }
    }
  }
  const xTitle = page.getByTestId("plot").locator(".xtitle").first();
  await expect(xTitle).toHaveCSS("cursor", "pointer");
  await xTitle.click();
  await expect(page.getByLabel("X 轴名称", { exact: true })).toBeVisible();
  const saved = await (
    await request.get(`/api/projects/${project.id}/charts/${chart.id}`)
  ).json();
  expect(saved.config).toEqual(config);
  expect(saved.revision).toBe(1);
});
