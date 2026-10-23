import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
test("dataset switch, undo, styles, annotations, heatmap and history", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/projects", {
    data: { name: "配置交互验收 " + Date.now(), description: "合成测试数据" },
  });
  const project = (await created.json()).id;
  const upload = async (filename: string, body: string) => {
    const r = await request.post(`/api/projects/${project}/datasets`, {
      multipart: {
        file: {
          name: filename,
          mimeType: "text/csv",
          buffer: Buffer.from(body),
        },
      },
    });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const first = await upload("first.csv", "epoch,value,error\n1,10,1\n2,20,2");
  const second = await upload(
    "second.csv",
    "epoch,value,error\n1,30,3\n2,40,4",
  );
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await expect(page.locator(".main-svg").first()).toBeVisible();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("图表标题", { exact: true }).fill("Preserved title");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("字体", { exact: true }).selectOption("Georgia");
  await page.getByLabel("绘图数据集").selectOption(String(first.id));
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0].y[0]))
    .toBe(10);
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Preserved title",
  );
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("字体", { exact: true })).toHaveValue("Georgia");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0].y[0]))
    .toBe(30);
  await page.getByRole("button", { name: "序列", exact: true }).click();
  await page.getByLabel("误差数值列").selectOption("error");
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.data[0].error_y.array),
    )
    .toEqual([3, 4]);
  await page.getByLabel("序列颜色").fill("#d99641");
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.data[0].marker.color),
    )
    .toBe("#d99641");
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "柱状图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "柱状图", exact: true }).click();
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0].type))
    .toBe("bar");
  await page.getByRole("button", { name: "注释", exact: true }).click();
  await page.getByRole("button", { name: "添加文本注释" }).click();
  await page.getByLabel("注释 1", { exact: true }).fill("Synthetic data");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.layout.annotations[0].text),
    )
    .toBe("Synthetic data");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("图表标题", { exact: true }).fill("Version two");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "版本历史" }).click();
  await page
    .locator(".version-row")
    .filter({ hasText: "版本 1" })
    .getByRole("button", { name: "载入快照" })
    .click();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Preserved title",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v3", { exact: false })).toBeVisible();
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "热力图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "热力图", exact: true }).click();
  await page.getByRole("button", { name: "图表", exact: true }).click();
  await page.getByLabel("Y 分类字段").selectOption("epoch");
  await page.getByRole("button", { name: "图表", exact: true }).click();
  await page.getByLabel("Z 数值字段").selectOption("value");
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0].type))
    .toBe("scatter");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v4", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("文件格式").selectOption("svg");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  await (await pending).saveAs("../docs/exports/heatmap.svg");
  const svg = fs.readFileSync("../docs/exports/heatmap.svg", "utf8");
  expect(svg).not.toContain("<image");
  expect(svg).toContain("shape-group");
});
test("experiment creation, editing and malformed CSV feedback", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: "实验记录验收 " + Date.now(), description: "测试" },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "实验记录", exact: true }).click();
  await page.getByRole("button", { name: "记录实验", exact: true }).click();
  await page.getByLabel("实验名称").fill("AdamW ablation");
  await page.getByRole("button", { name: "参数高级 JSON" }).click();
  await page.getByLabel("参数（JSON）").fill('{"lr":0.001,"seed":42}');
  await page.getByRole("button", { name: "指标高级 JSON" }).click();
  await page.getByLabel("指标（JSON）").fill('{"accuracy":92.8}');
  await page.getByLabel("备注", { exact: true }).fill("合成演示记录");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByRole("button", { name: /^EXP-\d+ AdamW ablation$/ })).toBeVisible();
  await page.getByRole("button", { name: "卡片", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AdamW ablation" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "编辑 AdamW ablation", exact: true })
    .click();
  await page.getByLabel("备注", { exact: true }).fill("已复核：合成演示记录");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(
    page.getByText("已复核：合成演示记录", { exact: true }),
  ).toBeVisible();
  await page.getByTestId("file-upload").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("same,same\n1,2"),
  });
  await expect(page.getByRole("alert")).toContainText("表头必须唯一");
});
