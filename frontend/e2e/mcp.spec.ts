import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "./workspace-test";
import { defaults } from "../src/editor/model";

test("MCP save appears in the editor and the prior version can be restored", async ({ page, request }) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: `MCP E2E ${Date.now()}`, description: "合成数据" },
    })
  ).json();
  const dataset = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "mcp-synthetic.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("epoch,score\n1,0.71\n2,0.83"),
        },
      },
    })
  ).json();
  const original = defaults(dataset);
  original.style.title = "Before MCP E2E";
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "MCP browser chart", config: original },
    })
  ).json();
  const changed = structuredClone(original);
  changed.style.title = "Saved through MCP E2E";

  const baseUrl = process.env.LABFLOW_WEB_URL || "http://127.0.0.1:8086";
  const payload = Buffer.from(
    JSON.stringify({
      project_id: project.id,
      chart_id: chart.id,
      name: chart.name,
      base_revision: chart.revision,
      config: changed,
    }),
  ).toString("base64url");
  const helper = path.resolve("..", "mcp", "scripts", "call-tool.mjs");
  const result = JSON.parse(
    execFileSync(process.execPath, [helper, baseUrl, "save_chart_version", payload], {
      encoding: "utf8",
      timeout: 30000,
    }),
  );
  expect(result.isError).not.toBe(true);

  await page.goto(`/projects/${project.id}/figures/${chart.id}`);
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText("Saved through MCP E2E");
  await page.getByRole("button", { name: "版本历史" }).click();
  await expect(page.locator(".version-row")).toHaveCount(2);
  await page
    .locator(".version-row")
    .filter({ hasText: "版本 1" })
    .getByRole("button", { name: "载入快照" })
    .click();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText("Before MCP E2E");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v3", { exact: false })).toBeVisible();
});
