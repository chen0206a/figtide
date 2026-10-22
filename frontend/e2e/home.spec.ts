import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("real preview → continue → unsaved draft → assistant prefill without a model run", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: `首页验收 ${Date.now()}`, description: "合成演示" },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "home-synthetic.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.8\n3,0.9"),
        },
      },
    })
  ).json();
  const config = JSON.parse(
    fs.readFileSync("../docs/config-v1.example.json", "utf8"),
  );
  config.datasetVersionId = data.id;
  config.series = [
    { ...config.series[0], x: "epoch", y: "accuracy", error: "" },
  ];
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "首页真实预览 · 合成", config },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );
  const runs: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/agent\/runs$/.test(r.url()))
      runs.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByTestId("figure-preview-plot").locator(".main-svg").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: chart.name, exact: true }),
  ).toBeVisible();
  for (const width of [390, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../docs/screenshots/home.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/figures/${chart.id}$`));
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("图表标题", { exact: true }).fill("Unsaved home draft");
  await page.getByRole("link", { name: "项目概览", exact: true }).click();
  await expect(page.getByText("本机草稿 · 有未保存修改")).toBeVisible();
  await expect(page.locator("#home-assistant-input")).toBeEnabled();
  await page.locator("#home-assistant-input").fill("把图例放到右侧");
  await page.getByRole("button", { name: "在编辑器中打开助手" }).click();
  await expect(page.locator(".agent-dock")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "希望怎样调整？" }),
  ).toHaveValue("把图例放到右侧");
  expect(runs).toEqual([]);
  await expect.poll(() => page.evaluate(() => history.state?.usr)).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "绘图助手", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(runs).toEqual([]);
});

test("empty workspace entries create a project and keyboard actions work with reduced motion", async ({
  page,
}) => {
  // Empty-state boundary only; the primary flow above uses real Java/MySQL.
  await page.route("**/api/projects", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: [] })
      : route.continue(),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const name of [
    /^创建第一个项目/,
    /^导入数据.*自动识别/,
    /^新建图表.*11 类/,
    /^对比实验/,
    /^处理与汇总/,
  ]) {
    await page.getByRole("button", { name }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "新建研究项目" }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
  }
  await expect(page.locator(".intro-play, .figure-showcase")).toHaveCount(0);
});
