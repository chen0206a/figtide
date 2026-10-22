import { test, expect } from "@playwright/test";
import fs from "node:fs";

test.use({ reducedMotion: "reduce" });

test("stable desktop header and compact data/experiment pages remain usable at 390px", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/projects", {
    data: {
      name: "外壳与页面验收 · 合成演示",
      description: "Task 03 isolated visual fixture",
    },
  });
  expect(created.ok()).toBeTruthy();
  const p = await created.json();
  const imported = await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "synthetic-experiments.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "epoch,accuracy,loss\n1,0.71,0.8\n2,0.82,0.5\n3,0.91,0.2",
        ),
      },
    },
  });
  expect(imported.ok()).toBeTruthy();
  const data = await imported.json();
  for (const [index, status] of [
    "planned",
    "running",
    "completed",
    "failed",
  ].entries()) {
    const result = await request.post(`/api/projects/${p.id}/experiments`, {
      data: {
        name: `EXP-00${index + 1} / AdamW · ${status}`,
        status,
        parameters: { lr: 0.001, seed: index + 1 },
        metrics: { accuracy: 0.91 },
        notes: "合成演示，检查记录、数据版本和操作在窄屏下的布局。",
        tags: ["synthetic"],
        dataset_version_ids: [data.id],
      },
    });
    expect(result.ok()).toBeTruthy();
  }
  await page.addInitScript((id) => {
    localStorage.setItem("labflow-project", String(id));
    sessionStorage.setItem("labflow-intro-v2", "seen");
  }, p.id);
  const geometry: unknown[] = [];
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".launch-home")).toBeVisible();
    const read = async () => ({
      brand: await page.locator(".masthead .brand").boundingBox(),
      nav: await page.getByRole("navigation", { name: "主导航" }).boundingBox(),
      header: await page.locator(".masthead").boundingBox(),
    });
    const home = await read();
    expect(home.header!.height).toBe(64);
    await page.getByRole("link", { name: "实验记录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "实验记录", exact: true }),
    ).toBeVisible();
    const experiments = await read();
    expect(experiments).toEqual(home);
    await page.getByRole("link", { name: "数据管理", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "synthetic-experiments.csv",
        exact: true,
      }),
    ).toBeVisible();
    const datasets = await read();
    expect(datasets).toEqual(home);
    geometry.push({ width, home, experiments, datasets });
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["experiments", "data"]) {
      await page.goto(`/projects/${p.id}/${name}`);
      const header = page.locator(".lf-page-header");
      await expect(header).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      if (width === 1440)
        expect((await header.boundingBox())!.height).toBeLessThan(96);
      if (name === "experiments") {
        await expect(page.locator(".experiment-record")).toHaveCount(4);
        for (const tone of ["neutral", "info", "success", "danger"])
          await expect(
            page.locator(`.experiment-record .lf-chip[data-tone="${tone}"]`),
          ).toHaveCount(1);
        await expect(page.locator(".comparison-selection")).toContainText(
          "已选 0 个实验（最多 8 个）",
        );
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        const last = await page
          .locator(".experiment-record")
          .last()
          .boundingBox();
        const selection = await page
          .locator(".comparison-selection")
          .boundingBox();
        expect(last!.y + last!.height).toBeLessThan(selection!.y);
        await page.evaluate(() => window.scrollTo(0, 0));
      } else {
        await expect(page.locator(".dataset-list b")).toHaveClass(/lf-mono/);
        expect(
          await page
            .locator(".dataset-list b")
            .evaluate((el) => getComputedStyle(el).fontFamily),
        ).toContain("JetBrains");
        await expect(page.locator(".data-table tbody tr")).toHaveCount(3);
        const scroll = page.locator(".data-layout .table-scroll");
        if (width === 1440) {
          const table = await scroll.locator("table").boundingBox();
          expect(table!.width).toBeLessThan(
            (await scroll.boundingBox())!.width,
          );
        } else {
          expect(await scroll.evaluate((el) => el.scrollWidth)).toBeGreaterThan(
            (await scroll.boundingBox())!.width,
          );
        }
      }
      await page.screenshot({
        path: `../docs/screenshots/refactor-03-${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
  fs.writeFileSync(
    "../docs/test-evidence/refactor03-shell.json",
    JSON.stringify(geometry, null, 2) + "\n",
  );
});
