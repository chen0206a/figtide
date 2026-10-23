import { test, expect } from "./workspace-test";

test("import preview → explicit rules → mapping → draft recovery → conflict copy → archive", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const project = await (
    await request.post("/api/projects", {
      data: { name: `第一批验收 ${Date.now()}`, description: "合成演示" },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );
  await page.goto("/");
  await page.getByTestId("file-upload").setInputFiles({
    name: "确认演示.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("epoch,score,std\n1,NA,0.1\n2,92,0.2\n3,95,0.3"),
  });
  await expect(page.getByLabel("score 类型")).toBeVisible();
  expect(
    await (await request.get(`/api/projects/${project.id}/datasets`)).json(),
  ).toHaveLength(0);
  await page.getByLabel("score 类型").selectOption("number");
  await expect(page.getByRole("alert")).toContainText("第 2 行");
  await expect(
    page.getByRole("button", { name: "确认导入", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("缺失符号（以逗号分隔）").fill("NA");
  await page.getByLabel("epoch 角色").selectOption("x");
  await page.getByLabel("score 角色").selectOption("y");
  await page.getByLabel("std 角色").selectOption("error");
  await expect(
    page.getByRole("button", { name: "确认导入", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "../docs/screenshots/import-confirm.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "确认演示.csv" }),
  ).toBeVisible();
  await page.getByLabel("仅看缺失行").check();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await page.getByLabel("仅看缺失行").uncheck();
  await page.getByLabel("搜索数据").fill("95");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await page.getByLabel("搜索数据").fill("");
  await page.getByRole("button", { name: "用于绘图", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.data[0]?.error_y?.array),
    )
    .toEqual([0.1, 0.2, 0.3]);
  await page.getByLabel("图表名称").fill("草稿恢复验收");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("图表标题", { exact: true }).fill("Recovered research");
  await expect(page.getByText("本机草稿已保存", { exact: true })).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Recovered research",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  const charts = await (
    await request.get(`/api/projects/${project.id}/charts`)
  ).json();
  const chart = await (
    await request.get(`/api/projects/${project.id}/charts/${charts[0].id}`)
  ).json();
  expect(chart.config.x).toBe("epoch");
  expect(chart.config.series[0].y).toBe("score");
  await request.put(`/api/projects/${project.id}/charts/${chart.id}`, {
    data: { name: chart.name, revision: chart.revision, config: chart.config },
  });
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Local conflicting title");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "图表已有更新版本" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "另存副本" })
    .click();
  await expect(page.getByLabel("图表名称")).toHaveValue("草稿恢复验收 · 副本");
  await page.getByRole("button", { name: "数据栏", exact: true }).click();
  await expect(page.locator(".editor-left")).toBeHidden();
  await page.getByRole("button", { name: "数据栏", exact: true }).click();
  await page.getByRole("separator", { name: "调整数据栏宽度" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("separator", { name: "调整数据栏宽度" }),
  ).toHaveAttribute("aria-valuenow", "246");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Learning accuracy · synthetic data");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "项目概览", exact: true }).click();
  await openHomeChart(page, "草稿恢复验收 · 副本");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Learning accuracy · synthetic data",
  );
  await page.getByRole("button", { name: "关闭消息", exact: true }).click();
  await page.getByLabel("图表名称").blur();
  await page.screenshot({
    path: "../docs/screenshots/editor-refined.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "管理项目", exact: true }).click();
  let row = page.locator(".manage-list>div").filter({ hasText: project.name });
  await row.getByRole("button", { name: "重命名" }).click();
  await page.getByLabel("项目名称").fill(project.name + " 已整理");
  await page.getByRole("button", { name: "保存项目" }).click();
  row = page
    .locator(".manage-list>div")
    .filter({ hasText: project.name + " 已整理" });
  await row.getByRole("button", { name: "归档", exact: true }).click();
  await expect(row.getByText("已归档", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(row.getByText("工作区项目", { exact: true })).toBeVisible();
  expect(
    await (await request.get(`/api/projects/${project.id}/charts`)).json(),
  ).toHaveLength(2);
  expect(errors).toEqual([]);
});
import { openHomeChart } from "./fixtures/home-navigation";
