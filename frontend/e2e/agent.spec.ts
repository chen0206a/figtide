import { test, expect, type APIRequestContext } from "./workspace-test";
import { defaults } from "../src/editor/model";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
test("clarification carries into a follow-up and collapsing the panel preserves the conversation", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
  await panel
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("轴方向测试：把范围改为0到1");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "生成调整提案" }).click();
  await expect(panel.getByRole("log")).toContainText(
    "请问要调整 X 轴还是 Y 轴？",
  );
  await panel.getByRole("button", { name: "收起绘图助手" }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  await expect(panel.getByRole("log")).toContainText("轴方向测试");
  await panel.getByRole("textbox", { name: "希望怎样调整？" }).fill("Y 轴");
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/agent/runs") && r.method() === "POST",
  );
  await panel.getByRole("button", { name: "生成调整提案" }).click();
  expect((await sent).postDataJSON().prompt).toContain(
    "请问要调整 X 轴还是 Y 轴？",
  );
  await expect(panel.getByText("提案已就绪", { exact: true })).toBeVisible();
  expect((await (await request.get(f.api)).json()).revision).toBe(1);
  await panel.getByRole("button", { name: "应用这组调整" }).click();
  await expect(panel.getByText("已接受", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: true })).toBeVisible();
  const saved = await (await request.get(f.api)).json();
  expect(saved.config.axes.y.min).toBe("0");
  expect(saved.config.axes.y.max).toBe("1");
  expect(saved.config.axes.x).toEqual(f.config.axes.x);
});
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
  const dialog = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
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
    path: "../docs/screenshots/agent-conversation.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    dialog.getByRole("button", { name: "应用这组调整" }),
  ).toBeInViewport();
  await dialog.getByRole("button", { name: "应用这组调整" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("已接受", { exact: true })).toBeVisible();
  const audits = await (
    await request.get(
      `/api/projects/${f.project.id}/agent/history?chart_id=${f.chart.id}`,
    )
  ).json();
  expect(audits.items[0].outcome).toBe("accepted");
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
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const reopened = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
  await reopened.getByRole("tab", { name: "运行历史" }).click();
  await reopened
    .getByLabel("运行历史列表")
    .getByRole("button", { name: /labflow-fixture/ })
    .click();
  await expect(
    reopened.getByRole("heading", { name: "已接受", exact: true }),
  ).toBeVisible();
  await expect(reopened.getByLabel("历史运行详情")).toContainText(
    "figure-assistant-v6",
  );
  await reopened
    .getByText("第 1 步 · 文字与字体 · 调用", { exact: true })
    .click();
  await expect(
    reopened.locator(".agent-audit-trace pre").first(),
  ).toContainText('"fontSize": 18');
  await page.setViewportSize({ width: 1560, height: 1000 });
  await page.screenshot({
    path: "../docs/screenshots/agent-conversation-history.png",
    fullPage: true,
  });
});
test("cancel during a pending HTTP response leaves no proposal or chart mutation", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const dialog = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
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
  const audits = await (
    await request.get(
      `/api/projects/${f.project.id}/agent/history?chart_id=${f.chart.id}`,
    )
  ).json();
  expect(audits.items[0].outcome).toBe("cancelled");
});

test("explicit rejection is persisted, redacted, immutable and readable after refresh", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const dialog = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("调整字号与图例");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "生成调整提案" }).click();
  await expect(dialog.getByText("提案已就绪", { exact: true })).toBeVisible();
  await dialog.getByText("不采用这份提案", { exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "拒绝原因（可选）" })
    .fill("图例位置不合适 api_key=do-not-store");
  await dialog.getByRole("button", { name: "拒绝提案", exact: true }).click();
  await expect(dialog.getByText("已拒绝", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "应用这组调整" }),
  ).toBeDisabled();
  expect((await (await request.get(f.api)).json()).config).toEqual(f.config);
  await page.reload();
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const history = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
  await history.getByRole("tab", { name: "运行历史" }).click();
  await history.getByLabel("历史结果").selectOption("rejected");
  await history
    .getByLabel("运行历史列表")
    .getByRole("button", { name: /labflow-fixture/ })
    .click();
  await expect(
    history.getByRole("heading", { name: "已拒绝", exact: true }),
  ).toBeVisible();
  await expect(history.getByLabel("历史运行详情")).toContainText(
    "图例位置不合适",
  );
  await expect(history.getByLabel("历史运行详情")).not.toContainText(
    "do-not-store",
  );
  const list = await (
    await request.get(
      `/api/projects/${f.project.id}/agent/history?outcome=rejected`,
    )
  ).json();
  const row = await (
    await request.get(
      `/api/projects/${f.project.id}/agent/runs/${list.items[0].run_id}/audit`,
    )
  ).json();
  const conflict = await request.post(
    `/api/projects/${f.project.id}/agent/runs/${row.run_id}/decision`,
    { data: { outcome: "accepted", proposal_hash: row.proposal_hash } },
  );
  expect(conflict.status()).toBe(409);
  expect(JSON.stringify(row)).not.toContain("Agent proposal · synthetic");
});

