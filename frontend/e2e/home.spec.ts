import { test, expect } from "@playwright/test";
import { defaults } from "../src/editor/model";
async function openHome(page: any, request: any) {
  // Each case owns a usable dataset and chart; the newest unrelated project
  // may be empty when this spec runs independently or after pagination tests.
  const created = await request.post("/api/projects", {
    data: {
      name: `首页交互验收 ${Date.now()}`,
      description: "合成演示；独立导航夹具",
    },
  });
  expect(created.ok()).toBeTruthy();
  const p = await created.json();
  const uploaded = await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "synthetic-home.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.8\n3,0.9"),
      },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  const saved = await request.post(`/api/projects/${p.id}/charts`, {
    data: {
      name: "首页演示 · 合成曲线",
      config: defaults(await uploaded.json()),
    },
  });
  expect(saved.ok()).toBeTruthy();
  await page.addInitScript(
    (id: number) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.locator(".launch-home").waitFor();
}
test("brand entrance is sequenced, real navigation works, return skips intro", async ({
  page,
  request,
}) => {
  await openHome(page, request);
  expect(
    await page
      .locator(".launch-logo")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("mark-arrive");
  expect(
    await page
      .locator(".launch-brand h1")
      .evaluate((el) => getComputedStyle(el).animationDelay),
  ).toBe("0.14s");
  expect(
    await page
      .locator(".launch-tool")
      .first()
      .evaluate((el) => getComputedStyle(el).animationDelay),
  ).toBe("0.35s");
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  await expect(page.getByRole("heading", { name: "LabFlow." })).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/home.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^实验笔记/ }).click();
  await expect(page.getByRole("heading", { name: "实验记录" })).toBeVisible();
  await page.getByRole("link", { name: "项目概览", exact: true }).click();
  await expect(page.locator(".launch-home")).toHaveClass(/intro-seen/);
  await page.getByRole("button", { name: /^数据资料库/ }).click();
  await expect(page.getByRole("heading", { name: "数据管理" })).toBeVisible();
  await page.getByRole("link", { name: "项目概览", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^导入数据/ }).click();
  expect(await chooser).toBeTruthy();
  await page.getByRole("button", { name: /^绘图工作台/ }).click();
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "折线图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await expect(
    page.getByRole("button", { name: "折线图", exact: true }),
  ).toBeVisible();
});
test("reduced motion disables entrance and preserves keyboard access", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page, request);
  expect(
    await page
      .locator(".launch-logo")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".launch-tool")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.locator(".launch-secondary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("1280px workspace remains accessible without horizontal overflow", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openHome(page, request);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "最近图表", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/home-1280.png",
    fullPage: true,
  });
});
