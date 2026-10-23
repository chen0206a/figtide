import { test, expect } from "./workspace-test";
import fs from "node:fs";
import { defaults } from "../src/editor/model";
import { openHomeChart } from "./fixtures/home-navigation";
test.use({ reducedMotion: "reduce" });
// Only remove templates created by this run, including the restored backup's copies.
const ownedProjects = new Set<number>();
test.afterEach(async ({ request }) => {
  const templates = await (await request.get("/api/style-templates")).json();
  for (const t of templates.filter((t: any) =>
    ownedProjects.has(Number(t.project_id)),
  )) {
    const deleted = await request.delete(`/api/style-templates/${t.id}`);
    expect(deleted.ok()).toBeTruthy();
  }
  ownedProjects.clear();
});
test("personal style → explicit remap → vector PDF/SVG/PNG → project archive → restore → reopen", async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `成果交付验收 ${Date.now()}`,
        description: "合成 ML 数据，非真实实验",
      },
    })
  ).json();
  ownedProjects.add(p.id);
  const upload = async (name: string, csv: string) => {
    const r = await request.post(`/api/projects/${p.id}/datasets`, {
      multipart: {
        file: { name, mimeType: "text/csv", buffer: Buffer.from(csv) },
      },
    });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const target = await upload(
    "synthetic-new.csv",
    "step,score,se\n1,0.7,0.02\n2,0.8,0.03\n3,0.9,0.01",
  );
  const source = await upload(
    "synthetic-original.csv",
    "epoch,accuracy,error\n1,0.6,0.03\n2,0.75,0.02\n3,0.85,0.01",
  );
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await page
    .getByLabel("图表名称", { exact: true })
    .fill("可复用成果 · 合成数据");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("图表标题", { exact: true }).fill("合成实验 · Model α");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("字体", { exact: true }).selectOption("Noto Sans SC");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByRole("switch", { name: "按论文物理尺寸输出" }).check();
  await page.getByLabel("成品宽度 / mm").fill("89");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  let original: any;
  await expect
    .poll(async () => {
      const charts = await (
        await request.get(`/api/projects/${p.id}/charts`)
      ).json();
      original = charts[0];
      return charts.length;
    })
    .toBe(1);
  await expect(page.getByLabel("图表名称", { exact: true })).toHaveValue(
    "可复用成果 · 合成数据",
  );
  await page.getByRole("button", { name: "复用", exact: true }).click();
  const templateName = `交付风格 ${p.id}`;
  await page
    .getByRole("button", { name: "保存为模板", exact: true })
    .first()
    .click();
  await page.getByLabel("模板名称").fill(templateName);
  await page.getByRole("button", { name: "保存当前样式" }).click();
  await expect(
    page.getByRole("button", { name: `应用样式 ${templateName}`, exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "图表", exact: true }).click();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("字体", { exact: true }).selectOption("Arial");
  await page.getByRole("button", { name: "复用", exact: true }).click();
  await page
    .getByRole("button", { name: `预览模板 ${templateName}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: `应用样式 ${templateName}`, exact: true })
    .click();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("字体", { exact: true })).toHaveValue(
    "Noto Sans SC",
  );
  await page.getByRole("button", { name: "复用", exact: true }).click();
  await page
    .getByRole("tab", { name: "复用到其他数据集", exact: true })
    .click();
  await page.getByLabel("复用目标数据版本").selectOption(String(target.id));
  await expect(
    page.getByRole("button", { name: "确认映射并保存新图" }),
  ).toBeDisabled();
  for (const [old, next] of Object.entries({
    epoch: "step",
    accuracy: "score",
    error: "se",
  }))
    await page.getByLabel(`映射 ${old}`, { exact: true }).selectOption(next);
  await page.screenshot({
    path: "../docs/screenshots/figure-reuse.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认映射并保存新图" }).click();
  await expect(page.getByLabel("图表名称", { exact: true })).toHaveValue(
    "可复用成果 · 合成数据 · 复用",
  );
  const charts = await (
    await request.get(`/api/projects/${p.id}/charts`)
  ).json();
  expect(charts).toHaveLength(2);
  const copy = charts.find((c: any) => c.id !== original.id);
  const reopened = await (
    await request.get(`/api/projects/${p.id}/charts/${copy.id}`)
  ).json();
  expect(reopened.config.datasetVersionId).toBe(target.id);
  expect(reopened.config.series[0].y).toBe("score");
  expect(reopened.config.publication.widthMm).toBe(89);
  expect(
    (
      await (
        await request.get(`/api/projects/${p.id}/charts/${original.id}`)
      ).json()
    ).config.datasetVersionId,
  ).toBe(source.id);
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.layout?.font?.family),
    )
    .toBe("Noto Sans SC");
  for (const format of ["pdf", "svg", "png"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByLabel("文件格式").selectOption(format);
    const download = page.waitForEvent("download", { timeout: 60000 });
    await page.getByRole("button", { name: "下载图表", exact: true }).click();
    await (await download).saveAs(`../docs/exports/reusable-figure.${format}`);
  }
  expect(
    fs
      .readFileSync("../docs/exports/reusable-figure.pdf")
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
  const svg = fs.readFileSync("../docs/exports/reusable-figure.svg", "utf8");
  expect(svg).toContain('width="89mm"');
  expect(svg).toContain("合成实验");
  expect(svg).not.toContain("<image");
  await page.getByRole("button", { name: "管理项目", exact: true }).click();
  await page.getByLabel("备份项目", { exact: true }).selectOption(String(p.id));
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载项目备份" }).click();
  const archive = test.info().outputPath("project.labflow.zip");
  await (await backup).saveAs(archive);
  await page.getByLabel("选择项目备份", { exact: true }).setInputFiles(archive);
  await expect(page.getByLabel("恢复项目名称")).toBeVisible();
  const recoveredName = `成果恢复验收 ${p.id}`;
  await page.getByLabel("恢复项目名称").fill(recoveredName);
  await page.screenshot({
    path: "../docs/screenshots/project-delivery.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "恢复为新项目" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `已创建「${recoveredName}」` }),
  ).toBeVisible();
  const projects = await (await request.get("/api/projects")).json();
  const recovered = projects.find((r: any) => r.name === recoveredName);
  ownedProjects.add(recovered.id);
  expect(recovered.id).not.toBe(p.id);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page
    .getByLabel("当前项目", { exact: true })
    .selectOption(String(recovered.id));
  await page.getByRole("link", { name: "项目概览", exact: true }).click();
  const restoredCharts = await (
    await request.get(`/api/projects/${recovered.id}/charts`)
  ).json();
  expect(restoredCharts).toHaveLength(2);
  const restoredCopy = restoredCharts.find((r: any) => r.name === copy.name);
  const restoredConfig = await (
    await request.get(`/api/projects/${recovered.id}/charts/${restoredCopy.id}`)
  ).json();
  expect(restoredConfig.config.datasetVersionId).not.toBe(target.id);
  expect({ ...restoredConfig.config, datasetVersionId: target.id }).toEqual(
    reopened.config,
  );
  await openHomeChart(page, copy.name);
  await expect(page.getByLabel("图表名称", { exact: true })).toHaveValue(
    copy.name,
  );
  await page.reload();
  await expect(page.getByLabel("图表名称", { exact: true })).toHaveValue(
    copy.name,
  );
  expect(errors).toEqual([]);
});

test("corrupted project archive remains an error and does not create a project", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/projects")).json();
  await page.goto("/");
  await page.getByRole("button", { name: "管理项目", exact: true }).click();
  await page.getByLabel("选择项目备份", { exact: true }).setInputFiles({
    name: "invalid.labflow.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("corrupt"),
  });
  await expect(page.getByRole("alert")).toContainText("备份");
  await expect(page.getByRole("button", { name: "恢复为新项目" })).toHaveCount(
    0,
  );
  expect((await (await request.get("/api/projects")).json()).length).toBe(
    before.length,
  );
});

test("vector PDF retains bold CJK multiline labels and heatmap cells", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: { name: `热力图 PDF 验收 ${Date.now()}`, description: "合成数据" },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${p.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-heat.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "epoch,model,value\n1,A,0.7\n1,B,0.8\n2,A,0.9\n2,B,0.95",
          ),
        },
      },
    })
  ).json();
  const c = defaults(data);
  c.type = "heatmap";
  c.x = "epoch";
  c.heatY = "model";
  c.heatZ = "value";
  c.style.font = "Noto Sans SC";
  c.style.bold = true;
  c.style.title = "合成热力图 · 模型对比";
  c.heatmap!.labels = true;
  const saved = await request.post(`/api/projects/${p.id}/charts`, {
    data: { name: "矢量热力图 · 合成", config: c },
  });
  expect(saved.ok()).toBeTruthy();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await openHomeChart(page, "矢量热力图 · 合成");
  await expect(page.getByTestId("plot")).toBeVisible();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("文件格式").selectOption("pdf");
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  await (await waiting).saveAs("../.runtime/heatmap-vector.pdf");
  // Converter contract check, separate from the editor's deliberately plain-text inputs.
  const bytes = await page.evaluate(async (config) => {
    const moduleUrl = performance.getEntriesByType("resource")
      .map(entry => entry.name)
      .find(url => /\/src\/editor\/pdf\.ts(?:\?|$)|\/assets\/pdf-[^/]+\.js(?:\?|$)/.test(url));
    if (!moduleUrl) throw new Error("PDF module was not loaded by the real export action");
    const { vectorPdf } = await import(moduleUrl);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><text x="200" y="45" text-anchor="middle" style="font-family:Noto Sans SC;font-size:24px;font-weight:700;white-space:pre"><tspan x="200" dy="0">第一行 ±</tspan><tspan x="200" dy="35">Second line</tspan></text></svg>';
    const blob = await vectorPdf(
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
      { ...config, style: { ...config.style, width: 400, height: 250 } },
    );
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, c);
  fs.writeFileSync("../.runtime/multiline-vector.pdf", Buffer.from(bytes));
});
