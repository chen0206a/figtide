import { artifactPath } from "./artifacts";
import { test, expect } from "./workspace-test";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
test("real repeated samples → box/violin → facets → save/reopen → vector and PNG export", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const project = await (
    await request.post("/api/projects", {
      data: {
        name: `专业绘图验收 ${Date.now()}`,
        description: "synthetic repeated observations",
      },
    })
  ).json();
  const bytes = fs.readFileSync("../samples/demo-repeat-observations.csv");
  const imported = await request.post(`/api/projects/${project.id}/datasets`, {
    multipart: {
      file: {
        name: "demo-repeat-observations.csv",
        mimeType: "text/csv",
        buffer: bytes,
      },
      rules: JSON.stringify({
        schema_version: 1,
        delimiter: ",",
        sheet: 0,
        missingValues: [],
        types: {},
        roles: { model: "x", accuracy: "y" },
      }),
    },
  });
  expect(imported.ok()).toBeTruthy();
  const data = await imported.json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await expect(page.getByTestId("plot")).toBeVisible();
  await page.getByLabel("图表名称").fill("Repeated experiments · synthetic");
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page
    .getByLabel("图表标题", { exact: true })
    .fill("Repeated experiments · synthetic observations");
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "箱线图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "箱线图", exact: true }).click();
  await page.getByLabel("四分位算法").selectOption("exclusive");
  await page.getByRole("switch", { name: "显示均值线", exact: true }).check();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el._fullData[0]?.quartilemethod),
    )
    .toBe("exclusive");
  await expect
    .poll(() =>
      page.getByTestId("plot").evaluate((el: any) => el.data[0]?.y.length),
    )
    .toBe(72);
  await expect
    .poll(() => page.locator(".boxlayer path.box").count())
    .toBeGreaterThan(0);
  // Keep different evaluation datasets in separate distributions.
  await page.getByLabel("分面方式").selectOption("field");
  await page.getByLabel("分面字段").selectOption("dataset");
  await page
    .getByRole("button", { name: "适配多子图画布", exact: true })
    .click();
  await expect.poll(() => page.locator(".boxlayer path.box").count()).toBe(6);
  await page.getByRole("button", { name: /样本检查/ }).click();
  await expect(page.locator(".sample-summary tbody tr")).toHaveCount(6);
  await expect(
    page.locator(".sample-summary tbody tr").first().locator("td").nth(3),
  ).toHaveText("12");
  await page.getByRole("button", { name: /样本检查/ }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "关闭消息", exact: true }).click();
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await page.locator(".inspector-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: artifactPath(test.info(), "../docs/screenshots/professional-box.png"),
    fullPage: true,
  });
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "小提琴图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "小提琴图", exact: true }).click();
  await page.getByLabel("密度带宽").fill("0.4");
  await page.getByLabel("分面方式").selectOption("field");
  await page.getByLabel("分面字段").selectOption("dataset");
  await page
    .getByRole("button", { name: "适配多子图画布", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "共享 Y 轴范围", exact: true })
    .check();
  await page.getByLabel("子图 a 标题").fill("CIFAR-10 · 12 synthetic seeds");
  await page.getByLabel("子图 b 标题").fill("CIFAR-100 · 12 synthetic seeds");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) =>
          el.data.map((t: any) => [t.type, t.xaxis, t.bandwidth]),
        ),
    )
    .toEqual([
      ["violin", "x", 0.4],
      ["violin", "x2", 0.4],
    ]);
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el._fullLayout.yaxis2.matches),
    )
    .toBe("y");
  await expect
    .poll(() => page.locator(".violinlayer path.violin").count())
    .toBe(6);
  await page
    .getByRole("switch", { name: "共享 Y 轴范围", exact: true })
    .uncheck();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el._fullLayout.yaxis2.matches ?? "independent"),
    )
    .toBe("independent");
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate(
          (el: any) =>
            el._fullLayout.yaxis.range[0] - el._fullLayout.yaxis2.range[0],
        ),
    )
    .toBeGreaterThan(15);
  await page
    .getByRole("switch", { name: "共享 Y 轴范围", exact: true })
    .check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存 v2", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "关闭消息", exact: true }).click();
  await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  await page.screenshot({
    path: artifactPath(test.info(), "../docs/screenshots/professional-facets.png"),
    fullPage: true,
  });
  const charts = await (
    await request.get(`/api/projects/${project.id}/charts`)
  ).json();
  const saved = await (
    await request.get(`/api/projects/${project.id}/charts/${charts[0].id}`)
  ).json();
  expect(saved.config.distribution).toMatchObject({
    bandwidth: "0.4",
    quartileMethod: "exclusive",
    mean: true,
  });
  expect(saved.config.facet).toMatchObject({
    mode: "field",
    field: "dataset",
    shareY: true,
  });
  await page.reload();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el._fullLayout.yaxis2.matches),
    )
    .toBe("y");
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await expect(page.getByLabel("密度带宽")).toHaveValue("0.4");
  await expect(page.getByLabel("子图 a 标题")).toHaveValue(
    "CIFAR-10 · 12 synthetic seeds",
  );
  for (const format of ["svg", "png"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByLabel("文件格式").selectOption(format);
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载图表", exact: true }).click();
    await (
      await waiting
    ).saveAs(artifactPath(test.info(), `../docs/exports/professional-facets.${format}`));
  }
  const svg = fs.readFileSync(
    artifactPath(test.info(), "../docs/exports/professional-facets.svg"),
    "utf8",
  );
  expect(svg).toContain("<text");
  expect(svg).not.toContain("<image");
  expect(svg).toContain("CIFAR-10 · 12 synthetic seeds");
  expect(svg).toContain("CIFAR-100 · 12 synthetic seeds");
  expect(svg.match(/class="violin"/g)).toHaveLength(6);
  const png = fs.readFileSync(artifactPath(test.info(), "../docs/exports/professional-facets.png"));
  expect(png.readUInt32BE(16)).toBe(saved.config.style.width * 2);
  expect(png.readUInt32BE(20)).toBe(saved.config.style.height * 2);
  // Switching types retains distribution and facet settings and can be undone.
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "折线图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "折线图", exact: true }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "专业", exact: true }).click();
  await expect(page.getByLabel("密度带宽")).toHaveValue("0.4");
  await expect(page.getByLabel("分面方式")).toHaveValue("field");
  const original = await request.get(
    `/api/projects/${project.id}/data/${data.id}/original`,
  );
  expect(await original.body()).toEqual(bytes);
  expect(errors).toEqual([]);
});

