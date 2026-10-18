import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
import fs from "node:fs/promises";
const projects = await (
  await fetch("http://127.0.0.1:8086/api/projects")
).json();
const demo = projects.find((p) => p.name === "视觉模型泛化研究 · 合成演示");
if (!demo) throw new Error("Run seed-demo first");
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const page = await browser.newPage({
  viewport: { width: 1560, height: 1000 },
  deviceScaleFactor: 1,
});
await page.addInitScript(
  (id) => localStorage.setItem("labflow-project", String(id)),
  demo.id,
);
await page.goto("http://127.0.0.1:5176");
await page.getByRole("button", { name: /Learning dynamics/ }).waitFor();
await page.waitForTimeout(900);
await page.screenshot({ path: "../docs/screenshots/home.png", fullPage: true });
await page.getByRole("button", { name: "实验记录", exact: true }).click();
await page.getByRole("heading", { name: "EXP-001 / Baseline" }).waitFor();
await page.waitForTimeout(900);
await page.screenshot({
  path: "../docs/screenshots/experiments.png",
  fullPage: true,
});
await page.getByRole("button", { name: "数据管理", exact: true }).click();
await page.getByRole("button", { name: /demo-learning-curves.csv/ }).click();
await page.getByRole("cell", { name: "54.2", exact: true }).waitFor();
await page.waitForTimeout(900);
await page.screenshot({ path: "../docs/screenshots/data.png", fullPage: true });
await page.getByRole("button", { name: "项目概览", exact: true }).click();
await page.getByRole("button", { name: /Learning dynamics/ }).click();
await page.locator(".main-svg").first().waitFor();
await page.waitForTimeout(900);
await page.getByRole("button", { name: "数据预览", exact: false }).click();
await page.waitForTimeout(900);
await page.screenshot({
  path: "../docs/screenshots/editor.png",
  fullPage: true,
});
await page.setViewportSize({ width: 1280, height: 800 });
await page.getByRole("button", { name: "适合窗口", exact: true }).click();
await page.waitForTimeout(900);
await page.screenshot({
  path: "../docs/screenshots/editor-1280.png",
  fullPage: true,
});
await page.setViewportSize({ width: 1560, height: 1000 });
await page.getByRole("button", { name: "项目概览", exact: true }).click();
await page.getByRole("button", { name: /Cross-dataset comparison/ }).click();
await page.locator(".shapelayer path").first().waitFor();
await page.waitForTimeout(900);
await page.screenshot({
  path: "../docs/screenshots/heatmap.png",
  fullPage: true,
});
console.log(
  "Captured five pages plus 1280px editor, real seeded MySQL records.",
);
await browser.close();
