import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
const csv = Buffer.from(
  "model,epoch,seed,accuracy\nA,2,1,4\nB,2,1,8\nA,1,1,1\nA,1,2,2\nA,1,3,3\nA,1,4,\nA,2,2,6\nB,1,1,3\nB,1,2,5\nB,1,3,7",
);
async function group(page: Page) {
  await page.getByLabel("分组字段 model", { exact: true }).check();
  await page.getByLabel("分组字段 epoch", { exact: true }).check();
  await page
    .getByLabel("每行代表的观测单位")
    .fill("同一模型、epoch 下独立 seed 的一次运行");
  await page.getByLabel("重复标识列").selectOption("seed");
  await page.getByLabel("汇总图 X 字段").selectOption("epoch");
  await page.getByLabel("汇总图类别分组").selectOption("model");
  await page.getByRole("button", { name: "添加结果排序", exact: true }).click();
  await page.getByLabel("排序字段 1").selectOption("model");
  await page.getByRole("button", { name: "添加结果排序", exact: true }).click();
  await page.getByLabel("排序字段 2").selectOption("epoch");
}
test("raw repeated observations → exact SEM preview → MySQL → auto mapped figure → reopen/export", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `重复实验汇总验收 ${Date.now()}`,
        description: "synthetic known sample means",
      },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${p.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-repeats.csv",
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
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  await page.getByRole("button", { name: "处理与统计", exact: true }).click();
  await page.getByLabel("结果名称").fill("Known means SEM · synthetic");
  await group(page);
  await page.getByLabel("误差口径").selectOption("sem");
  const previewResponse = page.waitForResponse((r) =>
    r.url().endsWith("/process/preview"),
  );
  await page.getByRole("button", { name: "预览处理结果", exact: true }).click();
  const preview = await (await previewResponse).json();
  await expect(page.getByLabel("处理结果预览")).toContainText(
    "源数据 10 行 → 结果 4 行",
  );
  expect(preview.rows[0]).toMatchObject({
    epoch: 1,
    accuracy__mean: 2,
    accuracy__n: 3,
    accuracy__missing: 1,
  });
  expect(preview.rows[0].accuracy__sem).toBeCloseTo(1 / Math.sqrt(3), 14);
  expect(
    (await (await request.get(`/api/projects/${p.id}/datasets`)).json()).length,
  ).toBe(1);
  await page.getByLabel("处理结果预览").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/screenshots/processing-preview.png",
    fullPage: true,
  });
  const savedResponse = page.waitForResponse(
    (r) => r.url().endsWith("/process") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "保存并绘图", exact: true }).click();
  const saved = await (await savedResponse).json();
  expect(saved.rows).toEqual(preview.rows);
  expect(saved.fields).toEqual(preview.fields);
  expect(saved.source_meta.rules.error).toBe("sem");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) =>
          el.data
            .filter((t: any) => t.showlegend !== false)
            .map((t: any) => t.y),
        ),
    )
    .toEqual([
      [2, 5],
      [5, 8],
    ]);
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.data[0]?.error_y?.array),
    )
    .toEqual([preview.rows[0].accuracy__sem, preview.rows[1].accuracy__sem]);
  await page.getByLabel("图表名称").fill("Grouped SEM · synthetic");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.reload();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.data[0]?.error_y?.array),
    )
    .toEqual([preview.rows[0].accuracy__sem, preview.rows[1].accuracy__sem]);
  await page.getByRole("button", { name: "数据处理来源", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "同一模型、epoch 下独立 seed 的一次运行",
  );
  await expect(page.getByRole("dialog")).toContainText(data.sha256);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: "../docs/screenshots/processing-sem.png",
    fullPage: true,
  });
  for (const format of ["svg", "png"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByLabel("文件格式").selectOption(format);
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载图表", exact: true }).click();
    await (await waiting).saveAs(`../docs/exports/processing-sem.${format}`);
  }
  const svg = fs.readFileSync("../docs/exports/processing-sem.svg", "utf8");
  expect(svg).toContain("errorbar");
  expect(svg).toContain("SEM");
  expect(svg).not.toContain("<image");
  expect(
    fs.readFileSync("../docs/exports/processing-sem.png").readUInt32BE(16),
  ).toBe(1520);
  expect(
    await (
      await request.get(`/api/projects/${p.id}/data/${data.id}/original`)
    ).body(),
  ).toEqual(csv);
  expect(errors).toEqual([]);
});
test("duplicate run guard → repair groups → interval preview invalidation → real band mapping", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `统计区间验收 ${Date.now()}`,
        description: "synthetic groups, known missing interval",
      },
    })
  ).json();
  await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "synthetic-repeats.csv",
        mimeType: "text/csv",
        buffer: csv,
      },
    },
  });
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  await page.getByRole("button", { name: "处理与统计", exact: true }).click();
  await page.getByLabel("分组字段 model", { exact: true }).check();
  await page
    .getByLabel("每行代表的观测单位")
    .fill("independent seeds at each epoch");
  await page.getByLabel("重复标识列").selectOption("seed");
  await page.getByRole("button", { name: "预览处理结果", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("重复标识");
  await expect(
    page.getByRole("button", { name: "保存并绘图", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("分组字段 model", { exact: true }).uncheck();
  await group(page);
  await page.getByLabel("误差显示方式").selectOption("band");
  await page.getByRole("button", { name: "预览处理结果", exact: true }).click();
  await expect(page.getByLabel("处理结果预览")).toBeVisible();
  await page.getByLabel("误差口径").selectOption("sem");
  await expect(
    page.getByRole("button", { name: "保存并绘图", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("处理结果预览")).toHaveCount(0);
  await page.getByRole("button", { name: "预览处理结果", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存并绘图", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "保存并绘图", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) =>
          el.data.filter((t: any) => t.fill === "toself").map((t: any) => t.x),
        ),
    )
    .toEqual([[1, 2, 2, 1]]);
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) =>
          el.data
            .filter((t: any) => t.showlegend !== false)
            .map((t: any) => t.error_y),
        ),
    )
    .toEqual([undefined, undefined]);
  await page.getByRole("button", { name: /告警/ }).click();
  await expect(page.locator(".bottom-content")).toContainText(
    "1 行区间数据缺失或不适用于对数轴，区间带在此断开",
  );
  await page.getByRole("button", { name: /告警/ }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: "../docs/screenshots/processing-band.png",
    fullPage: true,
  });
});
test("explicit filter and numeric stable sort save as an independent dataset", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `数据排序验收 ${Date.now()}`,
        description: "synthetic numeric ordering",
      },
    })
  ).json();
  const raw = Buffer.from("epoch,value\n10,10\n2,2\n1,1\n2,3");
  const source = await (
    await request.post(`/api/projects/${p.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-order.csv",
          mimeType: "text/csv",
          buffer: raw,
        },
      },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  await page.getByRole("button", { name: "处理与统计", exact: true }).click();
  await page.getByLabel("处理方式").selectOption("sort");
  await page
    .getByRole("button", { name: "添加源数据过滤", exact: true })
    .click();
  await page.getByLabel("过滤条件 1").selectOption("gte");
  await page.getByLabel("过滤值 1").fill("2");
  await page.getByRole("button", { name: "添加结果排序", exact: true }).click();
  await page.getByRole("button", { name: "预览处理结果", exact: true }).click();
  await expect(page.getByLabel("处理结果预览")).toContainText(
    "源数据 4 行 → 结果 3 行",
  );
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/process") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "保存独立数据集", exact: true })
    .click();
  const result = await (await response).json();
  expect(result.rows).toEqual([
    { epoch: 2, value: 2 },
    { epoch: 2, value: 3 },
    { epoch: 10, value: 10 },
  ]);
  await expect(
    page.getByRole("button", { name: "数据处理来源", exact: true }),
  ).toBeVisible();
  expect(
    await (
      await request.get(`/api/projects/${p.id}/data/${source.id}/original`)
    ).body(),
  ).toEqual(raw);
});
