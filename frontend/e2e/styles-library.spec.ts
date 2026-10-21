import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import { defaults, makeSeries } from "../src/editor/model";

test.use({ reducedMotion: "reduce" });
const ownedProjects = new Set<number>();
test.afterEach(async ({ request }) => {
  const templates = await (await request.get("/api/style-templates")).json();
  for (const t of templates.filter((t: any) =>
    ownedProjects.has(Number(t.project_id)),
  )) {
    expect(
      (await request.delete(`/api/style-templates/${t.id}`)).ok(),
    ).toBeTruthy();
  }
  ownedProjects.clear();
});
async function fixture(request: APIRequestContext) {
  const project = await (
    await request.post("/api/projects", {
      data: {
        name: `样式预览验收 ${Date.now()}`,
        description: "合成演示数据，非真实实验",
      },
    })
  ).json();
  ownedProjects.add(project.id);
  const csv =
    "epoch,baseline,ours\n" +
    Array.from(
      { length: 15 },
      (_, i) =>
        `${i + 1},${(0.58 + 0.26 * (1 - Math.exp(-i / 5))).toFixed(4)},${(0.63 + 0.29 * (1 - Math.exp(-i / 4))).toFixed(4)}`,
    ).join("\n");
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-learning.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csv),
        },
      },
    })
  ).json();
  const config = defaults(data);
  config.series = ["baseline", "ours"].map((field, i) => makeSeries(field, i));
  config.axes.y.min = "0.5";
  config.axes.y.max = "1";
  config.style.title = "Learning dynamics · synthetic demo";
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "学习曲线 · 样式预览", config },
    })
  ).json();
  return {
    project,
    data,
    config,
    chart,
    url: `/projects/${project.id}/figures/${chart.id}`,
  };
}

test("builtin preview is isolated, applies through undo, persists and exports using real data", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.url);
  const plot = page.getByTestId("plot");
  await expect(plot.locator(".scatterlayer .js-line").first()).toBeVisible();
  const original = await plot
    .locator(".scatterlayer .js-line")
    .first()
    .getAttribute("style");
  await page.locator(".preset-disclosure summary").click();
  await page
    .getByRole("button", { name: "预览内置样式 Modern Research", exact: true })
    .click();
  const preview = page.getByLabel("当前数据样式预览", { exact: true });
  await expect(preview).toHaveAttribute("aria-busy", "false");
  await expect(preview.locator(".scatterlayer .js-line")).toHaveCount(
    f.config.series.length,
  );
  await page
    .getByRole("button", { name: "预览内置样式 Okabe–Ito", exact: true })
    .click();
  await expect(preview).toHaveAttribute("aria-busy", "false");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  expect(
    await plot.locator(".scatterlayer .js-line").first().getAttribute("style"),
  ).toBe(original);
  await page
    .getByRole("button", { name: "预览内置样式 Okabe–Ito", exact: true })
    .click();
  await expect(preview).toHaveAttribute("aria-busy", "false");
  await page.screenshot({
    path: "../docs/screenshots/styles-builtin.png",
    fullPage: true,
  });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await preview.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const svg = el.querySelector(".main-svg")!.getBoundingClientRect();
      const dialog = el.closest('[role="dialog"]')!.getBoundingClientRect();
      return {
        chartBottom: svg.bottom,
        frameBottom: box.bottom,
        dialogLeft: dialog.left,
        dialogRight: dialog.right,
        viewportWidth: innerWidth,
      };
    });
    expect(geometry.chartBottom).toBeLessThanOrEqual(geometry.frameBottom);
    expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.dialogRight).toBeLessThanOrEqual(geometry.viewportWidth);
    await expect(
      page.getByRole("button", { name: "应用内置样式 Okabe–Ito", exact: true }),
    ).toBeInViewport();
  }
  await page.setViewportSize({ width: 1560, height: 1000 });
  await page
    .getByRole("button", { name: "应用内置样式 Okabe–Ito", exact: true })
    .click();
  await expect(
    plot.locator(".scatterlayer .js-line").first(),
  ).not.toHaveAttribute("style", original!);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(plot.locator(".scatterlayer .js-line").first()).toHaveAttribute(
    "style",
    original!,
  );
  await page.getByRole("button", { name: "重做", exact: true }).click();
  expect(
    (
      await (
        await request.get(`/api/projects/${f.project.id}/charts/${f.chart.id}`)
      ).json()
    ).revision,
  ).toBe(1);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: true })).toBeVisible();
  await page.reload();
  await expect(plot.locator(".scatterlayer .js-line").first()).toHaveAttribute(
    "style",
    /rgb\(0, 114, 178\)/,
  );
  const saved = await (
    await request.get(`/api/projects/${f.project.id}/charts/${f.chart.id}`)
  ).json();
  expect(saved.config.axes.y.min).toBe("0.5");
  expect(saved.config.axes.y.max).toBe("1");
  expect(saved.config.series.map((s: any) => s.y)).toEqual(
    f.config.series.map((s) => s.y),
  );
  expect(saved.config.style.title).toBe(f.config.style.title);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("文件格式", { exact: true }).selectOption("svg");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  const file = await (await downloading).path();
  const svg = fs.readFileSync(file!, "utf8");
  expect(svg).toContain("rgb(0, 114, 178)");
  expect(svg).toContain(f.config.style.title);
  expect(svg).not.toContain("<image");
  expect(errors).toEqual([]);
});

