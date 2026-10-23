import { test, expect, type APIRequestContext } from "./workspace-test";
import fs from "node:fs";

/** 项目切换隔离：切换完成后，页面上不应出现上一个项目的数据。 */

type Seeded = { project: number; dataset: number; chart?: number; file: string };

async function seed(
  request: APIRequestContext,
  name: string,
  file: string,
  withChart = true,
  withData = true,
): Promise<Seeded> {
  const project = await (
    await request.post("/api/projects", {
      data: { name: `${name} ${Date.now()}`, description: "合成演示" },
    })
  ).json();
  if (!withData) return { project: project.id, dataset: 0, file };
  const data = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: file,
          mimeType: "text/csv",
          buffer: Buffer.from("epoch,accuracy\n1,0.71\n2,0.82\n3,0.9"),
        },
      },
    })
  ).json();
  if (!withChart) return { project: project.id, dataset: data.id, file };
  const config = JSON.parse(
    fs.readFileSync("../docs/config-v1.example.json", "utf8"),
  );
  config.datasetVersionId = data.id;
  config.series = [
    { ...config.series[0], x: "epoch", y: "accuracy", error: "" },
  ];
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: `${name} 图表`, config },
    })
  ).json();
  return { project: project.id, dataset: data.id, chart: chart.id, file };
}

async function sampleBody(page: import("@playwright/test").Page, times = 20) {
  const seen: string[] = [];
  for (let i = 0; i < times; i++) {
    seen.push(await page.evaluate(() => document.body.innerText));
    await page.waitForTimeout(50);
  }
  return seen.join("\n");
}

test("data page never shows the previous project's file after switching", async ({
  page,
  request,
}) => {
  const a = await seed(request, "隔离验收 A", "isolation-a-synthetic.csv");
  const b = await seed(request, "隔离验收 B", "isolation-b-synthetic.csv", false, false);
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    a.project,
  );

  await page.goto(`/projects/${a.project}/data`);
  await expect(page.getByText(a.file)).toBeVisible();

  await page.getByLabel("当前项目").selectOption(String(b.project));
  const sampled = await sampleBody(page);

  expect(sampled).not.toContain(a.file);
  await expect(page.getByText(/将实验结果带入工作区/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${b.project}/data$`));
});

test("editor does not keep the previous project's figure while the next one loads", async ({
  page,
  request,
}) => {
  const a = await seed(request, "隔离验收 A2", "isolation-a2-synthetic.csv");
  const b = await seed(request, "隔离验收 B2", "isolation-b2-synthetic.csv");
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    a.project,
  );

  await page.goto(`/projects/${a.project}/figures/${a.chart}`);
  await expect(page.getByTestId("plot")).toBeVisible();

  // 让新项目的数据晚到 800ms，放大"加载期间仍显示旧数据"的窗口。
  await page.route(`**/api/projects/${b.project}/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.getByLabel("当前项目").selectOption(String(b.project));
  const sampled = await sampleBody(page, 24);

  expect(sampled).not.toContain(a.file);
  await expect(page.getByTestId("plot")).toBeVisible();
});

test("import dialog stores the file in the project that is currently selected", async ({
  page,
  request,
}) => {
  const a = await seed(request, "隔离验收 A3", "isolation-a3-synthetic.csv");
  const b = await seed(request, "隔离验收 B3", "isolation-b3-synthetic.csv", false, false);
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    a.project,
  );

  await page.goto(`/projects/${a.project}/data`);
  await page.getByLabel("当前项目").selectOption(String(b.project));
  await expect(page.getByText(/将实验结果带入工作区/)).toBeVisible();

  await page.getByTestId("file-upload").setInputFiles({
    name: "isolation-target.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("epoch,accuracy\n1,0.6\n2,0.8"),
  });
  await page.getByRole("button", { name: "确认导入" }).click();

  await expect(page.getByText("isolation-target.csv")).toBeVisible();
  const stored = await (
    await request.get(`/api/projects/${b.project}/datasets`)
  ).json();
  expect(stored.length).toBe(1);
  const untouched = await (
    await request.get(`/api/projects/${a.project}/datasets`)
  ).json();
  expect(untouched.length).toBe(1);
});

test("home charts and experiment lists stay isolated when switching projects", async ({
  page,
  request,
}) => {
  const a = await seed(request, "隔离验收 A4", "isolation-a4-synthetic.csv");
  const b = await seed(request, "隔离验收 B4", "isolation-b4-synthetic.csv", false, false);
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    a.project,
  );

  await page.goto("/");
  await expect(page.getByText("隔离验收 A4 图表")).toBeVisible();

  await page.getByLabel("当前项目").selectOption(String(b.project));
  const sampled = await sampleBody(page);

  expect(sampled).not.toContain("隔离验收 A4 图表");

  // A separate scenario in the same test keeps the fixed 80-test manifest,
  // while retaining all existing home assertions and adding experiment coverage.
  await test.step("experiment names never cross project boundaries (50ms × 20)", async () => {
    const aName = `实验隔离 A ${a.project}`;
    const bName = `实验隔离 B ${b.project}`;
    for (const [id, name] of [[a.project, aName], [b.project, bName]] as const) {
      const response = await request.post(`/api/projects/${id}/experiments`, {
        data: { name, status: "completed", parameters: {}, metrics: {}, notes: "合成隔离验收", tags: [] },
      });
      expect(response.ok()).toBe(true);
    }
    await page.goto(`/projects/${a.project}/experiments`);
    await expect(page.getByText(aName, { exact: true })).toBeVisible();
    await page.getByLabel("当前项目").selectOption(String(b.project));
    expect(await sampleBody(page, 20)).not.toContain(aName);
    await expect(page.getByText(bName, { exact: true })).toBeVisible();
    await page.getByLabel("当前项目").selectOption(String(a.project));
    expect(await sampleBody(page, 20)).not.toContain(bName);
    await expect(page.getByText(aName, { exact: true })).toBeVisible();
  });
});
test("a dataset id carried over from another project never breaks the data page", async ({
  page,
  request,
}) => {
  const a = await seed(request, "隔离验收 A5", "isolation-a5-synthetic.csv");
  const b = await seed(request, "隔离验收 B5", "isolation-b5-synthetic.csv", false);
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    a.project,
  );

  // 切换项目后，工作区记忆里可能还留着上一个项目的版本号。
  await page.goto(`/projects/${b.project}/data?dataset=${a.dataset}`);
  await page.waitForTimeout(1200);
  const body = await page.locator("main").innerText();

  expect(body).not.toContain(a.file);
  expect(body).not.toContain("重试");
  await expect(page.getByRole("heading", { name: b.file })).toBeVisible();
});
