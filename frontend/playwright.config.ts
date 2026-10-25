import { defineConfig } from "@playwright/test";
const webUrl = process.env.LABFLOW_WEB_URL || "http://127.0.0.1:5176";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: webUrl,
    viewport: { width: 1560, height: 1000 },
    headless: true,
    reducedMotion: "reduce",
    acceptDownloads: true,
    // 本机没有下载 Playwright 自带 Chromium 时，复用系统 Chrome，
    // 避免测试依赖浏览器二进制下载（沙箱/离线环境可重复执行）。
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  // 记录运行前的项目数量，结束后删掉本次新建的项目，避免测试数据堆进真实库。
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // 开发服务器缺失时自动拉起，已有实例则直接复用（后端与 MySQL 仍需外部就绪）。
  webServer: process.env.LABFLOW_DESKTOP_E2E === "1" ? undefined : {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${new URL(webUrl).port || "5176"} --strictPort`,
    url: webUrl,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
