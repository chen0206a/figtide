import { test, expect } from "./workspace-test";
import fs from "node:fs";
import { classificationReports } from "../src/editor/classification";
test.use({ reducedMotion: "reduce" });
const csv = Buffer.from(
  "id,truth,a,b\n1,A,A,A\n2,A,B,\n3,B,B,C\n4,B,C,B\n5,C,C,C\n6,C,C,A\n7,C,,C\n8,,A,A\n9,A,,B",
);
test("true/predicted labels → multiclass counts → common normalized matrix → MySQL → Java report/SVG/PNG", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `多分类评估验收 ${Date.now()}`,
        description: "synthetic known 3 class samples",
      },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${p.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-classes.csv",
          mimeType: "text/csv",
          buffer: csv,
        },
      },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await page
    .getByLabel("图表名称")
    .fill("Multiclass common samples · synthetic");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Synthetic classification · common samples");
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "混淆矩阵", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "混淆矩阵", exact: true }).click();
  await page.getByLabel("分类真实标签列").selectOption("truth");
  await page.getByRole("button", { name: "序列", exact: true }).click();
  await page.getByLabel("序列名称", { exact: true }).fill("Model A");
  await page.getByLabel("预测标签列", { exact: true }).selectOption("a");
  await page.getByRole("button", { name: "添加序列", exact: true }).click();
  await page.getByLabel("序列名称", { exact: true }).fill("Model B");
  await page.getByLabel("预测标签列", { exact: true }).selectOption("b");
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await page
    .getByRole("button", { name: "读取真实与预测类别", exact: true })
    .click();
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.layout.shapes?.length),
    )
    .toBe(9);
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) =>
          el.layout.annotations
            .filter((a: any) => a.xref === "x")
            .map((a: any) => a.text),
        ),
    )
    .toEqual(["1", "1", "0", "0", "1", "1", "0", "0", "2"]);
  await page.getByRole("button", { name: "模型评估", exact: false }).click();
  await expect(
    page.getByRole("table", { name: "Model A 分类指标" }),
  ).toContainText("0.6556");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await page.getByLabel("矩阵归一化").selectOption("true");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.layout.annotations[0]?.text),
    )
    .toBe("1<br>50.0%");
  await page.getByLabel("有效样本策略").selectOption("intersection");
  await page.getByLabel("样本 ID 列").selectOption("id");
  await page.getByRole("button", { name: "模型评估", exact: false }).click();
  await expect(page.locator(".classification-report").first()).toContainText(
    "n=5",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
  await page.reload();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.layout.annotations[0]?.text),
    )
    .toBe("1<br>100.0%");
  await page.getByRole("button", { name: "模型评估", exact: false }).click();
  const waitingReport = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出分类报告 JSON", exact: true })
    .click();
  await (await waitingReport).saveAs("../docs/exports/multiclass-report.json");
  const charts = await (
    await request.get(`/api/projects/${p.id}/charts`)
  ).json();
  const chart = await (
    await request.get(`/api/projects/${p.id}/charts/${charts[0].id}`)
  ).json();
  const report = JSON.parse(
    fs.readFileSync("../docs/exports/multiclass-report.json", "utf8"),
  );
  expect(report.reports).toEqual(
    classificationReports(chart.config, data.rows).reports,
  );
  expect(report.reports.map((r: any) => r.sampleRows)).toEqual([
    [1, 3, 4, 5, 6],
    [1, 3, 4, 5, 6],
  ]);
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await page.locator(".inspector-scroll").evaluate((el) => (el.scrollTop = 0));
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: "../docs/screenshots/multiclass-matrix.png",
    fullPage: true,
  });
  for (const format of ["svg", "png"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByLabel("文件格式").selectOption(format);
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载图表", exact: true }).click();
    await (await waiting).saveAs(`../docs/exports/multiclass-matrix.${format}`);
  }
  const svg = fs.readFileSync("../docs/exports/multiclass-matrix.svg", "utf8");
  expect(svg).toContain("Predicted class");
  expect(svg).toContain("True class");
  expect(svg).toContain("100.0%");
  expect(svg).not.toContain("<image");
  expect(
    fs.readFileSync("../docs/exports/multiclass-matrix.png").readUInt32BE(16),
  ).toBe(1520);
  expect(
    await (
      await request.get(`/api/projects/${p.id}/data/${data.id}/original`)
    ).body(),
  ).toEqual(csv);
  expect(errors).toEqual([]);
  await page.getByLabel("类别 3", { exact: true }).fill("unknown");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".toast[role=status]").filter({ hasText: "未知类别" }),
  ).toBeVisible();
  expect(
    (
      await (
        await request.get(`/api/projects/${p.id}/charts/${chart.id}`)
      ).json()
    ).revision,
  ).toBe(2);
});
test("paired ROC retains the full model intersection in series facets and rejects nonunique IDs", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `共同样本 ROC 验收 ${Date.now()}`,
        description: "synthetic scores with unequal missingness",
      },
    })
  ).json();
  await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "synthetic-common.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "id,label,a,b\n1,0,0.1,0.2\n2,0,0.4,0.3\n3,1,0.35,\n4,1,0.8,0.9",
        ),
      },
    },
  });
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await page.getByLabel("图表名称").fill("Common ROC · synthetic");
  await page.getByRole("button", { name: "图表", exact: true }).click();
  await page
    .getByLabel("Y 轴字段 · 当前序列", { exact: true })
    .selectOption("a");
  await page.getByRole("button", { name: "添加序列", exact: true }).click();
  await page.getByLabel("Y 数值字段", { exact: true }).selectOption("b");
  if (
    !(await page.getByRole("button", { name: "ROC", exact: true }).isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "ROC", exact: true }).click();
  await page.getByLabel("真实标签列", { exact: true }).selectOption("label");
  await page.getByLabel("正类值", { exact: true }).selectOption("1");
  await page.getByLabel("有效样本策略").selectOption("intersection");
  await page.getByLabel("样本 ID 列").selectOption("id");
  await page.getByLabel("分面方式").selectOption("series");
  await page
    .getByRole("button", { name: "适配多子图画布", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) =>
          el.data.filter((t: any) => t.customdata).map((t: any) => [t.x, t.y]),
        ),
    )
    .toEqual([
      [
        [0, 0, 0.5, 1],
        [0, 1, 1, 1],
      ],
      [
        [0, 0, 0.5, 1],
        [0, 1, 1, 1],
      ],
    ]);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await page.getByLabel("样本 ID 列").selectOption("label");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".toast[role=status]").filter({ hasText: "样本 ID" }),
  ).toBeVisible();
});
