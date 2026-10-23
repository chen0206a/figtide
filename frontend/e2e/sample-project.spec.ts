import { test, expect } from "./workspace-test";

type Project = {
  id: number;
  name: string;
  description: string;
  archived: boolean;
};

test("an empty workspace can create the sample project from scratch and open it again", async ({
  page,
  request,
}) => {
  const list = (await (await request.get("/api/projects")).json()) as Project[];
  const active = list.filter((project) => !project.archived);
  for (const project of active) {
    const response = await request.put(`/api/projects/${project.id}`, {
      data: {
        name: project.name,
        description: project.description,
        archived: true,
      },
    });
    if (!response.ok())
      throw new Error(`${project.id} ${project.name}: ${await response.text()}`);
  }

  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /从一个研究项目开始/ }),
    ).toBeVisible();
    await expect(page.getByText("项目里放数据、图表和实验记录。")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /导入数据/ }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "载入示例项目" }).click();
    await expect(page).toHaveURL(/\/projects\/\d+\/figures\/\d+$/);
    await expect(page.getByLabel("图表名称")).toHaveValue(
      "学习曲线 · 均值与标准误",
    );
    await expect(page.locator(".main-svg").first()).toBeVisible();
    const projectId = Number(page.url().match(/\/projects\/(\d+)\//)?.[1]);
    expect(projectId).toBeGreaterThan(0);

    const experiments = (await (
      await request.get(`/api/projects/${projectId}/experiments`)
    ).json()) as unknown[];
    expect(experiments).toHaveLength(3);
    const charts = (await (
      await request.get(`/api/projects/${projectId}/charts`)
    ).json()) as unknown[];
    expect(charts).toHaveLength(1);

    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "打开示例项目" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /示例 · 学习曲线/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "学习曲线 · 均值与标准误" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "打开示例项目" }).click();
    await expect(page).toHaveURL(/\/projects\/\d+\/figures\/\d+$/);
    await expect(page.getByLabel("图表名称")).toHaveValue(
      "学习曲线 · 均值与标准误",
    );
    await expect(page.locator(".main-svg").first()).toBeVisible();
  } finally {
    for (const project of active) {
      await request.put(`/api/projects/${project.id}`, {
        data: {
          name: project.name,
          description: project.description,
          archived: false,
        },
      });
    }
  }
});