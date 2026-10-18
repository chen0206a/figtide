import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:5176",
    viewport: { width: 1560, height: 1000 },
    headless: true,
    acceptDownloads: true,
    // 本机没有下载 Playwright 自带 Chromium 时，复用系统 Chrome，
    // 避免测试依赖浏览器二进制下载（沙箱/离线环境可重复执行）。
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
