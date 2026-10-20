import { test, expect } from "@playwright/test";
test("reference gallery keeps scrolling on hover and focus, credits sources and fits a centered home", async ({
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
  await expect(images).toHaveCount(10);
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
  await expect(
    page.getByRole("button", { name: /暂停示例播放|播放示例/ }),
  ).toHaveCount(0);
  const viewport = gallery.getByRole("region", {
    name: "图表示例画廊，可横向滚动",
  });
  await viewport.hover();
  await expect(track).toHaveCSS("animation-play-state", "running");
  const hovered = await track.evaluate((el) => getComputedStyle(el).transform);
  await expect
    .poll(() => track.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(hovered);
  await viewport.focus();
  await expect(track).toHaveCSS("animation-play-state", "running");
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../docs/screenshots/home-centered.png" });
  await page.getByRole("button", { name: /素材来源/ }).click();
  await expect(page.getByRole("dialog")).toContainText("并非 LabFlow 导出截图");
  await expect(
    page.getByRole("link", { name: "查看 Matplotlib 完整许可" }),
  ).toHaveAttribute("href", "/showcase/MATPLOTLIB-LICENSE.txt");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  for (const width of [390, 900, 1280, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  const header = await page.locator(".masthead-bar").boundingBox();
  expect(header!.width).toBe(1200);
  expect(Math.abs(header!.x + header!.width / 2 - 1280)).toBeLessThan(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../docs/screenshots/home-wide.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const actions = page.getByRole("region", { name: "功能入口" });
  await actions.scrollIntoViewIfNeeded();
  await expect(actions.locator(".launch-tool")).toHaveCount(4);
  for (const card of await actions.locator(".launch-tool").all()) {
    const primary = (await card.getAttribute("class"))!.includes("tool-blue");
    await expect(card).toHaveCSS(
      "background-color",
      primary ? "rgb(24, 24, 24)" : "rgb(255, 255, 255)",
    );
    await expect(card.locator("h2")).toHaveCSS(
      "color",
      primary ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)",
    );
  }
  await page.screenshot({ path: "../docs/screenshots/home-actions.png" });
  await page.evaluate(() => {
    const section = document.querySelector(".figure-showcase")!;
    window.scrollBy(0, section.getBoundingClientRect().top - 100);
  });
  await page.screenshot({
    path: "../docs/screenshots/home-gallery-actions.png",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveAttribute("data-playing", "false");
  expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  expect(external).toEqual([]);
});
