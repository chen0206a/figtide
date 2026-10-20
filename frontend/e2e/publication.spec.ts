import { test, expect } from "@playwright/test";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
test("histogram and ECDF → physical typography → real MySQL reopen → mm SVG and DPI PNG", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `论文尺寸验收 ${Date.now()}`,
        description: "synthetic known observations",
      },
    })
  ).json();
  const csv = Buffer.from("model,value\nA,0\nA,1\nA,2\nA,3\nA,4\nA,");
  const upload = await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "known-observations.csv",
        mimeType: "text/csv",
        buffer: csv,
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const dataset = await upload.json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "科研绘图", exact: true }).click();
  await page
    .getByLabel("图表名称")
    .fill("Publication distributions · synthetic");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Synthetic observations");
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "直方图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "直方图", exact: true }).click();
  await page.getByLabel("等宽分箱数量").fill("2");
  await page.getByLabel("分箱起点", { exact: true }).fill("0");
  await page.getByLabel("分箱终点", { exact: true }).fill("4");
  await page.getByLabel("直方图纵轴").selectOption("probability");
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0]?.y))
    .toEqual([0.4, 0.6]);
  await page
    .getByRole("switch", { name: "按论文物理尺寸输出", exact: true })
    .check();
  await page.getByRole("button", { name: "单栏 89 mm", exact: true }).click();
  await page.getByLabel("成品基础字号 / pt").fill("7");
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.layout.font.size),
    )
    .toBeCloseTo((((7 * 25.4) / 72) * 760) / 89, 5);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await page.getByRole("button", { name: "关闭消息", exact: true }).click();
  await page.locator(".inspector-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: "../docs/screenshots/publication-histogram.png",
    fullPage: true,
  });
  for (const format of ["svg", "png"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByLabel("文件格式").selectOption(format);
    await expect(page.locator(".export-summary")).toContainText(
      format === "png" ? "1051" : "SVG",
    );
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载图表", exact: true }).click();
    await (
      await waiting
    ).saveAs(`../docs/exports/publication-histogram.${format}`);
  }
  const svg = fs.readFileSync(
    "../docs/exports/publication-histogram.svg",
    "utf8",
  );
  expect(svg).toContain('width="89mm"');
  expect(svg).toContain('viewBox="0 0 760 500"');
  expect(svg).toContain("<text");
  expect(svg).not.toContain("<image");
  const png = fs.readFileSync("../docs/exports/publication-histogram.png");
  expect(png.readUInt32BE(16)).toBe(1051);
  expect(png.readUInt32BE(20)).toBe(691);
  const phys = png.indexOf(Buffer.from("pHYs"));
  expect(phys).toBeGreaterThan(0);
  expect(png.readUInt32BE(phys + 4)).toBe(Math.round(1051 / 0.089));
  expect(png[phys + 12]).toBe(1);
  if (
    !(await page.getByRole("button", { name: "ECDF", exact: true }).isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "ECDF", exact: true }).click();
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0]?.y))
    .toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  await page.getByLabel("观测轴标题").fill("Observed value");
  await page.getByLabel("分布轴标题").fill("Cumulative probability");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
  const charts = await (
    await request.get(`/api/projects/${p.id}/charts`)
  ).json();
  const saved = await (
    await request.get(`/api/projects/${p.id}/charts/${charts[0].id}`)
  ).json();
  expect(saved.config.publication).toMatchObject({
    enabled: true,
    widthMm: 89,
    fontPt: 7,
    dpi: 300,
  });
  expect(saved.config.empirical.bins).toBe(2);
  await page.reload();
  await page
    .getByRole("button", { name: /Publication distributions · synthetic/ })
    .click();
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.data[0]?.line.shape),
    )
    .toBe("hv");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.layout.yaxis.title.text),
    )
    .toBe("Cumulative probability");
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await expect(page.getByLabel("成品基础字号 / pt")).toHaveValue("7");
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.locator(".inspector-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: "../docs/screenshots/publication-ecdf.png",
    fullPage: true,
  });
  expect(
    await (
      await request.get(`/api/projects/${p.id}/data/${dataset.id}/original`)
    ).body(),
  ).toEqual(csv);
  expect(errors).toEqual([]);
});

test("scientific heatmap scale, contrasting numeric labels, and rejected invalid range", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `科学色阶验收 ${Date.now()}`,
        description: "synthetic matrix",
      },
    })
  ).json();
  await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "matrix.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("x,y,value\nA,A,-2\nB,A,0\nA,B,3\nB,B,6"),
      },
    },
  });
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "科研绘图", exact: true }).click();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Synthetic effect matrix");
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "热力图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "热力图", exact: true }).click();
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await page.getByLabel("连续色阶").selectOption("blueRed");
  await page.getByLabel("色阶最小值").fill("-2");
  await page.getByLabel("色阶最大值").fill("6");
  await page.getByLabel("色阶中心值").fill("0");
  await page
    .getByRole("switch", { name: "显示单元格数值", exact: true })
    .check();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.layout.annotations.map((a: any) => a.text)),
    )
    .toEqual(["-2", "0", "3", "6"]);
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.layout.shapes[1]?.fillcolor),
    )
    .toBe("#f7f7f7");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await page.getByRole("button", { name: "关闭消息", exact: true }).click();
  await page.getByLabel("色阶中心值").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: "../docs/screenshots/scientific-heatmap.png",
    fullPage: true,
  });
  await page.getByLabel("色阶最小值").fill("10");
  await expect(page.locator(".canvas-empty-plot")).toContainText("色阶无效");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "色阶最小值" }),
  ).toBeVisible();
  const chart = await (
    await request.get(`/api/projects/${p.id}/charts`)
  ).json();
  const saved = await (
    await request.get(`/api/projects/${p.id}/charts/${chart[0].id}`)
  ).json();
  expect(saved.revision).toBe(1);
  expect(saved.config.heatmap.center).toBe("0");
});
