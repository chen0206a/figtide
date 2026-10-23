import { test, expect } from "./workspace-test";
import { defaults } from "../src/editor/model";

test("docked assistant keeps composer and confirmation visible at both desktop heights", async ({
  page,
  request,
}) => {
  const provider = await (await request.get("/api/agent/provider")).json();
  test.skip(
    provider.model !== "labflow-fixture",
    "Only the local protocol fixture is allowed",
  );
  const p = await (
    await request.post("/api/projects", {
      data: { name: `助手布局验收 ${Date.now()}`, description: "合成演示" },
    })
  ).json();
  const d = await (
    await request.post(`/api/projects/${p.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-layout.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.8\n3,0.9"),
        },
      },
    })
  ).json();
  const c = await (
    await request.post(`/api/projects/${p.id}/charts`, {
      data: { name: "助手布局 · 合成演示", config: defaults(d) },
    })
  ).json();
  await page.goto(`/projects/${p.id}/figures/${c.id}`);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
  const input = panel.getByRole("textbox", { name: "希望怎样调整？" });
  const check = async (selector: string) => {
    const geometry = await panel.evaluate((el, sel) => {
      const outer = el.getBoundingClientRect(),
        node = el.querySelector(sel)!;
      const b = node.getBoundingClientRect();
      const scroll = el
        .querySelector(".quick-actions-body")!
        .getBoundingClientRect();
      const inScroll = !!node.closest(".quick-actions-body");
      return {
        top: b.top,
        bottom: b.bottom,
        min: inScroll ? scroll.top : outer.top,
        max: inScroll ? scroll.bottom : outer.bottom,
        scrollTop: el.scrollTop,
        outerOverflow: el.scrollHeight > el.clientHeight + 1,
      };
    }, selector);
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.min - 1);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.max + 1);
    expect(geometry.scrollTop).toBe(0);
    expect(geometry.outerOverflow).toBe(false);
  };
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await expect(input).toBeVisible();
    await check(".agent-composer textarea");
    await check(".agent-controls button");
    await check(".agent-suggestions");
  }
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  const endpoint = panel.locator(".agent-provider span[title]");
  await expect(endpoint).toHaveText(new URL(provider.endpoint).host);
  await expect(endpoint).toHaveAttribute("title", provider.endpoint);
  await expect(panel.getByLabel("会话预算使用情况")).toHaveAttribute(
    "value",
    "0",
  );
  await input.fill(
    "标题改成 Agent proposal，字号18，图例放右边。" +
      "请保留原始实验数据，只调整展示。".repeat(70),
  );
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "生成调整提案" }).click();
  await expect(
    panel.getByRole("button", { name: "应用这组调整" }),
  ).toBeEnabled();
  await expect(panel.locator(".agent-suggestions")).toHaveCount(0);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await check(".agent-composer textarea");
    await check(".agent-controls button");
    await check(".quick-result-footer > button:first-of-type");
    await check(".quick-result-footer > button:nth-of-type(2)");
    const scroll = await panel
      .locator(".quick-actions-body")
      .evaluate((el) => ({
        height: el.clientHeight,
        content: el.scrollHeight,
      }));
    expect(scroll.height).toBeGreaterThan(0);
    expect(scroll.content).toBeGreaterThan(scroll.height);
    await panel.locator(".quick-actions-body").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await check(".agent-composer textarea");
    await page.screenshot({
      path: `../docs/screenshots/refactor-06-agent-${size.width}.png`,
    });
  }
  const saved = await (
    await request.get(`/api/projects/${p.id}/charts/${c.id}`)
  ).json();
  expect(saved.revision).toBe(1);
  expect(saved.config).toEqual(c.config);
});
