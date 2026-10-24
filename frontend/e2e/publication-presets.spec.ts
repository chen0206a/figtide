import { artifactPath } from "./artifacts";
import { test, expect } from "./workspace-test";
import fs from "node:fs";
test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
test("new figure presets undo once, survive MySQL reopen and export 180mm vector PDF", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: "论文尺寸预设验收 · 合成演示",
        description: "Task09 fixture",
      },
    })
  ).json();
  const csv = Buffer.from("epoch,accuracy\n1,0.71\n2,0.82\n3,0.91");
  const d = await (
    await request.post(`/api/projects/${p.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-paper-curves.csv",
          mimeType: "text/csv",
          buffer: csv,
        },
      },
    })
  ).json();
  await page.goto(`/projects/${p.id}/figures/new?dataset=${d.id}`);
  await expect(
    page.getByTestId("plot").locator(".main-svg").first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.layout.showlegend),
    )
    .toBe(false);
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表名称", { exact: true })
    .fill("Training dynamics · synthetic");
  await page.getByLabel("字体", { exact: true }).selectOption("Noto Sans SC");
  await page.locator(".chart-picker > summary").click();
  const preset = page.getByRole("group", { name: "画布论文尺寸", exact: true });
  await preset
    .getByRole("button", { name: "单栏 · 88 mm", exact: true })
    .click();
  await expect(page.locator(".paper-ruler")).toBeVisible();
  await expect.poll(()=>page.getByTestId("plot").evaluate((el:any)=>el.layout.font.size)).toBeCloseTo(8*25.4/72*760/88,5);
  const singleFont = await page
    .getByTestId("plot")
    .evaluate((el: any) => el.layout.font.size);
  await page.screenshot({
    path: artifactPath(test.info(), "../docs/screenshots/refactor-09-editor-single.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("switch", { name: "按论文物理尺寸输出" }),
  ).not.toBeChecked();
  await expect(page.locator(".paper-ruler")).toHaveCount(0);
  await preset
    .getByRole("button", { name: "双栏 · 180 mm", exact: true })
    .click();
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.layout.font.size),
    )
    .toBeLessThan(singleFont);
  await expect(page.getByLabel("成品宽度 / mm")).toHaveValue("180");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.reload();
  await expect(
    preset.getByRole("button", { name: "双栏 · 180 mm", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("成品宽度 / mm")).toHaveValue("180");
  await expect(page.locator(".paper-ruler > span")).toHaveCount(19);
  await page.screenshot({
    path: artifactPath(test.info(), "../docs/screenshots/refactor-09-editor-double.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("文件格式").selectOption("pdf");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  const path = artifactPath(test.info(), "../docs/exports/refactor-09-double.pdf");
  await (await download).saveAs(path);
  const pdf = fs.readFileSync(path).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  expect(box).not.toBeNull();
  expect((Number(box![1]) / 72) * 25.4).toBeCloseTo(180, 2);
  expect((Number(box![2]) / 72) * 25.4).toBeCloseTo((180 * 500) / 760, 2);
  const charts = await (
    await request.get(`/api/projects/${p.id}/charts`)
  ).json();
  const saved = await (
    await request.get(`/api/projects/${p.id}/charts/${charts[0].id}`)
  ).json();
  expect(saved.config.publication).toMatchObject({
    enabled: true,
    widthMm: 180,
  });
  expect(saved.config.style).toMatchObject({ width: 760, height: 500 });
  expect(
    await (
      await request.get(`/api/projects/${p.id}/data/${d.id}/original`)
    ).body(),
  ).toEqual(csv);
  fs.writeFileSync(
    artifactPath(test.info(), "../docs/test-evidence/refactor09-publication.json"),
    JSON.stringify(
      {
        width_mm: (Number(box![1]) / 72) * 25.4,
        height_mm: (Number(box![2]) / 72) * 25.4,
        publication: saved.config.publication,
        style: saved.config.style,
        single_font_px: singleFont,
      },
      null,
      2,
    ) + "\n",
  );
});
