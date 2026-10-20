import { test, expect } from "@playwright/test";
test("local reference gallery scrolls, pauses, credits sources and fits the home viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() =>
    sessionStorage.setItem("labflow-intro-v2", "seen"),
  );
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5176") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  const gallery = page.getByRole("region", { name: "图表示例", exact: true });
  await gallery.scrollIntoViewIfNeeded();
  const images = gallery.locator(".showcase-set").first().locator("img");
  await expect(gallery.locator(".showcase-copy")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(images).toHaveCount(4);
  for (const img of await images.all())
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  const track = page.locator(".showcase-track");
  const initial = await track.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(15, 100);
  await expect
    .poll(() => track.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(initial);
  await page.getByRole("button", { name: "暂停示例播放" }).click();
  await expect(track).toHaveAttribute("data-playing", "false");
  expect(
    await track.evaluate((el) => getComputedStyle(el).animationPlayState),
  ).toBe("paused");
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../docs/screenshots/home-showcase.png" });
  await page.getByRole("button", { name: /素材来源/ }).click();
  await expect(page.getByRole("dialog")).toContainText("并非 LabFlow 导出截图");
  await expect(
    page.getByRole("link", { name: "查看 Matplotlib 完整许可" }),
  ).toHaveAttribute("href", "/showcase/MATPLOTLIB-LICENSE.txt");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "播放示例" }).click();
  for (const width of [900, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByText("静态浏览")).toBeVisible();
  expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  expect(external).toEqual([]);
});
