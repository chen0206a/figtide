import { test, expect } from "./capture-test";
import { artifactPath } from "./artifacts";
import fs from "node:fs";

test("intro → import → edit → save → SVG/PNG never requests an external host", async ({ page }) => {
  const requests: { method: string; url: string }[] = [];
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  page.on("websocket", (socket) => requests.push({ method: "WS", url: socket.url() }));
  try {
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { name: "数据在哪里", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "开始创作", exact: true }).first().click();
    await expect(page.locator(".home")).toBeVisible();
    await page.getByRole("button", { name: "数据保存在本机", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "数据在哪里" })).toContainText("原始数据行和上传文件名");
    await page.getByRole("dialog", { name: "数据在哪里" }).getByRole("button", { name: "关闭", exact: true }).click();
    await page.locator(".masthead").getByRole("button", { name: "新建项目", exact: true }).click();
    await page.getByLabel("项目名称").fill(`本地网络验收 ${Date.now()}`);
    await page.getByLabel("研究简介").fill("合成演示；不调用模型。");
    await page.getByRole("button", { name: "创建项目", exact: true }).click();
    await expect(page.getByText("项目已创建，可以上传实验数据了")).toBeVisible();
    await page.getByTestId("file-upload").setInputFiles({ name: "local-only.csv", mimeType: "text/csv", buffer: Buffer.from("epoch,accuracy\n1,0.700\n2,0.800\n3,0.900") });
    await expect(page.getByText(/文件只保存在这台电脑上，不会上传到任何外部服务器/)).toBeVisible();
    await page.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(page.getByRole("heading", { name: "local-only.csv", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "用于绘图", exact: true }).click();
    await expect(page.getByTestId("plot").locator(".main-svg").first()).toBeVisible();
    await page.getByLabel("图表名称").fill("Local privacy check");
    await page.getByRole("button", { name: "外观", exact: true }).click();
    await page.getByLabel("图表标题", { exact: true }).fill("Local privacy check");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
    for (const format of ["svg", "png"]) {
      await page.getByRole("button", { name: "导出", exact: true }).click();
      await page.getByLabel("文件格式").selectOption(format);
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: "下载图表", exact: true }).click();
      const download = await pending;
      const file = artifactPath(test.info(), `../docs/exports/privacy-check.${format}`);
      await download.saveAs(file);
      expect(fs.statSync(file).size).toBeGreaterThan(1000);
      if (format === "svg") expect(fs.readFileSync(file, "utf8")).toContain("Local privacy check");
    }
    await page.evaluate(() => document.fonts.ready);
  } finally {
    const external = requests.filter(({ url }) => /^(https?|wss?):/.test(url) && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname));
    fs.writeFileSync(artifactPath(test.info(), "../docs/test-evidence/refactor11-7-network.json"), JSON.stringify({ requests, external }, null, 2));
  }
  expect(requests.filter(({ url }) => /^(https?|wss?):/.test(url) && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))).toEqual([]);
  expect(requests.filter(({ method, url }) => method === "POST" && /\/agent\/runs/.test(url))).toEqual([]);
});
