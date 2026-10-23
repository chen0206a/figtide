import { test, expect } from "./workspace-test";
import fs from "node:fs";

test("storage failure is the exception: cancel safely, retry, then explicitly resolve a newer server version", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: `无打断切换验收 ${Date.now()}`, description: "合成数据" },
    })
  ).json();
  const dataset = await (
    await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: "seamless.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.8\n3,0.9"),
        },
      },
    })
  ).json();
  const config = JSON.parse(
    fs.readFileSync("../docs/config-v1.example.json", "utf8"),
  );
  config.datasetVersionId = dataset.id;
  config.series[0].error = "";
  const chart = await (
    await request.post(`/api/projects/${project.id}/charts`, {
      data: { name: "切换草稿验收", config },
    })
  ).json();
  const url = `/projects/${project.id}/figures/${chart.id}`;
  await page.goto(url);
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.evaluate(() => {
    const native = Storage.prototype.setItem;
    (window as any).__restoreDraftStorage = () => {
      Storage.prototype.setItem = native;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("labflow-draft-v1:"))
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      native.call(this, key, value);
    };
  });
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Latest locally edited title");
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  const warning = page.getByRole("dialog", { name: "确认操作" });
  await expect(warning).toContainText("本机草稿暂时无法保存");
  await warning.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Latest locally edited title",
  );
  await page.evaluate(() => (window as any).__restoreDraftStorage());
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await expect(page).toHaveURL(url);
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Latest locally edited title",
  );
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  const updated = structuredClone(config);
  updated.style.title = "New server version";
  const saved = await request.put(
    `/api/projects/${project.id}/charts/${chart.id}`,
    { data: { name: chart.name, revision: chart.revision, config: updated } },
  );
  expect(saved.ok()).toBe(true);
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "本机草稿与已保存版本不同" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "使用已保存版本", exact: true })
    .click();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "New server version",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "../docs/screenshots/seamless-editor.png" });
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  await page.screenshot({ path: "../docs/screenshots/seamless-data.png" });
});

test("new dataset drafts stay isolated and saving preserves the inspector context and other drafts", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: `草稿连续编辑验收 ${Date.now()}`, description: "合成数据" },
    })
  ).json();
  const upload = async (name: string) =>
    (
      await request.post(`/api/projects/${project.id}/datasets`, {
        multipart: {
          file: {
            name,
            mimeType: "text/csv",
            buffer: Buffer.from("epoch,accuracy\n1,0.7\n2,0.8\n3,0.9"),
          },
        },
      })
    ).json();
  const a = await upload("dataset-a.csv"),
    b = await upload("dataset-b.csv");
  const path = (id: number) =>
    `/projects/${project.id}/figures/new?dataset=${id}`;
  await page.goto(path(a.id));
  await expect(
    page.getByText("新图表 · 可以直接编辑", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByLabel("图表标题", { exact: true }).fill("Dataset A draft");
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  await page.goto(path(b.id));
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.getByLabel("图表标题", { exact: true })).not.toHaveValue(
    "Dataset A draft",
  );
  await page.getByLabel("图表标题", { exact: true }).fill("Dataset B draft");
  await page.getByRole("link", { name: "实验记录", exact: true }).click();
  await page.getByLabel("搜索实验", { exact: true }).fill("remember my filter");
  await page.getByRole("link", { name: "数据管理", exact: true }).click();
  await page.getByRole("link", { name: "实验记录", exact: true }).click();
  await expect(page.getByLabel("搜索实验", { exact: true })).toHaveValue(
    "remember my filter",
  );
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await expect(page).toHaveURL(path(b.id));
  await expect(
    page.getByRole("button", { name: "外观", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Dataset B draft",
  );
  await page.goto(path(a.id));
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Dataset A draft",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await (await request.get(`/api/projects/${project.id}/charts`)).json(),
  ).toEqual([]);

  let release!: () => void, fetched!: (chart: any) => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stored = new Promise<any>((resolve) => {
    fetched = resolve;
  });
  await page.route(`**/api/projects/${project.id}/charts`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    fetched(await response.json());
    await hold;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const saved = await stored;
  try {
    await expect(page.locator(".editor-body")).toHaveAttribute("inert", "");
    await expect(
      page.getByRole("button", { name: "保存", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page).toHaveURL(`/projects/${project.id}/figures/${saved.id}`);
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Dataset A draft",
  );
  const server = await (
    await request.get(`/api/projects/${project.id}/charts/${saved.id}`)
  ).json();
  expect(server.config.style.title).toBe("Dataset A draft");
  expect(server.config.datasetVersionId).toBe(a.id);
  await page.reload();
  await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue(
    "Dataset A draft",
  );
  const bDraft = await page.evaluate(
    ({ p, b }) =>
      JSON.parse(
        localStorage.getItem(`labflow-draft-v1:${p}:new-${b}`) || "null",
      ),
    { p: project.id, b: b.id },
  );
  expect(bDraft.config.style.title).toBe("Dataset B draft");
});
