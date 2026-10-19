import { test, expect } from "@playwright/test";
test.use({ reducedMotion: "reduce" });
test("three experiments → linked versions → comparison → immutable chart → source trace", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const project = await (
    await request.post("/api/projects", {
      data: {
        name: `实验关联验收 ${Date.now()}`,
        description: "全部为合成演示数据",
      },
    })
  ).json();
  for (let i = 1; i <= 3; i++) {
    const result = await request.post(`/api/projects/${project.id}/datasets`, {
      multipart: {
        file: {
          name: `run-${i}.csv`,
          mimeType: "text/csv",
          buffer: Buffer.from(`epoch,accuracy\n1,${80 + i}\n2,${89 + i}`),
        },
      },
    });
    expect(result.ok()).toBeTruthy();
  }
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "实验记录", exact: true }).click();
  const names = [
    "Baseline · 合成演示",
    "Augmentation · 合成演示",
    "Proposed · 合成演示",
  ];
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "记录实验", exact: true }).click();
    await page.getByLabel("实验名称").fill(names[i]);
    await page.getByLabel("实验状态", { exact: true }).selectOption("completed");
    await page.getByLabel("标签", { exact: true }).fill("vision, synthetic");
    await page.getByRole("button", { name: "添加参数", exact: true }).click();
    await page.getByLabel("参数 1 名称").fill("learning_rate");
    await page.getByLabel("参数 1 值").fill(String(0.001 * (i + 1)));
    await page.getByRole("button", { name: "添加指标", exact: true }).click();
    await page.getByLabel("指标 1 名称").fill("accuracy");
    await page.getByLabel("指标 1 值").fill(String([90, 93, 95][i]));
    await page.getByRole("button", { name: "添加指标", exact: true }).click();
    await page.getByLabel("指标 2 名称").fill("loss");
    if (i === 2) await page.getByLabel("指标 2 类型").selectOption("null");
    else await page.getByLabel("指标 2 值").fill(String(i === 0 ? 0.2 : 0.1));
    await page.getByLabel(`关联 run-${i + 1}.csv v1`, { exact: true }).check();
    await page
      .getByLabel("备注", { exact: true })
      .fill("合成演示，不代表真实实验结果。");
    if (i === 0) {
      await page.getByRole("dialog").evaluate((el) => { el.scrollTop = 0; });
      await page.screenshot({
        path: "../docs/screenshots/experiment-form.png",
        animations: "disabled",
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "保存记录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: names[i], exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("搜索实验").fill("Proposed");
  await expect(page.locator(".experiment-record")).toHaveCount(1);
  await page.getByLabel("搜索实验").fill("");
  await page.getByLabel("筛选实验状态").selectOption("planned");
  await expect(page.locator(".experiment-record")).toHaveCount(0);
  await page.getByLabel("筛选实验状态").selectOption("completed");
  await page
    .getByRole("button", { name: `复制配置 ${names[0]}`, exact: true })
    .click();
  await expect(page.getByLabel("参数 1 值")).toHaveValue("0.001");
  await expect(page.getByLabel("指标 1 名称")).toHaveCount(0);
  await expect(
    page.getByLabel("关联 run-1.csv v1", { exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  for (const name of names)
    await page.getByLabel(`选择实验 ${name}`, { exact: true }).check();
  await page.getByRole("button", { name: "对比所选实验", exact: true }).click();
  await page.getByLabel("loss 优劣方向").selectOption("lower");
  await expect(page.locator(".parameter-diff")).toContainText("learning_rate");
  await expect(page.getByText("+5 · 改善", { exact: true })).toBeVisible();
  await expect(page.getByText("-0.1 · 改善", { exact: true })).toBeVisible();
  await expect(page.getByText("实验记录已保存", { exact: true })).not.toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/experiment-compare.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.getByRole("button", { name: "生成对比图", exact: true }).click();
  await expect(page.getByTestId("plot")).toBeVisible();
  await expect
    .poll(() => page.getByTestId("plot").evaluate((e: any) => e.data[0]?.y))
    .toEqual([90, 93, 95]);
  await expect
    .poll(() => page.getByTestId("plot").evaluate((e: any) => e.data[0]?.type))
    .toBe("bar");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  const charts = await (
    await request.get(`/api/projects/${project.id}/charts`)
  ).json();
  const chart = await (
    await request.get(`/api/projects/${project.id}/charts/${charts[0].id}`)
  ).json();
  const sourceBefore = await (
    await request.get(
      `/api/projects/${project.id}/data/${chart.config.datasetVersionId}`,
    )
  ).json();
  expect(sourceBefore.source_meta.experiments).toHaveLength(3);
  const experiments = await (
    await request.get(`/api/projects/${project.id}/experiments`)
  ).json();
  const baseline = experiments.find((e: any) => e.name === names[0]);
  const updated = await request.put(
    `/api/projects/${project.id}/experiments/${baseline.id}`,
    { data: { ...baseline, metrics: { accuracy: 10, loss: 0.9 } } },
  );
  expect(updated.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: /accuracy · 实验对比/ }).click();
  await expect
    .poll(() => page.getByTestId("plot").evaluate((e: any) => e.data[0]?.y))
    .toEqual([90, 93, 95]);
  await page.getByRole("button", { name: "实验来源快照", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Baseline · 合成演示");
  await expect(page.getByRole("dialog").locator("a")).toHaveCount(3);
  await page.screenshot({
    path: "../docs/screenshots/experiment-source.png",
    animations: "disabled",
    fullPage: true,
  });
  const sourceAfter = await (
    await request.get(
      `/api/projects/${project.id}/data/${chart.config.datasetVersionId}`,
    )
  ).json();
  expect(sourceAfter.source_meta).toEqual(sourceBefore.source_meta);
  expect(sourceAfter.sha256).toEqual(sourceBefore.sha256);
  expect(errors).toEqual([]);
});