test("sparse violin warns and shows only actual samples, invalid bandwidth cannot save", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: { name: `小样本验收 ${Date.now()}`, description: "synthetic" },
    })
  ).json();
  const upload = await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "sparse.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("model,score\nA,1\nA,2\nB,5\nB,5\nB,5\nC,"),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "小提琴图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "小提琴图", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByTestId("plot")
        .evaluate((el: any) => el.data.flatMap((t: any) => t.y)),
    )
    .toEqual([1, 2, 5, 5, 5]);
  await expect
    .poll(() => page.locator(".violinlayer path.violin").count())
    .toBe(0);
  await page.getByRole("button", { name: /告警/ }).click();
  await expect(page.locator(".bottom-content")).toContainText(
    "仅显示真实观测点",
  );
  await page.getByLabel("密度带宽").fill("-1");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("密度带宽");
  expect(
    (await (await request.get(`/api/projects/${p.id}/charts`)).json()).length,
  ).toBe(0);
});

test("quartile methods compute known sample statistics in the actual plotting engine", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: {
        name: `四分位验收 ${Date.now()}`,
        description: "known synthetic sample",
      },
    })
  ).json();
  await request.post(`/api/projects/${p.id}/datasets`, {
    multipart: {
      file: {
        name: "known.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("model,score\nA,1\nA,2\nA,3\nA,4\nA,5"),
      },
    },
  });
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    p.id,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "科研绘图", exact: true }).click();
  await expect(page.locator(".chart-picker > summary")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "箱线图", exact: true })
      .isVisible())
  )
    await page.locator(".chart-picker > summary").click();
  await page.getByRole("button", { name: "箱线图", exact: true }).click();
  for (const [method, q1, q3] of [
    ["exclusive", 1.5, 4.5],
    ["inclusive", 2, 4],
    ["linear", 1.75, 4.25],
  ] as const) {
    await page.getByLabel("四分位算法").selectOption(method);
    await expect
      .poll(() =>
        page.getByTestId("plot").evaluate((el: any) => {
          const sample = el.calcdata?.[0]?.[0];
          return sample ? [sample.q1, sample.med, sample.q3] : [];
        }),
      )
      .toEqual([q1, 3, q3]);
  }
  await page
    .getByRole("button", { name: "坐标轴", exact: true })
    .last()
    .click();
  await expect(
    page.getByLabel("最小值", { exact: true }).first(),
  ).toBeDisabled();
  await expect(page.getByLabel("最小值", { exact: true }).last()).toBeEnabled();
});
