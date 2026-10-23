import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
test("real project → CSV → interactive plot → MySQL → reopen → SVG/PNG", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "新建项目", exact: true })
    .first()
    .click();
  await page.getByLabel("项目名称").fill("视觉模型研究 · E2E " + Date.now());
  await page
    .getByLabel("研究简介")
    .fill("合成演示数据，用于验证 LabFlow 的完整可复现流程。");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page.getByText("项目已创建，可以上传实验数据了")).toBeVisible();
  await page
    .getByTestId("file-upload")
    .setInputFiles(path.resolve("../samples/demo-learning-curves.csv"));
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "demo-learning-curves.csv" }),
  ).toBeVisible();
  await expect(page.getByText("54.2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "用于绘图" }).click();
  await expect(page.locator(".main-svg").first()).toBeVisible();
  await page.getByLabel("图表名称").fill("Learning dynamics");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Learning dynamics on CIFAR-10");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("字体", { exact: true }).selectOption("Arial");
  await page.getByLabel("字号", { exact: true }).fill("16");
  await page.getByRole("button", { name: "添加序列", exact: true }).click();
  await page.getByLabel("序列名称").fill("Proposed method");
  await page.getByLabel("Y 数值字段").selectOption("labflow_model");
  await page.getByLabel("序列颜色").fill("#269e95");
  await page
    .getByRole("button", { name: "坐标轴", exact: true })
    .last()
    .click();
  await page.getByLabel("X 轴名称").fill("Training epoch");
  await page.getByLabel("Y 轴名称").fill("Test accuracy (%)");
  await page.getByLabel("最小值", { exact: true }).nth(1).fill("50");
  await page.getByLabel("最大值", { exact: true }).nth(1).fill("100");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.locator('summary').filter({ hasText: '图例' }).click();
  await page.getByRole("switch", { name: "显示图例", exact: true }).check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "数据预览", exact: false }).click();
  await page.getByRole("button", { name: "关闭消息", exact: true }).click();
  await expect
    .poll(async () => {
      const title = await page.locator(".gtitle").first().boundingBox();
      const legend = await page.locator(".legend").first().boundingBox();
      return title && legend ? title.y + title.height < legend.y : false;
    })
    .toBe(true);
  await page.screenshot({
    path: "../docs/screenshots/editor.png",
    fullPage: true,
  });
  const configBefore = await page.getByTestId("plot").evaluate((el: any) => ({
    font: el.layout.font,
    axes: [el.layout.xaxis.title.text, el.layout.yaxis.title.text],
    colors: el.data.map((t: any) => t.line.color),
  }));
  await page.reload();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  const configAfter = await page.getByTestId("plot").evaluate((el: any) => ({
    font: el.layout.font,
    axes: [el.layout.xaxis.title.text, el.layout.yaxis.title.text],
    colors: el.data.map((t: any) => t.line.color),
  }));
  expect(configAfter).toEqual(configBefore);
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "散点图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "散点图", exact: true }).click();
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0].mode))
    .toBe("markers");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0].mode))
    .toBe("lines+markers");
  for (const format of ["svg", "png"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByLabel("文件格式").selectOption(format);
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载图表", exact: true }).click();
    const download = await waiting;
    await download.saveAs(`../docs/exports/learning-dynamics.${format}`);
    expect(
      fs.statSync(`../docs/exports/learning-dynamics.${format}`).size,
    ).toBeGreaterThan(1000);
  }
  const svg = fs.readFileSync("../docs/exports/learning-dynamics.svg", "utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("Learning dynamics on CIFAR-10");
  expect(svg).toContain("<text");
  expect(svg).not.toContain("<image");
  expect(errors).toEqual([]);
});
