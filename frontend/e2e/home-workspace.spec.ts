import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("search and pagination switch real recent charts and experiments", async ({
  page,
  request,
}) => {
  const projects: { id: number; name: string }[] = [];
  const stamp = Date.now();
  for (let i = 0; i < 12; i++)
    projects.push(
      await (
        await request.post("/api/projects", {
          data: { name: `首页分页 ${stamp} / ${String(i).padStart(2, "0")}`, description: "合成演示" },
        })
      ).json(),
    );
  for (const [i, p] of projects.slice(0, 2).entries()) {
    const d = await (
      await request.post(`/api/projects/${p.id}/datasets`, {
        multipart: {
          file: {
            name: "home.csv",
            mimeType: "text/csv",
            buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.9"),
          },
        },
      })
    ).json();
    const config = JSON.parse(
      fs.readFileSync("../docs/config-v1.example.json", "utf8"),
    );
    config.datasetVersionId = d.id;
    config.series = [
      { ...config.series[0], x: "epoch", y: "accuracy", error: "" },
    ];
    await request.post(`/api/projects/${p.id}/charts`, {
      data: { name: `近期图表 ${i}`, config },
    });
    await request.post(`/api/projects/${p.id}/experiments`, {
      data: {
        name: `近期实验 ${i}`,
        status: "completed",
        parameters: { seed: i },
        metrics: { accuracy: 0.8 + i / 10 },
        notes: "合成演示",
        tags: [],
        datasetVersionIds: [d.id],
      },
    });
  }
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    projects[0].id,
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "近期图表 0", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-table")).toContainText("近期实验 0");
  await expect(page.locator(".home-project")).toHaveCount(4);
  await page.getByRole("button", { name: /显示更多项目/ }).click();
  await expect(page.locator(".home-project")).toHaveCount(12);
  const search = page.getByRole("textbox", { name: "搜索工作区项目" });
  await search.fill(projects[1].name);
  await expect(page.locator(".home-project")).toHaveCount(1);
  await page.locator(".home-project").click();
  await expect(page.getByLabel("当前项目", { exact: true })).toHaveValue(
    String(projects[1].id),
  );
  await expect(
    page.getByRole("heading", { name: "近期图表 1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-table")).toContainText("近期实验 1");
  await expect(page.locator(".home-table")).not.toContainText("近期实验 0");
  await search.fill("no-match");
  await expect(page.getByText("没有匹配的项目")).toBeVisible();
  await page.getByRole("button", { name: "清除搜索" }).click();
  await expect(page.locator(".home-project")).toHaveCount(4);
});
