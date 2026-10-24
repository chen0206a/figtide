import { test, expect } from "./workspace-test";

// 14-3-4 浏览器验收：迁移完成后，在桌面版（figtide.jar 静态页面）里打开已迁移项目，
// 确认图表渲染、数据与实验列表、归档标记都还在。
// 仅在迁移 E2E（LABFLOW_MIGRATION_E2E=1）时运行；普通 E2E 全量跑时跳过。
test.skip(
  !process.env.LABFLOW_MIGRATION_E2E,
  "迁移验收专用（scripts/test-migration.ps1 设置 LABFLOW_MIGRATION_E2E=1）",
);

async function findProject(request: string, name: string) {
  const projects = await (await request.get(`/api/projects`)).json();
  return projects.find((p: { name: string }) => p.name === name);
}

test("迁移后的多版本图表在桌面版浏览器里正常渲染", async ({
  page,
  request,
}) => {
  const project = await findProject(request, "代表·图表全家福");
  test.expect(project, "项目应已迁移到桌面版").toBeTruthy();
  const charts = await (
    await request.get(`/api/projects/${project.id}/charts`)
  ).json();
  const line = charts.find((c: { name: string }) => c.name === "准确率曲线");
  test.expect(line, "折线图应存在").toBeTruthy();

  await page.goto(`/projects/${project.id}/figures/${line.id}`);
  await expect(page.getByTestId("plot")).toBeVisible();
  await expect(page.getByTestId("plot").locator(".gtitle")).toHaveText(
    "Accuracy",
  );

  // 数据页应能看到两个数据集（原始 + 新版本）+ 派生 + 分类数据集
  await page.goto(`/projects/${project.id}/data`);
  await expect(
    page.getByRole("button", { name: "上传数据文件" }),
  ).toBeVisible();
  const datasets = await (
    await request.get(`/api/projects/${project.id}/datasets`)
  ).json();
  expect(datasets.length).toBeGreaterThanOrEqual(4);
});

test("迁移后的实验项目在桌面版浏览器里显示实验列表", async ({
  page,
  request,
}) => {
  const project = await findProject(request, "rep-experiments");
  test.expect(project, "实验项目应已迁移").toBeTruthy();
  await page.goto(`/projects/${project.id}/experiments`);
  await expect(page.getByText("baseline")).toBeVisible();
  await expect(page.getByText("tuned")).toBeVisible();
});

test("迁移后的归档项目保留归档标记", async ({ request }) => {
  const project = await findProject(request, "归档项目/特殊·字符「α」");
  test.expect(project, "归档项目应已迁移").toBeTruthy();
  expect(project.archived).toBe(true);
});
