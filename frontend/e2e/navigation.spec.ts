import { artifactPath } from "./artifacts";
import { test, expect } from "./workspace-test";
import fs from "node:fs";
test("module navigation resumes the exact chart without save prompts or silent database writes", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const project = await (
    await request.post("/api/projects", {
      data: { name: `导航工作台验收 ${Date.now()}`, description: "合成数据" },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "navigation-synthetic.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "epoch,accuracy,loss\n1,0.7,0.8\n2,0.8,0.5\n3,0.9,0.2",
          ),
        },
      },
    })
  ).json();
  const config = JSON.parse(
    fs.readFileSync("../docs/config-v1.example.json", "utf8"),
  );
  config.datasetVersionId = data.id;
  config.series[0].error = "";
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "导航体验 · 合成", config },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "主导航" });
  const home = nav.getByRole("link", { name: "项目概览", exact: true });
  await expect(home).toHaveAttribute("aria-current", "page");
  const indicator = page.locator(".nav-indicator");
  const before = await indicator.evaluate(
    (el) => getComputedStyle(el).transform,
  );
  const dataLink = nav.getByRole("link", { name: "数据管理", exact: true });
  await dataLink.hover();
  await expect
    .poll(() => indicator.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(before);
  await dataLink.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/data`));
  await expect(page.locator(".home")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "navigation-synthetic.csv",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "navigation-synthetic.csv",
      exact: true,
    }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".home")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/data`));
  await page.getByRole("button", { name: "用于绘图", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id}/figures/new\\?dataset=${data.id}`),
  );
  await expect(
    page.getByTestId("plot").locator(".main-svg").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("新图表 · 可以直接编辑", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "项目概览", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  const chartUrl = `/projects/${project.id}/figures/${chart.id}`;
  await expect(page).toHaveURL(new RegExp(chartUrl + "$"));
  await page.reload();
  await expect(page.getByLabel("图表名称", { exact: true })).toHaveValue(
    "导航体验 · 合成",
  );
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Unsaved navigation title");
  await page.goBack();
  await expect(page.locator(".home")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(chartUrl + "$"));
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Unsaved navigation title",
  );
  const beforeSave = await (
    await request.get(`/api/projects/${project.id}/charts/${chart.id}`)
  ).json();
  expect(beforeSave.revision).toBe(1);
  expect(beforeSave.config.style.title).not.toBe("Unsaved navigation title");
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/data`));
  // Explicit route identity wins over the locally remembered project.
  await page.goto(`/projects/${project.id}/figures/${chart.id}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Unsaved navigation title",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: artifactPath(test.info(), "../docs/screenshots/routed-workbench.png") });
  await page.getByRole("link", { name: "项目概览", exact: true }).click();
  await expect(page.locator(".home")).toBeVisible();
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: artifactPath(test.info(), "../docs/screenshots/routed-home.png") });
  await page.getByRole("link", { name: "实验记录", exact: true }).click();
  await expect(page).toHaveURL(`/projects/${project.id}/experiments`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "实验记录" })).toBeVisible();
  const other = (await (await request.get("/api/projects")).json()).find(
    (p: any) => p.id !== project.id && !p.archived,
  );
  await page
    .getByLabel("当前项目", { exact: true })
    .selectOption(String(other.id));
  await expect(page).toHaveURL(`/projects/${other.id}/experiments`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/invalid-workspace");
  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await page.goto("/projects/999999999/data");
  await expect(page.getByRole("heading", { name: "项目不可用" })).toBeVisible();
  expect(errors).toEqual([]);
});
test("reduced motion retains keyboard navigation and direct figure links", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const projects = await (await request.get("/api/projects")).json();
  const p = projects.find((p: any) => !p.archived && p.dataset_count > 0);
  await page.goto(`/projects/${p.id}/data`);
  const link = page.getByRole("link", { name: "科研绘图", exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  expect(
    await page
      .locator(".nav-indicator")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await link.press("Enter");
  await expect(page).toHaveURL(`/projects/${p.id}/figures/new`);
  await expect(
    page.getByTestId("plot").locator(".main-svg").first(),
  ).toBeVisible();
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
});
