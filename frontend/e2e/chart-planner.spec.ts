import { test, expect } from "@playwright/test";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
test("JSONL import → actual agent recommendation → user selection → save/reopen → SVG", async ({
  page,
  request,
}) => {
  const provider = await (await request.get("/api/agent/provider")).json();
  test.skip(
    provider.model !== "labflow-fixture",
    "Uses local fixture only; no paid model",
  );
  const project = await (
    await request.post("/api/projects", {
      data: { name: `选图验收 ${Date.now()}`, description: "合成测试" },
    })
  ).json();
  const root = `/api/projects/${project.id}`;
  await page.goto(`/projects/${project.id}/data`);
  await page.getByRole("button", { name: "上传数据文件" }).click();
  const raw =
    '{"epoch":1,"accuracy":0.7}\n{"epoch":2,"accuracy":0.8}\n{"epoch":3,"accuracy":0.9}';
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-training.jsonl",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  const upload = page.getByRole("dialog");
  await expect(upload).toContainText("accuracy");
  await expect(upload.getByRole("button", { name: /确认导入/ })).toBeEnabled();
  await upload.getByRole("button", { name: /确认导入/ }).click();
  await page.getByRole("button", { name: "选择绘图方案" }).click();
  const planner = page.getByRole("dialog", {
    name: "选择绘图方案",
    exact: true,
  });
  await planner
    .getByRole("textbox", { name: "想观察什么？" })
    .fill("观察训练轮次与准确率的变化");
  await planner.getByRole("checkbox", { name: /同意将字段名/ }).check();
  await planner
    .getByRole("button", { name: "分析并推荐", exact: true })
    .click();
  await expect(
    planner.getByRole("button", { name: "选择散点图", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(await (await request.get(`${root}/charts`)).json()).toHaveLength(0);
  await planner
    .getByRole("button", { name: "选择散点图", exact: true })
    .click();
  await expect(
    planner.locator(".js-plotly-plot .scatterlayer .point"),
  ).toHaveCount(3);
  await page.screenshot({
    path: "../docs/screenshots/chart-planner.png",
    fullPage: true,
  });
  await planner
    .getByRole("button", { name: "创建图表并编辑", exact: true })
    .click();
  await expect(page).toHaveURL(/\/figures\/\d+$/);
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "轮次与准确率",
  );
  const charts = await (await request.get(`${root}/charts`)).json();
  expect(charts).toHaveLength(1);
  const saved = await (
    await request.get(`${root}/charts/${charts[0].id}`)
  ).json();
  expect(saved.config.type).toBe("scatter");
  expect(saved.config.series[0].y).toBe("accuracy");
  expect(saved.config.series[0].error).toBe("");
  const original = await request.get(
    `${root}/data/${saved.config.datasetVersionId}/original`,
  );
  expect(await original.text()).toBe(raw);
  await page.reload();
  await expect(
    page.getByTestId("plot").locator(".scatterlayer .point"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("文件格式", { exact: true }).selectOption("svg");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.svg$/);
  const svg = fs.readFileSync((await file.path())!, "utf8");
  expect(svg).toContain("轮次与准确率");
  expect(svg).not.toContain("<image");
});

test("ambiguous JSON records and offline manual selection retain the chosen dataset version", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: `JSON 数组验收 ${Date.now()}`, description: "synthetic" },
    })
  ).json();
  await page.goto(`/projects/${project.id}/data`);
  await page.getByRole("button", { name: "上传数据文件" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "arrays.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '{"train":[{"epoch":1,"accuracy":0.7}],"test":[{"epoch":2,"accuracy":0.9}]}',
    ),
  });
  const upload = page.getByRole("dialog");
  await expect(upload.getByRole("button", { name: /确认导入/ })).toBeDisabled();
  await upload.getByLabel("JSON 记录路径").selectOption("/test");
  await expect(upload.getByRole("button", { name: /确认导入/ })).toBeEnabled();
  await upload.getByRole("button", { name: /确认导入/ }).click();
  await page.getByRole("button", { name: "选择绘图方案" }).click();
  const planner = page.getByRole("dialog", {
    name: "选择绘图方案",
    exact: true,
  });
  await planner.getByRole("combobox", { name: "图表类型", exact: true }).selectOption("scatter");
  await planner
    .getByRole("button", { name: "创建图表并编辑", exact: true })
    .click();
  await expect(page).toHaveURL(/\/figures\/\d+$/);
  const data = await (
    await request.get(`/api/projects/${project.id}/datasets`)
  ).json();
  const version = await (
    await request.get(`/api/projects/${project.id}/data/${data[0].id}`)
  ).json();
  expect(version.parse_rules.recordsPath).toBe("/test");
  expect(version.rows).toEqual([{ epoch: 2, accuracy: 0.9 }]);
});
