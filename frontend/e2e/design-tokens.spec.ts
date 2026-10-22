import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { defaults } from "../src/editor/model";

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });

test("four real workspace pages keep their layout while adopting shared tokens", async ({
  page,
  request,
}) => {
  const baseline = process.env.LABFLOW_TOKEN_BASELINE === "1";
  const phase = baseline ? "before" : "after";
  const previous = baseline
    ? null
    : JSON.parse(
        fs.readFileSync("../docs/test-evidence/refactor02-before.json", "utf8"),
      );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const projectResponse = await request.post("/api/projects", {
    data: {
      name: "视觉规范验收 · 合成演示",
      description: "Task 02 visual verification",
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = await projectResponse.json();
  const uploaded = await request.post(`/api/projects/${project.id}/datasets`, {
    multipart: {
      file: {
        name: "synthetic-learning.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "epoch,accuracy,loss\n1,0.71,0.8\n2,0.82,0.5\n3,0.91,0.2",
        ),
      },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  const data = await uploaded.json();
  const config = defaults(data);
  config.style.title = "Learning dynamics · synthetic";
  const saved = await request.post(`/api/projects/${project.id}/charts`, {
    data: { name: "训练曲线 · 合成演示", config },
  });
  expect(saved.ok()).toBeTruthy();
  const chart = await saved.json();
  const experiment = await request.post(
    `/api/projects/${project.id}/experiments`,
    {
      data: {
        name: "EXP-001 / AdamW baseline",
        status: "completed",
        parameters: { lr: 0.001, seed: 42 },
        metrics: { accuracy: 0.91 },
        notes: "合成演示记录，用于检查参数、指标与数据版本的排版。",
        tags: ["synthetic"],
        dataset_version_ids: [data.id],
      },
    },
  );
  expect(experiment.ok()).toBeTruthy();
  await page.addInitScript((id) => {
    localStorage.setItem("labflow-project", String(id));
    sessionStorage.setItem("labflow-intro-v2", "seen");
  }, project.id);
  const measurements: Record<string, unknown> = {};
  const pages = [
    { name: "home", path: "/", ready: ".home-intro", frame: ".home" },
    {
      name: "experiments",
      path: `/projects/${project.id}/experiments`,
      ready: ".experiment-record",
      frame: ".page-content",
    },
    {
      name: "data",
      path: `/projects/${project.id}/data`,
      ready: ".data-title h2",
      frame: ".data-layout",
    },
    {
      name: "editor",
      path: `/projects/${project.id}/figures/${chart.id}`,
      ready: '[data-testid="plot"] .main-svg',
      frame: ".editor",
    },
  ];
  for (const entry of pages) {
    await page.goto(entry.path);
    await expect(page.locator(entry.ready).first()).toBeVisible();
    await expect(page.locator(".brand .labflow-mark")).toBeVisible();
    expect(
      (await page.locator(".brand .labflow-mark").boundingBox())!.width,
    ).toBe(29);
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    const frame = await page.locator(entry.frame).boundingBox();
    const header = await page.locator(".masthead").boundingBox();
    if (previous) {
      const sizing = await page.locator(":root").evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          header: parseFloat(s.getPropertyValue("--lf-header-h")),
          max: parseFloat(s.getPropertyValue("--lf-page-max")),
          gutter: parseFloat(s.getPropertyValue("--lf-gutter")),
        };
      });
      expect(header).toEqual({
        ...previous[entry.name].header,
        height: sizing.header,
      });
      const inset =
        entry.name === "home" || entry.name === "experiments" || entry.name === "data"
          ? (1440 - sizing.max) / 2 +
            (entry.name === "data" ? sizing.gutter : 0)
          : previous[entry.name].frame.x;
      expect(frame!.x).toBe(inset);
      expect(frame!.width).toBe(1440 - 2 * inset);
    }
    measurements[entry.name] = {
      frame,
      header,
      typography: await page
        .locator(entry.ready)
        .first()
        .evaluate((el) => ({
          font: getComputedStyle(el).fontFamily,
          color: getComputedStyle(el).color,
        })),
    };
    if (!baseline) {
      expect(
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toContain("Inter");
      const tokens = await page.locator(".app-shell").evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          ink: s.getPropertyValue("--ink").trim(),
          text: s.getPropertyValue("--lf-text").trim(),
          paper: s.getPropertyValue("--paper").trim(),
          bg: s.getPropertyValue("--lf-bg").trim(),
        };
      });
      expect(tokens.ink).toBe(tokens.text);
      expect(tokens.paper).toBe(tokens.bg);
      if (entry.name === "home") {
        const inverseText = await page
          .locator(":root")
          .evaluate((el) =>
            getComputedStyle(el)
              .getPropertyValue("--lf-text-on-inverse-2")
              .trim(),
          );
        expect(inverseText).toBe("#b8c0cc");
        await expect(page.locator(".home-assistant-form label")).toHaveCSS(
          "color",
          "rgb(184, 192, 204)",
        );
        await expect(page.locator(".home-assistant-model")).toHaveCSS(
          "color",
          "rgb(184, 192, 204)",
        );
      }
      if (entry.name === "data")
        expect((measurements[entry.name] as any).typography.font).toContain(
          "Inter",
        );
    }
    if (entry.name === "home") {
      await page
        .locator(".showcase-paper img")
        .evaluateAll((images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        );
    }
    await page.screenshot({
      path: `../docs/screenshots/refactor-02-${phase}-${entry.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  const reopened = await (
    await request.get(`/api/projects/${project.id}/charts/${chart.id}`)
  ).json();
  expect(reopened.config).toEqual(config);
  expect(reopened.revision).toBe(1);
  expect(errors).toEqual([]);
  fs.writeFileSync(
    `../docs/test-evidence/refactor02-${phase}.json`,
    JSON.stringify(measurements, null, 2) + "\n",
  );
});
