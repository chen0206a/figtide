import { test, expect, type APIRequestContext } from "./workspace-test";
import { defaults, makeSeries } from "../src/editor/model";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
async function fixture(request: APIRequestContext) {
  const project = await (
    await request.post("/api/projects", {
      data: {
        name: `绘图工具验收 ${Date.now()}`,
        description: "合成演示数据，非真实实验",
      },
    })
  ).json();
  const csv =
    "epoch,baseline,ours\n1,0.65,0.7\n2,0.73,0.81\n3,0.79,0.9\n4,0.82,0.94";
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-tools.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csv),
        },
      },
    })
  ).json();
  const config = defaults(data);
  config.series = ["baseline", "ours"].map((y, i) => makeSeries(y, i));
  config.legend.show = true;
  config.style.title = "Before adjustments";
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "批量绘图调整 · 合成", config },
    })
  ).json();
  return {
    project,
    data,
    chart,
    config,
    csv,
    url: `/projects/${project.id}/figures/${chart.id}`,
    api: `/api/projects/${project.id}/charts/${chart.id}`,
  };
}
test("five real tools → isolated preview → one undo step → MySQL reopen and SVG", async ({
  page,
  request,
}) => {
  const f = await fixture(request),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.url);
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    f.config.style.title,
  );
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快捷操作", exact: true });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("spinbutton", { name: "字号（px）", exact: true })
    .fill("18");
  await dialog
    .getByRole("checkbox", { name: "调整图表标题", exact: true })
    .check();
  await dialog
    .getByRole("textbox", { name: "图表标题", exact: true })
    .fill("Tool preview · synthetic");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("set_legend");
  await dialog
    .getByRole("combobox", { name: "图例位置", exact: true })
    .selectOption("bottom");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("set_axis");
  await dialog
    .getByRole("combobox", { name: "网格线", exact: true })
    .selectOption("false");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("set_series");
  await dialog
    .getByRole("textbox", { name: "颜色", exact: true })
    .fill("#0072b2");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("set_canvas");
  await dialog
    .getByRole("spinbutton", { name: "宽度", exact: true })
    .fill("900");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/figure-tools/preview") &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "验证并预览", exact: true }).click();
  const checked = await response;
  expect(checked.ok()).toBeTruthy();
  const result = await checked.json();
  expect(result.operation_count).toBe(5);
  expect(result.source.sha256).toBe(f.data.sha256);
  const apply = dialog.getByRole("button", {
    name: "应用这组调整",
    exact: true,
  });
  await expect(apply).toBeEnabled();
  await expect(dialog.getByLabel("当前数据样式预览")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dialog.locator(".gtitle")).toHaveText(
    "Tool preview · synthetic",
  );
  expect((await (await request.get(f.api)).json()).config).toEqual(f.config);
  expect((await (await request.get(`${f.api}/versions`)).json()).length).toBe(
    1,
  );
  expect(await page.getByTestId("plot").locator(".gtitle").textContent()).toBe(
    f.config.style.title,
  );
  await dialog
    .locator(".quick-actions-builder")
    .evaluate((el) => el.scrollTo(0, 0));
  await page.screenshot({
    path: "../docs/screenshots/quick-actions.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(apply).toBeInViewport();
  const boxes = await dialog.locator(".quick-result").evaluate((el) => ({
    scroll: el.querySelector(".quick-result-scroll")!.getBoundingClientRect()
      .bottom,
    footer: el.querySelector(".quick-result-footer")!.getBoundingClientRect()
      .top,
  }));
  expect(boxes.scroll).toBeLessThanOrEqual(boxes.footer + 1);
  await apply.click();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Tool preview · synthetic",
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    f.config.style.title,
  );
  await expect(
    page.getByRole("button", { name: "撤销", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Tool preview · synthetic",
  );
  const saved = await (await request.get(f.api)).json();
  expect(saved.config).toEqual(result.config);
  const original = await request.get(
    `/api/projects/${f.project.id}/data/${f.data.id}/original`,
  );
  expect(await original.body()).toEqual(Buffer.from(f.csv));
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("文件格式", { exact: true }).selectOption("svg");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  const svg = fs.readFileSync((await (await download).path())!, "utf8");
  expect(svg).toContain("Tool preview · synthetic");
  expect(svg).toContain("rgb(0, 114, 178)");
  expect(svg).not.toContain("<image");
  expect(errors).toEqual([]);
});

test("invalid batch and newer server revision cannot apply; physical pt uses the same tool contract", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await expect(page.getByTestId("plot")).toBeVisible();
  await page.getByRole("button", { name: "快捷操作", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "快捷操作", exact: true });
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("set_axis");
  await dialog
    .getByRole("checkbox", { name: "调整最小值", exact: true })
    .check();
  await dialog
    .getByRole("spinbutton", { name: "最小值", exact: true })
    .fill("10");
  await dialog
    .getByRole("checkbox", { name: "调整最大值", exact: true })
    .check();
  await dialog
    .getByRole("spinbutton", { name: "最大值", exact: true })
    .fill("1");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  await dialog.getByRole("button", { name: "验证并预览", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("最小值必须小于最大值");
  await expect(
    dialog.getByRole("button", { name: "应用这组调整", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "移除第 1 项调整", exact: true })
    .click();
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("set_style");
  await dialog
    .getByRole("spinbutton", { name: "字号（px）", exact: true })
    .fill("18");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  const updated = structuredClone(f.config);
  updated.style.title = "Updated elsewhere";
  updated.publication!.enabled = true;
  updated.publication!.widthMm = 89;
  expect(
    (
      await request.put(f.api, {
        data: { name: f.chart.name, revision: 1, config: updated },
      })
    ).ok(),
  ).toBeTruthy();
  await dialog.getByRole("button", { name: "验证并预览", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("有新版本");
  await expect(
    dialog.getByRole("button", { name: "应用这组调整", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Updated elsewhere",
  );
  await page.keyboard.press("Control+k");
  await dialog
    .getByRole("spinbutton", { name: "成品字号（pt）", exact: true })
    .fill("9");
  await expect(
    dialog.getByRole("spinbutton", { name: "字号（px）", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/figure-tools/preview"),
  );
  await dialog.getByRole("button", { name: "验证并预览", exact: true }).click();
  const result = await (await response).json();
  expect(result.changes).toEqual([
    { path: "/publication/fontPt", before: 8, after: 9 },
  ]);
  await expect(
    dialog.getByRole("button", { name: "应用这组调整", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  expect((await (await request.get(f.api)).json()).revision).toBe(2);
});

test("ROC tools use the displayed axis title and do not offer fixed range controls", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const data = await (
    await request.post(`/api/projects/${f.project.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-roc-tools.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("label,score\n0,0.1\n1,0.9\n0,0.4\n1,0.8"),
        },
      },
    })
  ).json();
  const config = defaults(data);
  config.type = "roc";
  config.series = [makeSeries("score")];
  config.evaluation = {
    algorithm: "binary-ranking-v1",
    missing: "exclude",
    label: "label",
    positive: "1",
    threshold: 0.5,
    baseline: true,
    rocXTitle: "",
    rocYTitle: "",
    prXTitle: "",
    prYTitle: "",
  };
  const saved = await (
    await request.post(`/api/projects/${f.project.id}/charts`, {
      data: { name: "ROC 工具标题 · 合成", config },
    })
  ).json();
  await page.goto(`/projects/${f.project.id}/figures/${saved.id}`);
  await expect(page.getByTestId("plot")).toBeVisible();
  await page.getByRole("button", { name: "快捷操作", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "快捷操作", exact: true });
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("set_axis");
  await expect(
    dialog.getByRole("spinbutton", { name: "最小值", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("combobox", { name: "坐标类型", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "坐标轴", exact: true })
    .selectOption("x");
  await dialog
    .getByRole("checkbox", { name: "调整轴标题", exact: true })
    .check();
  await dialog
    .getByRole("textbox", { name: "轴标题", exact: true })
    .fill("False alarm rate");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/figure-tools/preview"),
  );
  await dialog.getByRole("button", { name: "验证并预览", exact: true }).click();
  const result = await (await response).json();
  expect(result.config.evaluation.rocXTitle).toBe("False alarm rate");
  expect(result.config.evaluation.label).toBe("label");
  expect(result.config.evaluation.positive).toBe("1");
  await expect(dialog.getByLabel("当前数据样式预览")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dialog.locator(".xtitle")).toHaveText("False alarm rate");
  await dialog
    .getByRole("button", { name: "应用这组调整", exact: true })
    .click();
  await expect(page.getByTestId("plot").locator(".xtitle")).toHaveText(
    "False alarm rate",
  );
  const original = await (
    await request.get(`/api/projects/${f.project.id}/charts/${saved.id}`)
  ).json();
  expect(original.revision).toBe(1);
  expect(original.config.evaluation.rocXTitle).toBe("");
});

test("structure tools add a series, apply as one step, and undo in one step", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await expect(page.getByTestId("plot")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快捷操作", exact: true });
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("add_series");
  await expect(dialog.getByRole("textbox", { name: "序列标识", exact: true }))
    .toHaveValue(/^s\d+$/);
  await dialog
    .getByRole("combobox", { name: "Y 数值字段", exact: true })
    .selectOption("baseline");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/figure-tools/preview"),
  );
  await dialog.getByRole("button", { name: "验证并预览", exact: true }).click();
  const result = await (await response).json();
  expect(result.config.series).toHaveLength(3);
  expect(result.changes.map((c: { path: string }) => c.path)).toEqual([
    "/series",
  ]);
  await dialog
    .getByRole("button", { name: "应用这组调整", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("plot").locator(".legendtext")).toHaveCount(3);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByTestId("plot").locator(".legendtext")).toHaveCount(2);
  expect((await (await request.get(f.api)).json()).config).toEqual(f.config);
});

test("switching chart type is validated, persisted, and survives reload", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await expect(page.getByTestId("plot")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快捷操作", exact: true });
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("set_chart");
  const types = dialog.getByRole("combobox", {
    name: "图表类型",
    exact: true,
  });
  await expect(types.locator("option", { hasText: "ROC 曲线" })).toHaveCount(0);
  await types.selectOption("scatter");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  await dialog.getByRole("button", { name: "验证并预览", exact: true }).click();
  await dialog
    .getByRole("button", { name: "应用这组调整", exact: true })
    .click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("plot")).toBeVisible();
  const saved = await (await request.get(f.api)).json();
  expect(saved.config.type).toBe("scatter");
  expect(saved.config.series).toHaveLength(2);
});

test("deleting the last series is rejected and never yields a preview", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const single = { ...f.config, series: [f.config.series[0]] };
  const chart = await (
    await request.post(`/api/projects/${f.project.id}/charts`, {
      data: { name: "单序列 · 合成", config: single },
    })
  ).json();
  await page.goto(`/projects/${f.project.id}/figures/${chart.id}`);
  await expect(page.getByTestId("plot")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快捷操作", exact: true });
  await dialog
    .getByLabel("选择快捷操作", { exact: true })
    .selectOption("remove_series");
  await dialog
    .getByRole("button", { name: "加入调整清单", exact: true })
    .click();
  await dialog.getByRole("button", { name: "验证并预览", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("至少保留一条序列");
  await expect(
    dialog.getByRole("button", { name: "应用这组调整", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("plot").locator(".legendtext")).toHaveCount(1);
  const stored = await (
    await request.get(`/api/projects/${f.project.id}/charts/${chart.id}`)
  ).json();
  expect(stored.revision).toBe(1);
  expect(stored.config.series).toHaveLength(1);
});
