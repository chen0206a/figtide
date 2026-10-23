import { test, expect } from "./workspace-test";
import { artifactPath } from "./artifacts";

test.use({ reducedMotion: "reduce" });

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

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(".home h1")).toHaveCSS("opacity", "1");
      await expect(page.getByRole("button", { name: "创建研究项目", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: artifactPath(test.info(), `../docs/product-audit/after/11-5-empty-home-${width}.png`), fullPage: true, animations: "disabled" });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.getByRole("button", { name: "载入示例项目" }).click();
    await expect(page).toHaveURL(/\/projects\/\d+\/figures\/\d+$/);
    await expect(page.getByLabel("图表名称")).toHaveValue(
      "学习曲线 · 均值与标准误",
    );
    await expect(page.locator(".main-svg").first()).toBeVisible();
    await expect(page.locator(".canvas-stage")).toHaveAttribute("aria-busy", "false");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".editor-left")).toHaveCSS("opacity", "1");
    await expect(page.locator(".editor-right")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: artifactPath(test.info(), "../docs/product-audit/after/11-5-sample-editor.png"), fullPage: true, animations: "disabled" });
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
    await expect(page.locator(".figure-preview").first()).toHaveAttribute("aria-busy", "false");
    await page.screenshot({ path: artifactPath(test.info(), "../docs/product-audit/after/11-5-sample-home.png"), fullPage: true, animations: "disabled" });

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
