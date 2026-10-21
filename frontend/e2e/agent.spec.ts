import { test, expect, type APIRequestContext } from "@playwright/test";
import { defaults } from "../src/editor/model";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
async function fixture(request: APIRequestContext) {
  const provider = await (await request.get("/api/agent/provider")).json();
  test.skip(
    provider.model !== "labflow-fixture",
    "Requires the local protocol fixture; never calls a real model during E2E",
  );
  const project = await (
    await request.post("/api/projects", {
      data: { name: `Agent 验收 ${Date.now()}`, description: "合成测试" },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic-agent.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.8\n3,0.9"),
        },
      },
    })
  ).json();
  const config = defaults(data);
  config.style.title = "Before agent";
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "Assistant test", config },
    })
  ).json();
  return {
    project,
    chart,
    config,
    api: `/api/projects/${project.id}/charts/${chart.id}`,
    url: `/projects/${project.id}/figures/${chart.id}`,
  };
}
test("real Java/HTTP harness → diff confirmation → undo → save/reopen → vector export", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Before agent",
  );
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "绘图助手", exact: true });
  await expect(
    dialog.getByRole("button", { name: "生成调整提案" }),
  ).toBeDisabled();
  await dialog
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("标题改成 Agent proposal，字号18，图例放右边");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "生成调整提案" }).click();
  await expect(dialog.getByText("提案已就绪", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("当前数据样式预览")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dialog.locator(".gtitle")).toHaveText(
    "Agent proposal · synthetic",
  );
  expect((await (await request.get(f.api)).json()).revision).toBe(1);
  expect((await (await request.get(f.api)).json()).config).toEqual(f.config);
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Before agent",
  );
  await dialog.getByText("运行记录", { exact: true }).click();
  await page.screenshot({
    path: "../docs/screenshots/agent-proposal.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    dialog.getByRole("button", { name: "应用这组调整" }),
  ).toBeInViewport();
  await dialog.getByRole("button", { name: "应用这组调整" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Agent proposal · synthetic",
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Before agent",
  );
  await expect(
    page.getByRole("button", { name: "撤销", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Agent proposal · synthetic",
  );
  const saved = await (await request.get(f.api)).json();
  expect(saved.config.style.fontSize).toBe(18);
  expect(saved.config.legend.position).toBe("right");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("文件格式", { exact: true }).selectOption("svg");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载图表", exact: true }).click();
  const svg = fs.readFileSync((await (await download).path())!, "utf8");
  expect(svg).toContain("Agent proposal · synthetic");
  expect(svg).not.toContain("<image");
});
test("cancel during a pending HTTP response leaves no proposal or chart mutation", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "绘图助手", exact: true });
  await dialog
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("慢速绘图测试");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "生成调整提案" }).click();
  await dialog.getByRole("button", { name: "取消运行" }).click();
  await expect(dialog.getByText("已取消", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "应用这组调整" }),
  ).toBeDisabled();
  expect((await (await request.get(f.api)).json()).config).toEqual(f.config);
});