test("three proposal rounds preserve a manual edit, confirm once, undo once and save the complete result", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.goto(f.url);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
  await panel
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("标题、字号18和右侧图例");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "生成调整提案" }).click();
  await expect(
    panel.getByRole("button", { name: "继续修改提案" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "收起绘图助手" }).click();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByRole("combobox", { name: "字重", exact: true })
    .selectOption("bold");
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "应用这组调整" }),
  ).toBeDisabled();
  await panel
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("续改字号20，其他保留");
  await panel.getByRole("button", { name: "继续修改提案" }).click();
  await expect(
    panel.getByRole("textbox", { name: "希望怎样调整？" }),
  ).toHaveValue("");
  await expect(
    panel.getByRole("button", { name: "应用这组调整" }),
  ).toBeEnabled();
  await panel
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("续改隐藏网格：只隐藏Y轴网格");
  await panel.getByRole("button", { name: "继续修改提案" }).click();
  await expect(
    panel.getByRole("textbox", { name: "希望怎样调整？" }),
  ).toHaveValue("");
  await expect(
    panel.getByRole("button", { name: "应用这组调整" }),
  ).toBeEnabled();
  const historyUrl = `/api/projects/${f.project.id}/agent/history?chart_id=${f.chart.id}`;
  const before = await (await request.get(historyUrl)).json();
  expect(before.items.map((r: any) => r.outcome).sort()).toEqual([
    "pending",
    "superseded",
    "superseded",
  ]);
  expect((await (await request.get(f.api)).json()).config).toEqual(f.config);
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Before agent",
  );
  await page.screenshot({
    path: "../docs/screenshots/agent-refinement.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "应用这组调整" }).click();
  await expect(panel.getByText("已接受", { exact: true })).toBeVisible();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Agent proposal · synthetic",
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Before agent",
  );
  await panel.getByRole("button", { name: "收起绘图助手" }).click();
  await expect(
    page.getByRole("combobox", { name: "字重", exact: true }),
  ).toHaveValue("bold");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: true })).toBeVisible();
  await page.reload();
  const saved = await (await request.get(f.api)).json();
  expect(saved.config.style.fontSize).toBe(20);
  expect(saved.config.style.bold).toBe(true);
  expect(saved.config.legend.position).toBe("right");
  expect(saved.config.axes.y.grid).toBe(false);
  expect(saved.revision).toBe(2);
  expect(
    (await (await request.get(historyUrl)).json()).items.filter(
      (r: any) => r.outcome === "accepted",
    ),
  ).toHaveLength(1);
});

test("refresh during a live run restores progress, budget and pending proposal without a duplicate call", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/agent/runs") && r.method() === "POST")
      posts.push(r.postDataJSON().request_id);
  });
  await page.goto(f.url);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
  await panel
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("慢速恢复测试：字号18，图例右侧");
  await panel.getByRole("checkbox").check();
  const started = page.waitForResponse(
    (r) => r.url().endsWith("/agent/runs") && r.request().method() === "POST",
  );
  await panel.getByRole("button", { name: "生成调整提案" }).click();
  const initial = await (await started).json();
  await page.reload();
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  await expect(
    panel.getByText("已恢复本次对话；尚未应用的提案仍需确认。"),
  ).toBeVisible();
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await expect(panel.getByRole("button", { name: "应用这组调整" })).toBeEnabled(
    { timeout: 20000 },
  );
  expect(posts).toEqual([initial.run_id]);
  const resumed = await (
    await request.get(
      `/api/projects/${f.project.id}/agent/runs/${initial.run_id}/resume`,
    )
  ).json();
  expect(resumed.session.session_id).toBe(initial.session_id);
  expect(resumed.session.used_budget).toBeGreaterThan(0);
  expect(resumed.session.reserved_budget).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "应用这组调整" }),
  ).toBeEnabled();
  expect(posts).toHaveLength(1);
  await panel.getByRole("button", { name: "应用这组调整" }).click();
  await expect(panel.getByText("已接受", { exact: true })).toBeVisible();
  expect((await (await request.get(f.api)).json()).revision).toBe(1);
});

test("lost HTTP start response recovers the original run; explicit new conversation resets an exhausted allowance", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  let posts = 0;
  await page.route("**/api/projects/*/agent/runs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await page.goto(f.url);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "绘图助手",
    exact: true,
  });
  await panel.getByRole("textbox", { name: "希望怎样调整？" }).fill("修改字号");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "生成调整提案" }).click();
  await panel.getByRole("button", { name: "重新连接" }).click();
  await expect(
    panel.getByRole("button", { name: "应用这组调整" }),
  ).toBeEnabled();
  expect(posts).toBe(1);
  await panel.getByText("不采用这份提案").click();
  await panel.getByRole("button", { name: "拒绝提案", exact: true }).click();
  await panel.getByRole("button", { name: "开始新对话" }).click();
  await page.unroute("**/api/projects/*/agent/runs");
  await panel.locator(".agent-budget summary").click();
  await panel
    .getByRole("combobox", { name: "本次对话额度" })
    .selectOption("60000");
  await panel
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("慢速预算测试");
  const started = page.waitForResponse(
    (r) => r.url().endsWith("/agent/runs") && r.request().method() === "POST",
  );
  await panel.getByRole("button", { name: "生成调整提案" }).click();
  const initial = await (await started).json();
  await panel.getByRole("button", { name: "取消运行" }).click();
  await expect(
    panel.getByText(
      "本次会话剩余额度不足；仍可查看或应用已有提案，开始新对话可重新设置额度。",
    ),
  ).toBeVisible();
  const cancelled = await (
    await request.get(
      `/api/projects/${f.project.id}/agent/runs/${initial.run_id}`,
    )
  ).json();
  expect(cancelled.session.used_budget).toBe(60000);
  expect(cancelled.session.uncertain_runs).toBe(1);
  await panel.getByRole("textbox", { name: "希望怎样调整？" }).fill("再改一次");
  await expect(
    panel.getByRole("button", { name: "生成调整提案" }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "开始新对话" }).click();
  await expect(
    panel.getByRole("combobox", { name: "本次对话额度" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "../docs/screenshots/agent-session-budget.png",
    fullPage: true,
  });
});
