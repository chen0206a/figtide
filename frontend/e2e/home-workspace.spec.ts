import { test, expect } from "@playwright/test";

test("home workspace stays open and compact, searches real projects and reveals more without inner scrolling", async ({
  page,
  request,
}) => {
  const projects = await (await request.get("/api/projects")).json();
  const selected =
    projects.find(
      (p: any) => !p.archived && p.name === "成果复用与交付 · 合成演示",
    ) || projects.find((p: any) => !p.archived && p.chart_count > 0);
  expect(selected).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.addInitScript((id: number) => {
    sessionStorage.setItem("labflow-intro-v2", "seen");
    localStorage.setItem("labflow-project", String(id));
  }, selected.id);
  await page.goto("/");
  const entries = page.getByRole("region", { name: "功能入口" });
  await expect(entries.locator(".tool-shortcut")).toHaveCount(3);
  await expect
    .poll(() => page.locator(".workspace-chart").count())
    .toBeGreaterThan(0);
  await expect(page.locator(".workspace-project")).toHaveCount(4);
  await expect(page.locator(".workspace-projects")).toHaveCSS(
    "max-height",
    "none",
  );
  await expect(page.locator(".workspace-projects")).toHaveCSS(
    "overflow-y",
    "visible",
  );
  await expect(page.locator(".workspace-recents")).toHaveCSS(
    "max-height",
    "none",
  );
  await entries.scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    window.scrollBy(
      0,
      document.querySelector(".launch-tools")!.getBoundingClientRect().top -
        100,
    ),
  );
  const searchContentLeft = await page
    .getByRole("textbox", { name: "搜索工作区项目" })
    .evaluate(
      (el) =>
        el.getBoundingClientRect().left +
        parseFloat(getComputedStyle(el).paddingLeft),
    );
  const searchIcon = await page
    .locator(".workspace-search > svg")
    .boundingBox();
  expect(searchContentLeft).toBeGreaterThan(
    searchIcon!.x + searchIcon!.width + 4,
  );
  await page.mouse.move(20, 20);
  await page.screenshot({
    path: "../docs/screenshots/home-workspace-refined.png",
  });

  const target = projects.find(
    (p: any, i: number) => i > 8 && !p.archived && p.id !== selected.id,
  );
  expect(target).toBeTruthy();
  const search = page.getByRole("textbox", { name: "搜索工作区项目" });
  await search.fill(target.name);
  const found = page
    .locator(".workspace-project")
    .filter({ hasText: target.name });
  await expect(found).toHaveCount(1);
  await found.click();
  await expect(page.getByLabel("当前项目", { exact: true })).toHaveValue(
    String(target.id),
  );
  await search.fill("");
  await expect(page.locator(".workspace-project")).toHaveCount(4);
  await page.getByRole("button", { name: /显示更多项目/ }).click();
  await expect(page.locator(".workspace-project")).toHaveCount(12);
  await expect(page.locator(".workspace-projects")).toHaveCSS(
    "overflow-y",
    "visible",
  );
  for (const width of [390, 900, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".tool-shortcut").first().hover();
  await expect(page.locator(".tool-shortcut .tool-icon").first()).toHaveCSS(
    "transform",
    "none",
  );
});
