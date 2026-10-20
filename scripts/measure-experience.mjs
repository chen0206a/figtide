import {
  chromium,
  expect,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
// Run from the repository root, against a production Vite preview on port 5186.
const label = process.argv[2] || "after",
  base = process.env.LABFLOW_PROFILE_URL || "http://127.0.0.1:5186",
  apiBase = "http://127.0.0.1:8086/api";
if (!/^[a-z0-9-]+$/i.test(label))
  throw new Error("Use a simple alphanumeric measurement label.");
async function api(url, body) {
  const r = await fetch(
    apiBase + url,
    body
      ? {
          method: "POST",
          ...(body instanceof FormData
            ? { body }
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }),
        }
      : {},
  );
  const value = await r.json();
  if (!r.ok) throw new Error(value.message);
  return value;
}
let fixture;
try {
  fixture = JSON.parse(await fs.readFile(".runtime/ux-fixture.json", "utf8"));
} catch {
  const project = await api("/projects", {
    name: "前端体验测量 · 合成数据",
    description: "仅用于前端性能与布局验收，未训练模型。",
  });
  async function upload(name, rows) {
    const f = new FormData();
    f.append("file", new Blob([rows]), name);
    return api(`/projects/${project.id}/datasets`, f);
  }
  const graph = await upload(
    "synthetic-render.csv",
    "epoch,accuracy,loss,model\n" +
      Array.from(
        { length: 1200 },
        (_, i) =>
          `${i + 1},${(0.6 + 0.35 * (1 - Math.exp(-i / 300))).toFixed(6)},${(0.9 * Math.exp(-i / 300) + 0.1).toFixed(6)},A`,
      ).join("\n"),
  );
  const table = await upload(
    "synthetic-table.csv",
    "step,accuracy,loss,group,seed,a,b,c\n" +
      Array.from(
        { length: 10000 },
        (_, i) =>
          `${i + 1},${(0.8 + (i % 100) / 1000).toFixed(3)},0.2,cohort-${i % 2 ? "B" : "A"},${i % 10},${i % 80},${i % 40},${i % 20}`,
      ).join("\n"),
  );
  const c = JSON.parse(
    await fs.readFile("docs/config-v1.example.json", "utf8"),
  );
  c.datasetVersionId = graph.id;
  c.series[0].error = "";
  c.style.title = "Synthetic performance check";
  const chart = await api(`/projects/${project.id}/charts`, {
    name: "前端性能基线图（合成）",
    config: c,
  });
  fixture = {
    project: project.id,
    chart: chart.id,
    graph: graph.id,
    table: table.id,
  };
  await fs.writeFile(".runtime/ux-fixture.json", JSON.stringify(fixture));
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const browserVersion = browser.version();
const runs = [];
for (let trial = 0; trial < 3; trial++) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript((id) => {
    localStorage.setItem("labflow-project", String(id));
    sessionStorage.setItem("labflow-intro-v2", "seen");
    window.uxMetrics = { writes: 0, lags: [], draws: 0 };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("labflow-draft-v1:")) window.uxMetrics.writes++;
      return original.call(this, k, v);
    };
    document.addEventListener(
      "input",
      (e) => {
        if (e.target.getAttribute("aria-label") === "图表标题") {
          const at = performance.now();
          requestAnimationFrame(() =>
            window.uxMetrics.lags.push(performance.now() - at),
          );
        }
      },
      true,
    );
  }, fixture.project);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 2 });
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await p.goto(base);
  await expect(
    p
      .getByRole("button", { name: "前端性能基线图（合成）", exact: false })
      .first(),
  ).toBeVisible();
  const homeNodes = await p.locator("*").count();
  if (trial === 0)
    await p.screenshot({
      path: `.runtime/ux-${label}-home.png`,
      fullPage: true,
    });
  const start = performance.now();
  await p
    .getByRole("button", { name: "前端性能基线图（合成）", exact: false })
    .first()
    .click();
  await expect
    .poll(() => p.getByTestId("plot").evaluate((el) => el.data?.[0]?.x?.length))
    .toBe(1200);
  const coldMs = performance.now() - start;
  await p.getByLabel("图表标题", { exact: true }).fill("");
  await expect
    .poll(() => p.getByTestId("plot").evaluate((el) => el.layout?.title?.text))
    .toBe("");
  await p.getByTestId("plot").evaluate((el) => {
    el.on("plotly_afterplot", () => window.uxMetrics.draws++);
    window.uxMetrics.writes = 0;
    window.uxMetrics.lags = [];
  });
  const text = "Responsive chart typography";
  const typeAt = performance.now();
  await p
    .getByLabel("图表标题", { exact: true })
    .pressSequentially(text, { delay: 8 });
  const inputMs = performance.now() - typeAt;
  await expect
    .poll(() => p.getByTestId("plot").evaluate((el) => el.layout?.title?.text))
    .toBe(text);
  await expect
    .poll(() =>
      p.evaluate(
        ({ project, chart }) =>
          JSON.parse(
            localStorage.getItem(`labflow-draft-v1:${project}:${chart}`) ||
              "null",
          )?.config?.style?.title,
        fixture,
      ),
    )
    .toBe(text);
  const m = await p.evaluate(() => window.uxMetrics);
  const lag = m.lags.sort((a, b) => a - b);
  if (trial === 0) {
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.screenshot({
      path: `.runtime/ux-${label}-editor.png`,
      fullPage: true,
    });
  }
  const tablePage = await ctx.newPage();
  await tablePage.goto(base);
  await tablePage
    .getByRole("button", { name: "数据管理", exact: true })
    .click();
  await expect(tablePage.getByLabel("搜索数据")).toBeVisible();
  const filterAt = performance.now();
  await tablePage
    .getByLabel("搜索数据")
    .pressSequentially("cohort-B", { delay: 8 });
  await expect(tablePage.locator(".table-footer")).toContainText(
    "5000 / 10000",
  );
  const filterMs = performance.now() - filterAt;
  runs.push({
    homeNodes,
    coldEditorMs: Math.round(coldMs),
    typingMs: Math.round(inputMs),
    inputFrameP95Ms: Math.round(lag[Math.floor(lag.length * 0.95)] || 0),
    plotDraws: m.draws,
    draftWrites: m.writes,
    tableFilterMs: Math.round(filterMs),
  });
  await ctx.close();
}
await browser.close();
const assets = [];
for (const name of await fs.readdir("frontend/dist/assets"))
  if (name.endsWith(".js")) {
    const buffer = await fs.readFile(path.join("frontend/dist/assets", name));
    assets.push({
      name,
      bytes: buffer.length,
      gzipBytes: gzipSync(buffer).length,
    });
  }
const result = {
  label,
  browserVersion,
  viewport: { width: 1440, height: 900 },
  chartPageCacheDisabled: true,
  tablePageCpuThrottle: 1,
  cpuThrottle: 2,
  rows: 1200,
  tableRows: 10000,
  runs,
  assets: assets.sort((a, b) => b.bytes - a.bytes),
};
await fs.writeFile(
  `.runtime/ux-${label}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({ ...result, assets: result.assets.slice(0, 4) }, null, 2),
);
