import { test, expect } from "./workspace-test";
import { artifactPath } from "./artifacts";
import { defaults } from "../src/editor/model";

test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });

test("FigTide branding, original workspace keys and current figure survive navigation", async ({ page, request }) => {
  const projectResponse = await request.post("/api/projects", { data: { name: "FigTide 示例 · 发布检查", description: "合成示意数据" } });
  expect(projectResponse.ok()).toBeTruthy();
  const project = await projectResponse.json();
  const datasetResponse = await request.post(`/api/projects/${project.id}/datasets`, { multipart: { file: {
    name: "示意-学习曲线.csv", mimeType: "text/csv",
    buffer: Buffer.from("epoch,accuracy\n1,0.720\n2,0.840\n3,0.910\n"),
  } } });
  expect(datasetResponse.ok()).toBeTruthy();
  const dataset = await datasetResponse.json();
  const config = defaults(dataset);
  config.style.title = "Learning curve · illustrative";
  const chartResponse = await request.post(`/api/projects/${project.id}/charts`, { data: { name: "学习曲线 · 示意", config } });
  expect(chartResponse.ok()).toBeTruthy();
  const chart = await chartResponse.json();
  await page.addInitScript(id => {
    localStorage.setItem("labflow-intro-seen", "1");
    localStorage.setItem("labflow-project", String(id));
  }, project.id);
  await page.goto("/");
  await expect(page).toHaveTitle("首页 · FigTide");
  await expect(page.locator(".masthead").getByRole("img", { name: "FigTide" })).toBeVisible();
  await expect(page.locator(".home-continue-figure .main-svg").first()).toBeVisible();
  await page.screenshot({ path: artifactPath(test.info(), "../docs/screenshots/release-0.1-home.png"), fullPage: true });
  await page.getByRole("button", { name: "关于 FigTide", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "关于 FigTide 图汐" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("img", { name: "FigTide" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.goto(`/projects/${project.id}/figures/${chart.id}`);
  await expect(page).toHaveTitle("绘图工作台 · FigTide");
  await expect(page.getByTestId("plot").locator(".main-svg").first()).toBeVisible();
  await expect(page.locator(".editor-statusbar").getByRole("img", { name: "FigTide" })).toBeVisible();
  await page.screenshot({ path: artifactPath(test.info(), "../docs/screenshots/release-0.1-editor.png"), fullPage: true });
  await page.locator(".masthead").screenshot({ path: artifactPath(test.info(), "../docs/screenshots/release-0.1-editor-header.png") });
  const saved = await (await request.get(`/api/projects/${project.id}/charts/${chart.id}`)).json();
  expect(saved.config).toEqual(config);
  expect(await page.evaluate(() => localStorage.getItem("labflow-project"))).toBe(String(project.id));
});

test("intro branding and actual favicon assets render at desktop and narrow widths", async ({ page, request }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/welcome");
    await expect(page).toHaveTitle("欢迎 · FigTide");
    await expect(page.locator("header").getByRole("img", { name: "FigTide" })).toBeVisible();
    await expect(page.locator(".intro-footer-brand").getByRole("img", { name: "FigTide" })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: artifactPath(test.info(), `../docs/screenshots/release-0.1-intro-${width}.png`), fullPage: true });
  }
  for (const asset of ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"]) {
    const response = await request.get(asset);
    expect(response.ok()).toBeTruthy();
    expect((await response.body()).length).toBeGreaterThan(100);
  }
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/favicon.svg");
  const svg = await (await request.get("/favicon.svg")).text();
  expect(svg).toContain('cx="51"');
});
