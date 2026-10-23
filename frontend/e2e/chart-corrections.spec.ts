import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import fs from "node:fs";
import {
  defaults,
  defaultClassification,
  defaultEvaluation,
  makeSeries,
  type Config,
} from "../src/editor/model";
import type { Dataset } from "../src/lib/api";
test.use({ reducedMotion: "reduce" });
async function project(request: APIRequestContext) {
  const res = await request.post("/api/projects", {
    data: {
      name: `图表修复验收 ${Date.now()}`,
      description: "Synthetic observations only",
    },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id as number;
}
async function upload(
  request: APIRequestContext,
  p: number,
  name: string,
  buffer: Buffer,
): Promise<Dataset> {
  const res = await request.post(`/api/projects/${p}/datasets`, {
    multipart: { file: { name, mimeType: "text/csv", buffer } },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}
async function save(request: APIRequestContext, p: number, config: Config) {
  const res = await request.post(`/api/projects/${p}/charts`, {
    data: { name: config.style.title, config },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}
async function exports(page: Page, stem: string, expected: string[]) {
  for (const format of ["svg", "pdf"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByLabel("文件格式", { exact: true }).selectOption(format);
    const download = page.waitForEvent("download", { timeout: 60000 });
    await page.getByRole("button", { name: "下载图表", exact: true }).click();
    await (
      await download
    ).saveAs(`../docs/exports/refactor-01-${stem}.${format}`);
  }
  const svg = fs.readFileSync(
    `../docs/exports/refactor-01-${stem}.svg`,
    "utf8",
  );
  for (const label of expected) expect(svg).toContain(label);
  expect(svg).not.toContain("<image");
  expect(
    fs
      .readFileSync(`../docs/exports/refactor-01-${stem}.pdf`)
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
}
test("grouped SEM keeps distinct colors, short legend and integer ticks in browser and vector exports", async ({
  page,
  request,
}) => {
  const p = await project(request);
  // Keep the sparse source fixture intact; this acceptance figure uses three
  // explicitly synthetic runs at every point, including Method A / epoch 3.
  const bytes = Buffer.concat([
    fs.readFileSync("../samples/synthetic-grouped-runs.csv"),
    Buffer.from(
      "Method A,3,2,0.90,synthetic_demo\nMethod A,3,3,0.94,synthetic_demo\n",
    ),
  ]);
  const raw = await upload(request, p, "synthetic-grouped-runs.csv", bytes);
  const processed = await request.post(
    `/api/projects/${p}/data/${raw.id}/process`,
    {
      data: {
        name: "SEM (synthetic)",
        rules: {
          schema_version: 1,
          mode: "aggregate",
          groupBy: ["model", "epoch"],
          metrics: ["accuracy"],
          filters: [],
          sort: [
            { field: "model", direction: "asc" },
            { field: "epoch", direction: "asc" },
          ],
          missingGroup: "include",
          error: "sem",
          observationUnit: "Independent seed per model and epoch (synthetic)",
          replicate: "seed",
          x: "epoch",
          group: "model",
          display: "band",
        },
      },
    },
  );
  expect(processed.ok()).toBeTruthy();
  const data: Dataset = await processed.json();
  const config = defaults(data);
  config.style.title = "Repeated runs (synthetic)";
  config.style.font = "Noto Sans SC";
  config.series[0].name = "Accuracy · mean ± SEM";
  config.axes.y.title = "Accuracy (mean ± SEM)";
  const chart = await save(request, p, config);
  await page.goto(`/projects/${p}/figures/${chart.id}`);
  const plot = page.getByTestId("plot");
  await expect(plot.locator(".legendtext")).toHaveText([
    "Baseline",
    "Method A",
  ]);
  await expect(plot.locator(".legendtitletext")).toHaveCount(0);
  await expect(plot.locator(".xtick text")).toHaveText(["1", "2", "3"]);
  const paint = await plot.evaluate((el: any) => ({
    lines: el.data
      .filter((t: any) => t.showlegend !== false)
      .map((t: any) => t.line.color),
    bands: el.data
      .filter((t: any) => t.fill === "toself")
      .map((t: any) => t.line.color),
    bandX: el.data.filter((t: any) => t.fill === "toself").map((t: any) => t.x),
  }));
  expect(new Set(paint.lines).size).toBe(2);
  expect(paint.bands).toEqual(paint.lines);
  expect(paint.bandX).toEqual([
    [1, 2, 3, 3, 2, 1],
    [1, 2, 3, 3, 2, 1],
  ]);
  await plot.screenshot({ path: "../docs/screenshots/refactor-01-sem.png" });
  await exports(page, "sem", ["Baseline", "Method A", "Accuracy", "SEM"]);
  expect(
    Buffer.compare(
      await (
        await request.get(`/api/projects/${p}/data/${raw.id}/original`)
      ).body(),
      bytes,
    ),
  ).toBe(0);
  const reopened = await (
    await request.get(`/api/projects/${p}/charts/${chart.id}`)
  ).json();
  expect(reopened.config).toEqual(config);
  expect(reopened.revision).toBe(1);
});
test("confusion subtitle clears the matrix and count colorbar has integer labels in SVG/PDF", async ({
  page,
  request,
}) => {
  const p = await project(request);
  const data = await upload(
    request,
    p,
    "synthetic-counts.csv",
    Buffer.from(
      "id,truth,pred\n1,A,A\n2,A,A\n3,A,A\n4,A,B\n5,B,B\n6,B,B\n7,C,C",
    ),
  );
  const c = defaults(data);
  c.type = "confusion";
  c.series = [{ ...makeSeries("id"), prediction: "pred", name: "Model A" }];
  c.classification = {
    ...defaultClassification,
    label: "truth",
    classes: ["A", "B", "C"],
  };
  c.style.title = "Classification counts (synthetic)";
  c.style.font = "Noto Sans SC";
  const chart = await save(request, p, c);
  await page.goto(`/projects/${p}/figures/${chart.id}`);
  const plot = page.getByTestId("plot");
  await expect(plot.locator(".shapelayer path")).toHaveCount(9);
  const subtitle = plot
    .locator(".annotation")
    .filter({ hasText: "Model A · n=7" });
  await expect(subtitle).toBeVisible();
  const textBox = await subtitle.boundingBox();
  const matrixTop = await plot
    .locator(".shapelayer path")
    .evaluateAll((paths) =>
      Math.min(...paths.map((p) => p.getBoundingClientRect().top)),
    );
  expect(textBox!.y + textBox!.height).toBeLessThan(matrixTop);
  expect(matrixTop - (textBox!.y + textBox!.height)).toBeLessThan(20);
  const cells = await plot.locator(".shapelayer path").evaluateAll((paths) =>
    paths.map((p) => {
      const rect = p.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const cell of cells)
    expect(Math.abs(cell.width - cell.height)).toBeLessThan(1);
  const appearance = await plot.evaluate((el: any) => ({
    showlegend: el.layout.showlegend,
    firstStop: el.data[0].marker.colorscale[0][1],
    lines: el.layout.shapes.map((s: any) => s.line),
  }));
  expect(appearance.showlegend).toBe(false);
  expect(appearance.firstStop).toBe("#f7fbff");
  const colorbarGap = await plot.evaluate((el: any) => {
    const cells = [...el.querySelectorAll(".shapelayer path")] as Element[];
    const right = Math.max(
      ...cells.map((cell) => cell.getBoundingClientRect().right),
    );
    const bar = el.querySelector(".cbfill").getBoundingClientRect();
    return bar.left - right;
  });
  expect(colorbarGap).toBeGreaterThan(0);
  expect(colorbarGap).toBeLessThan(60);
  expect(appearance.lines).toEqual(
    Array(9).fill({ width: 2, color: "#ffffff" }),
  );
  const ticks = await plot
    .locator('[class*="colorbar"] .cbaxis text')
    .allTextContents();
  expect(ticks).toEqual(["0", "1", "2", "3"]);
  await expect(plot.locator('[class*="colorbar"]')).toContainText("Count");
  await plot.screenshot({
    path: "../docs/screenshots/refactor-01-confusion.png",
  });
  await exports(page, "confusion", ["Count", "Model A", "n=7"]);
});
test("new AUC/AP legend is persisted and exported while legacy missing option stays off", async ({
  page,
  request,
}) => {
  const p = await project(request);
  const data = await upload(
    request,
    p,
    "synthetic-ranking.csv",
    Buffer.from("label,score\n0,0.1\n0,0.4\n1,0.35\n1,0.8"),
  );
  const c = defaults(data);
  c.type = "roc";
  // Task09 hides new ungrouped single-series legends by default. This fixture
  // explicitly tests visible AUC/AP legends, including legacy saved settings.
  c.legend.show = true;
  c.series = [{ ...makeSeries("score"), name: "Model A" }];
  c.evaluation = { ...defaultEvaluation, label: "label", positive: "1" };
  c.style.title = "ROC evaluation (synthetic)";
  c.style.font = "Noto Sans SC";
  const chart = await save(request, p, c);
  await page.goto(`/projects/${p}/figures/${chart.id}`);
  const plot = page.getByTestId("plot");
  await expect(plot.locator(".legendtext")).toHaveText([
    "Model A (AUC = 0.750)",
  ]);
  const aspect = await plot.evaluate((el: any) => ({
    width: el._fullLayout.xaxis._length,
    height: el._fullLayout.yaxis._length,
    canvas: [el.layout.width, el.layout.height],
  }));
  expect(Math.abs(aspect.width - aspect.height)).toBeLessThan(1);
  expect(aspect.canvas).toEqual([760, 500]);
  await plot.screenshot({ path: "../docs/screenshots/refactor-01-roc.png" });
  await exports(page, "roc", ["AUC = 0.750"]);
  c.type = "pr";
  c.style.title = "PR evaluation (synthetic)";
  const pr = await save(request, p, c);
  await page.goto(`/projects/${p}/figures/${pr.id}`);
  await expect(plot.locator(".legendtext")).toHaveText([
    "Model A (AP = 0.833)",
  ]);
  delete c.evaluation!.legendMetric;
  c.type = "roc";
  c.style.title = "Legacy ROC (synthetic)";
  const old = await save(request, p, c);
  await page.goto(`/projects/${p}/figures/${old.id}`);
  await expect(plot.locator(".legendtext")).toHaveText(["Model A"]);
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "图例显示评估指标" }),
  ).not.toBeChecked();
  await page.getByRole("switch", { name: "图例显示评估指标" }).check();
  await expect(plot.locator(".legendtext")).toHaveText([
    "Model A (AUC = 0.750)",
  ]);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: true })).toBeVisible();
  await page.reload();
  const actual = await (
    await request.get(`/api/projects/${p}/charts/${old.id}`)
  ).json();
  expect(actual.config.evaluation.legendMetric).toBe(true);
  expect(actual.config.legend.show).toBe(true);
  expect(actual.config.schema_version).toBe(1);
});