test("personal templates support project search, preview, rename, delete protection and persistence", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const other = await (
    await request.post("/api/projects", {
      data: {
        name: `跨项目样式来源 ${Date.now()}`,
        description: "测试创建的模板将在结束时清理",
      },
    })
  ).json();
  ownedProjects.add(other.id);
  const sample = structuredClone(f.config);
  sample.style.fontSize = 20;
  sample.series[0].color = "#de743d";
  expect(
    (
      await request.post(`/api/projects/${other.id}/style-templates`, {
        data: { name: "Blue & amber", config: sample },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto(f.url);
  await expect(page.getByTestId("plot")).toBeVisible();
  await page.getByRole("button", { name: "复用", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "这里还没有个人模板" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "预览模板 Blue & amber" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "保存为模板", exact: true })
    .first()
    .click();
  await page.getByLabel("模板名称", { exact: true }).fill("我的论文样式");
  await page.getByRole("button", { name: "保存当前样式", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "预览模板 我的论文样式", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "重命名 我的论文样式", exact: true })
    .click();
  await page.getByLabel("新模板名称", { exact: true }).fill("论文终稿 · 单栏");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "预览模板 论文终稿 · 单栏", exact: true }),
  ).toBeVisible();
  await page.getByLabel("模板项目范围", { exact: true }).selectOption("all");
  await page.getByLabel("搜索样式模板", { exact: true }).fill("Blue & amber");
  expect(await page.getByLabel("搜索样式模板").evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(32);
  await page
    .getByRole("button", { name: "预览模板 Blue & amber", exact: true })
    .click();
  await expect(
    page.getByLabel("当前数据样式预览", { exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(
    page
      .getByLabel("当前数据样式预览")
      .locator(".scatterlayer .js-line")
      .first(),
  ).toHaveAttribute("style", /rgb\(222, 116, 61\)/);
  await page.screenshot({
    path: "../docs/screenshots/styles-personal.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "应用样式 Blue & amber", exact: true })
    .click();
  await expect(
    page.getByTestId("plot").locator(".scatterlayer .js-line").first(),
  ).toHaveAttribute("style", /rgb\(222, 116, 61\)/);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "复用", exact: true }).click();
  await page
    .getByRole("button", { name: "删除 论文终稿 · 单栏", exact: true })
    .click();
  await page.getByRole("button", { name: "保留模板", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "预览模板 论文终稿 · 单栏", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "删除 论文终稿 · 单栏", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除模板", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "这里还没有个人模板" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.reload();
  const saved = await (
    await request.get(`/api/projects/${f.project.id}/charts/${f.chart.id}`)
  ).json();
  expect(saved.revision).toBe(1);
  expect(saved.config).toEqual(f.config);
});

test("preview renders grouped bars, scatter points and vector heatmap cells without changing saved charts", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const heat = await (
    await request.post(`/api/projects/${f.project.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-matrix.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "epoch,model,value\n1,A,0.7\n1,B,0.8\n2,A,0.85\n2,B,0.95",
          ),
        },
      },
    })
  ).json();
  for (const type of ["bar", "scatter", "heatmap"] as const) {
    const config =
      type === "heatmap" ? defaults(heat) : structuredClone(f.config);
    config.type = type;
    config.style.title = `${type} · synthetic demo`;
    if (type === "heatmap") {
      config.x = "epoch";
      config.heatY = "model";
      config.heatZ = "value";
      config.heatmap!.labels = true;
    }
    const saved = await (
      await request.post(`/api/projects/${f.project.id}/charts`, {
        data: { name: `${type} preview`, config },
      })
    ).json();
    await page.goto(`/projects/${f.project.id}/figures/${saved.id}`);
    await expect(page.getByTestId("plot")).toBeVisible();
    await page.getByRole("button", { name: "复用", exact: true }).click();
    await page.getByRole("tab", { name: "内置图表样式", exact: true }).click();
    await page
      .getByRole("button", {
        name: "预览内置样式 Modern Research",
        exact: true,
      })
      .click();
    const preview = page.getByLabel("当前数据样式预览", { exact: true });
    await expect(preview).toHaveAttribute("aria-busy", "false");
    await expect(preview.getByRole("alert")).toHaveCount(0);
    await expect(preview.locator(".gtitle")).toHaveText(config.style.title);
    const shape =
      type === "bar"
        ? ".barlayer .point path"
        : type === "scatter"
          ? ".scatterlayer .point"
          : ".shapelayer path";
    expect(await preview.locator(shape).count()).toBeGreaterThanOrEqual(4);
    if (type === "heatmap") {
      await expect(preview.locator("image")).toHaveCount(0);
      await page.screenshot({
        path: "../docs/screenshots/styles-heatmap.png",
        fullPage: true,
      });
    }
    await page
      .getByRole("tab", { name: "内置图表样式", exact: true })
      .press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "个人样式模板", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    const unchanged = await (
      await request.get(`/api/projects/${f.project.id}/charts/${saved.id}`)
    ).json();
    expect(unchanged.revision).toBe(1);
    expect(unchanged.config).toEqual(config);
  }
});
