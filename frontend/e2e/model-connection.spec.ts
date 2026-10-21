import { test, expect, type APIRequestContext } from "@playwright/test";
import { defaults } from "../src/editor/model";
test.use({ reducedMotion: "reduce" });
async function setup(request: APIRequestContext) {
  const original = await (await request.get("/api/agent/connection")).json();
  test.skip(
    original.model !== "labflow-fixture" ||
      !original.base_url.includes("127.0.0.1:18769"),
    "Only the isolated local fixture may receive these requests",
  );
  return original;
}
async function restore(request: APIRequestContext, original: any) {
  const current = await (await request.get("/api/agent/connection")).json();
  await request.put("/api/agent/connection", {
    headers: { "X-LabFlow-Connection": "1" },
    data: {
      revision: current.revision,
      base_url: original.base_url,
      model: original.model,
      keep_key: false,
      api_key: "",
    },
  });
}
test("web connection settings → two real HTTP probes → verified apply → secret-free reopen", async ({
  page,
  request,
}) => {
  const original = await setup(request);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "模型连接", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "模型连接" });
    await expect(dialog.getByLabel("模型名称", { exact: true })).toHaveValue(
      "labflow-fixture",
    );
    await dialog
      .getByLabel("API Key", { exact: true })
      .fill("fixture-e2e-private-key");
    await expect(
      dialog.getByRole("button", { name: "测试连接", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(dialog.getByText("对话与工具调用均正常")).toBeVisible();
    expect(
      (await (await request.get("/api/agent/connection")).json()).revision,
    ).toBe(original.revision);
    await dialog.getByRole("button", { name: "应用连接", exact: true }).click();
    await expect(dialog.getByText("连接已应用", { exact: true })).toBeVisible();
    const saved = await (await request.get("/api/agent/connection")).json();
    expect(saved.revision).toBe(original.revision + 1);
    expect(saved.verified_at).toBeTruthy();
    expect(JSON.stringify(saved)).not.toContain("fixture-e2e-private-key");
    await expect(dialog.getByLabel("API Key", { exact: true })).toHaveValue("");
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain("fixture-e2e-private-key");
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(
      dialog.getByRole("button", { name: "应用连接", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: "../docs/screenshots/model-connection.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(8);
    expect(bounds!.width).toBeLessThanOrEqual(374);
    await expect(
      dialog.getByRole("button", { name: "应用连接", exact: true }),
    ).toBeInViewport();
    await page.setViewportSize({ width: 1560, height: 1000 });
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "模型连接", exact: true }).click();
    await expect(dialog.getByText("已验证", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("API Key", { exact: true })).toHaveValue("");
    await dialog.getByRole("button", { name: "断开", exact: true }).click();
    await expect(dialog.getByText("已断开连接", { exact: true })).toBeVisible();
    expect(
      (await (await request.get("/api/agent/provider")).json()).available,
    ).toBe(false);
  } finally {
    await restore(request, original);
  }
});
test("editor settings expose real authentication failure without replacing the working model", async ({
  page,
  request,
}) => {
  const original = await setup(request);
  const project = await (
    await request.post("/api/projects", {
      data: {
        name: `模型连接验收 ${Date.now()}`,
        description: "Synthetic fixture only",
      },
    })
  ).json();
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "synthetic.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("x,y\n1,2\n2,3"),
        },
      },
    })
  ).json();
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "Connection fixture", config: defaults(data) },
    })
  ).json();
  await page.goto(`/projects/${project.id}/figures/${chart.id}`);
  await page.getByRole("button", { name: "绘图助手", exact: true }).click();
  const assistant = page.getByRole("complementary", { name: "绘图助手" });
  await assistant
    .getByRole("button", { name: "模型连接", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "模型连接" });
  await dialog.getByLabel("API Key", { exact: true }).fill("fixture-rejected");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("鉴权失败");
  await expect(dialog.getByRole("alert")).not.toContainText("secret response");
  expect(
    (await (await request.get("/api/agent/connection")).json()).revision,
  ).toBe(original.revision);
  await page.screenshot({
    path: "../docs/screenshots/model-connection-error.png",
    fullPage: false,
  });
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await assistant
    .getByRole("textbox", { name: "希望怎样调整？" })
    .fill("字号改为18");
  await assistant.getByRole("checkbox").check();
  await assistant
    .getByRole("button", { name: "生成调整提案", exact: true })
    .click();
  await expect(
    assistant.getByText("提案已就绪", { exact: true }),
  ).toBeVisible();
});
