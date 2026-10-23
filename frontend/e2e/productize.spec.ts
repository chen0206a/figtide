import { test, expect } from "./workspace-test";
import { artifactPath } from "./artifacts";

test.use({ reducedMotion: "reduce" });

/** 11-2：不像表格的文件需要用户明确确认；本地服务断开时不出现英文报错。 */

test("a prose file is flagged and needs an explicit confirmation", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: { name: `形态验收 ${Date.now()}`, description: "合成演示" },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );

  await page.goto("/");
  await page.getByTestId("file-upload").setInputFiles({
    name: "prose-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "这是一份实验记录，不是表格。第二行也没有逗号分隔。\n第三行同样是一句话。\n",
    ),
  });

  await expect(
    page.getByText(/这份文件看起来不是表格：只识别出 1 列/),
  ).toBeVisible();
  const confirm = page.getByRole("button", { name: "确认导入" });
  await expect(confirm).toBeDisabled();

  await page.getByLabel("我确认这是一份单列数据，仍要导入").check();
  await expect(confirm).toBeEnabled();
});

test("the offline page speaks about the local service, not the fetch error", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const project = await (
    await request.post("/api/projects", {
      data: { name: `离线验收 ${Date.now()}`, description: "合成演示" },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("labflow-project", String(id)),
    project.id,
  );

  await page.goto("/");
  await expect(page.locator(".home")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".home h1")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: artifactPath(test.info(), "../docs/product-audit/after/11-3-home-390.png"), fullPage: true, animations: "disabled" });

  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
  await page.reload();

  await expect(page.getByRole("heading", { name: "无法连接本地服务" })).toBeVisible();
  await expect(page.getByText(/请确认 LabFlow 已经启动/)).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("Failed to fetch");
  expect(body).not.toContain("Java");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: artifactPath(test.info(), "../docs/product-audit/after/11-3-offline-390.png"), fullPage: true, animations: "disabled" });
});
