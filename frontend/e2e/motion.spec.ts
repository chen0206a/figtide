import fs from "node:fs";
import { test, expect } from "./workspace-test";

/**
 * 10-6：动效验收。
 * - 默认（no-preference）：首页入场跑完后所有入场元素 opacity=1；入场过程中按钮就可点。
 * - reduce：首页不使用入场动画，内容直接是最终状态（300ms 内可读）。
 * 入场期间的性能（长任务）作为 trace 证据单独记录在 docs/test-evidence/refactor10-perf.json。
 */
async function seedHome(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext) {
  const project = await (
    await request.post("/api/projects", {
      data: { name: `动效验收 ${Date.now()}`, description: "合成演示" },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: { name: "motion.csv", mimeType: "text/csv", buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.8\n3,0.9") },
      },
    })
  ).json();
  const config = JSON.parse(fs.readFileSync("../docs/config-v1.example.json", "utf8"));
  config.datasetVersionId = data.id;
  config.series = [{ ...config.series[0], x: "epoch", y: "accuracy", error: "" }];
  await request.post(`/api/projects/${project.id}/charts`, { data: { name: "动效验收 · 合成", config } });
  await page.addInitScript((id) => localStorage.setItem("labflow-project", String(id)), project.id);
}

test.describe("home entrance", () => {
  test.use({ reducedMotion: "no-preference" });

  test("plays once, lands on the final state, and stays clickable while moving", async ({ page, request }) => {
    await seedHome(page, request);
    await page.goto("/");
    const home = page.locator(".home-v2");
    await expect(home).toHaveAttribute("data-entrance", "full");
    await expect(home).toHaveClass(/lf-motion-on/);
    // 入场动画正在跑（不是一开始就处于最终状态）
    const running = await page.evaluate(() => {
      const h1 = document.querySelector(".home-intro h1");
      return h1 ? getComputedStyle(h1).animationName : "";
    });
    expect(running).toContain("lf-up");
    // 动画进行中元素也能点到（trial 会在被遮罩/不可点时直接失败）
    await page.locator(".home-intro-actions button").first().click({ trial: true });
    // 结束后落在最终状态
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".home-intro h1")!).opacity), { timeout: 4000 })
      .toBe("1");
    // h1 ends at 820ms; the stage ends at 1180ms. Wait for every finite
    // entrance before taking one settled-state sample (the draft pulse is infinite).
    await home.evaluate(async (element) => {
      const entrances = element.getAnimations({ subtree: true })
        .filter(animation => animation.effect?.getTiming().iterations !== Infinity);
      await Promise.all(entrances.map(animation => animation.finished.catch(() => undefined)));
    });
    const settled = await page.evaluate(() => {
      const pick = [".home-intro h1", ".home-intro-actions", ".home-stage", ".home-bottom>*"];
      return pick.flatMap((selector) =>
        [...document.querySelectorAll(selector)].map((node) => {
          const style = getComputedStyle(node);
          return { selector, opacity: style.opacity, transform: style.transform };
        }),
      );
    });
    for (const node of settled) {
      expect(node.opacity, `${node.selector} opacity`).toBe("1");
    }
  });

  test("opens the editor through 继续编辑 without console errors", async ({ page, request }) => {
    await seedHome(page, request);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.getByRole("button", { name: /继续编辑/ }).click();
    await expect(page).toHaveURL(/\/projects\/\d+\/figures/);
    await expect(page.getByTestId("plot")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the final state immediately", async ({ page, request }) => {
    await seedHome(page, request);
    await page.goto("/");
    const home = page.locator(".home-v2");
    await expect(home).toHaveAttribute("data-entrance", "none");
    await expect(home).not.toHaveClass(/lf-motion-on/);
    const state = await page.evaluate(() => {
      const h1 = document.querySelector(".home-intro h1")!;
      const stage = document.querySelector(".home-stage")!;
      const style = getComputedStyle(h1);
      return {
        h1Animation: style.animationName,
        h1Opacity: style.opacity,
        stageAnimation: getComputedStyle(stage).animationName,
      };
    });
    expect(state).toMatchObject({ h1Animation: "none", h1Opacity: "1", stageAnimation: "none" });
  });
});
