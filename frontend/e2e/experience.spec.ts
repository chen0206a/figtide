import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
async function fixture(page: Page, request: APIRequestContext) {
  const project = await (
    await request.post("/api/projects", {
      data: {
        name: `前端体验验收 ${Date.now()}`,
        description: "合成数据；检验布局、编辑与交付一致性",
      },
    })
  ).json();
  const upload = await request.post(`/api/projects/${project.id}/datasets`, {
    multipart: {
      file: {
        name: "synthetic-ux.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "epoch,accuracy,loss\n1,0.7,0.8\n2,0.8,0.5\n10,0.9,0.2\n100,0.95,0.1",
        ),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const dataset = await upload.json();
  const config = JSON.parse(
    fs.readFileSync("../docs/config-v1.example.json", "utf8"),
  );
  config.datasetVersionId = dataset.id;
  config.series[0].error = "";
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "体验回归图 · 合成", config },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /体验回归图 · 合成/ }).click();
  await expect(
    page.getByTestId("plot").locator(".main-svg").first(),
  ).toBeVisible();
  return { project, chart };
}
async function paperFits(page: Page) {
  await expect
    .poll(() =>
      page.locator(".paper-group").evaluate((el) => {
        const p = el.getBoundingClientRect(),
          s = el.closest(".canvas-stage")!.getBoundingClientRect();
        return (
          p.left >= s.left - 1 &&
          p.right <= s.right + 1 &&
          p.top >= s.top - 1 &&
          p.bottom <= s.bottom + 1
        );
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("auto-fit, layout-only axis reset, latest SVG and MySQL reopen remain consistent", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  const { project, chart } = await fixture(page, request);
  await paperFits(page);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  const manual = await page.locator(".zoom-value").innerText();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator(".zoom-value")).toHaveText(manual);
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await paperFits(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await paperFits(page);
  await page.getByLabel("宽度 / px", { exact: true }).fill("2400");
  await page.getByLabel("高度 / px", { exact: true }).fill("2400");
  await paperFits(page);
  await page.getByLabel("宽度 / px", { exact: true }).fill("760");
  await page.getByLabel("高度 / px", { exact: true }).fill("500");
  await paperFits(page);
  const title = "Final responsive title";
  await page.getByLabel("图表标题", { exact: true }).fill("");
  await page
    .getByLabel("图表标题", { exact: true })
    .pressSequentially(title, { delay: 5 });
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.layout.title.text),
    )
    .toBe(title);
  await page.getByLabel("字体", { exact: true }).selectOption("Georgia");
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "坐标轴", exact: true })
    .click();
  const log = page
    .getByRole("switch", { name: "对数坐标", exact: true })
    .first();
  await log.check();
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el._fullLayout.xaxis.type),
    )
    .toBe("log");
  await log.uncheck();
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el._fullLayout.xaxis.type),
    )
    .toBe("linear");
  await page.getByLabel("最小值", { exact: true }).first().fill("2");
  await page.getByLabel("最大值", { exact: true }).first().fill("50");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el._fullLayout.xaxis.range),
    )
    .toEqual([2, 50]);
  await page.getByLabel("最小值", { exact: true }).first().fill("");
  await page.getByLabel("最大值", { exact: true }).first().fill("");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el._fullLayout.xaxis.autorange),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el._fullLayout.xaxis.range[1]),
    )
    .toBeGreaterThanOrEqual(100);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
  const saved = await (
    await request.get(`/api/projects/${project.id}/charts/${chart.id}`)
  ).json();
  expect(saved.config.style.title).toBe(title);
  expect(saved.config.style.font).toBe("Georgia");
  expect(saved.config.axes.x.min).toBe("");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("文件格式").selectOption("svg");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  const file = await (await pending).path();
  const svg = fs.readFileSync(file!, "utf8");
  expect(svg).toContain(title);
  expect(svg).toContain("Georgia");
  expect(svg).toContain("<text");
  expect(svg).not.toContain("<image");
  await page.reload();
  await page.getByRole("button", { name: /体验回归图 · 合成/ }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(title);
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.layout.font.family),
    )
    .toBe("Georgia");
  expect(
    await page.evaluate(
      ({ project, chart }) =>
        localStorage.getItem(`labflow-draft-v1:${project}:${chart}`),
      { project: project.id, chart: chart.id },
    ),
  ).toBeNull();
  expect(errors).toEqual([]);
});
test("refresh during the debounce window flushes the latest draft without changing saved results", async ({
  page,
  request,
}) => {
  const { project, chart } = await fixture(page, request);
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Refresh should preserve this exact draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole("button", { name: /体验回归图 · 合成/ }).click();
  await expect(
    page.getByRole("dialog", { name: "发现未完成的草稿" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "恢复草稿", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Refresh should preserve this exact draft",
  );
  const saved = await (
    await request.get(`/api/projects/${project.id}/charts/${chart.id}`)
  ).json();
  expect(saved.config).toEqual(chart.config);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
});
