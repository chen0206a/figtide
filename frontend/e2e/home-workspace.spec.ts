import { test, expect } from "@playwright/test";
import { defaults } from "../src/editor/model";

test("home workspace stays open and compact, searches real projects and reveals more without inner scrolling", async ({
  page,
  request,
}) => {
  // Pagination needs at least twelve real projects. Seed them here rather than
  // depending on projects left by earlier specs in a full-suite run.
  const stamp = Date.now();
  const owned = [];
  for (let i = 0; i < 12; i++) {
    const created = await request.post("/api/projects", {
      data: {
        name: `工作区分页验收 ${stamp} / ${String(i).padStart(2, "0")}`,
        description: "合成演示；独立布局夹具",
      },
    });
    expect(created.ok()).toBeTruthy();
    owned.push(await created.json());
  }
  const upload = await request.post(`/api/projects/${owned[0].id}/datasets`, {
    multipart: {
      file: {
        name: "synthetic-workspace.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.8"),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const saved = await request.post(`/api/projects/${owned[0].id}/charts`, {
    data: {
      name: "布局检查 · 合成图表",
      config: defaults(await upload.json()),
    },
  });
  expect(saved.ok()).toBeTruthy();
  const projects = await (await request.get("/api/projects")).json();
  const selected = projects.find((p: any) => p.id === owned[0].id);
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
