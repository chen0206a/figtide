import { test, expect } from "@playwright/test";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
test("raw labels/scores → ROC/AP → MySQL reopen → PR and vector export", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `模型评估验收 ${Date.now()}`,
        description: "Synthetic known classification samples",
      },
    })
  ).json();
  const csv = Buffer.from(
    "sample,label,score,baseline\n1,0,0.1,0.6\n2,0,0.4,0.5\n3,1,0.35,0.7\n4,1,0.8,0.3\n5,1,,",
  );
  const dataset = await (
    await request.post(`/api/projects/${p.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-evaluation.csv",
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
  await page.getByRole("button", { name: "科研绘图", exact: true }).click();
  await page.getByLabel("图表名称").fill("Binary evaluation · synthetic");
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Binary model evaluation · synthetic");
  await page
    .getByLabel("Y 轴字段 · 当前序列", { exact: true })
    .selectOption("score");
  await page.getByRole("button", { name: "ROC", exact: true }).click();
  await page.getByLabel("真实标签列").selectOption("label");
  await page.getByLabel("正类值").selectOption("1");
  await expect
    .poll(() => page.getByTestId("plot").evaluate((el: any) => el.data[0]?.x))
    .toEqual([0, 0, 0.5, 0.5, 1]);
  await page.getByRole("button", { name: "模型评估", exact: false }).click();
  await expect(page.getByRole("table", { name: "模型评估指标" })).toContainText(
    "0.7500",
  );
  await expect(page.getByRole("table", { name: "模型评估指标" })).toContainText(
    "0.8333",
  );
  const reportWaiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出评估 JSON", exact: true })
    .click();
  await (await reportWaiting).saveAs("../docs/exports/binary-evaluation.json");
  const report = JSON.parse(
    fs.readFileSync("../docs/exports/binary-evaluation.json", "utf8"),
  );
  expect(report.metrics[0]).toMatchObject({
    n: 4,
    excluded: 1,
    auc: 0.75,
    positive: 2,
    negative: 2,
  });
  expect(report.datasetVersionId).toBe(dataset.id);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "PR", exact: true }).click();
  await page.getByLabel("决策阈值").fill("0.3");
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.data[0]?.line.shape),
    )
    .toBe("vh");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Binary evaluation · synthetic/ })
    .click();
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.data[0]?.line.shape),
    )
    .toBe("vh");
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await expect(page.getByLabel("决策阈值")).toHaveValue("0.3");
  await page.getByRole("button", { name: "模型评估", exact: false }).click();
  await expect(page.getByRole("table", { name: "模型评估指标" })).toContainText(
    "0.8333",
  );
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: "../docs/screenshots/binary-pr.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  await (await waiting).saveAs("../docs/exports/binary-pr.svg");
  const svg = fs.readFileSync("../docs/exports/binary-pr.svg", "utf8");
  expect(svg).toContain("Precision");
  expect(svg).toContain("Recall");
  expect(svg).toContain("<path");
  expect(svg).not.toContain("<image");
  expect(
    await (
      await request.get(`/api/projects/${p.id}/data/${dataset.id}/original`)
    ).body(),
  ).toEqual(csv);
  expect(errors).toEqual([]);
});
test("actual bound columns → gap-safe interval → save reopen → SVG/PNG", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `实际区间验收 ${Date.now()}`,
        description: "Synthetic interval bounds, no inferred confidence",
      },
    })
  ).json();
  await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "synthetic-bounds.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "epoch,score,lower,upper\n1,0.5,0.45,0.55\n2,0.6,0.55,0.65\n3,0.7,,\n4,0.8,0.75,0.85\n5,0.85,0.8,0.9",
        ),
      },
    },
  });
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "科研绘图", exact: true }).click();
  await page.getByLabel("图表名称").fill("Actual intervals · synthetic");
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Learning dynamics · supplied intervals");
  await page.getByRole("button", { name: "序列", exact: true }).click();
  await page
    .getByRole("switch", { name: "显示实际区间带", exact: true })
    .check();
  await page.getByLabel("区间下界列").selectOption("lower");
  await page.getByLabel("区间上界列").selectOption("upper");
  await page.getByLabel("区间说明").fill("Supplied bounds · synthetic");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) =>
          el.data.filter((t: any) => t.fill === "toself").map((t: any) => t.x),
        ),
    )
    .toEqual([
      [1, 2, 2, 1],
      [4, 5, 5, 4],
    ]);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Actual intervals · synthetic/ })
    .click();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate(
          (el: any) => el.data.filter((t: any) => t.fill === "toself").length,
        ),
    )
    .toBe(2);
  await page.getByRole("button", { name: "序列", exact: true }).click();
  await expect(page.getByLabel("区间说明")).toHaveValue(
    "Supplied bounds · synthetic",
  );
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: "../docs/screenshots/actual-bands.png",
    fullPage: true,
  });
  for (const format of ["svg", "png"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByLabel("文件格式").selectOption(format);
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载图表", exact: true }).click();
    await (await waiting).saveAs(`../docs/exports/actual-bands.${format}`);
  }
  const svg = fs.readFileSync("../docs/exports/actual-bands.svg", "utf8");
  expect(svg.match(/class="js-fill"/g)).toHaveLength(2);
  expect(svg).not.toContain("<image");
  expect(
    fs.readFileSync("../docs/exports/actual-bands.png").readUInt32BE(16),
  ).toBe(1520);
  await page.getByLabel("区间下界列").selectOption("upper");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate(
          (el: any) => el.data.filter((t: any) => t.fill === "toself").length,
        ),
    )
    .toBe(2);
  await page.getByLabel("区间上界列").selectOption("lower");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "区间下界" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
