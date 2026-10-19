// All observations are synthetic; all data and figures use the real local Java API.
import fs from "node:fs/promises";
const base = process.env.LABFLOW_API || "http://127.0.0.1:8086/api";
async function api(path, body) {
  const response = await fetch(
    base + path,
    body instanceof FormData
      ? { method: "POST", body }
      : body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  return data;
}
const name = "重复实验汇总 · 合成演示";
const existing = (await api("/projects")).find((p) => p.name === name);
if (existing) {
  console.log(
    `Synthetic processing demo already exists: project ${existing.id}`,
  );
  process.exit(0);
}
const p = await api("/projects", {
  name,
  description:
    "人工合成的逐 seed、逐 epoch 观测，用于演示分组均值、SD/SEM 和缺失区间。不代表模型实验结论。",
});
const file = "synthetic-grouped-runs.csv",
  form = new FormData();
form.append(
  "file",
  new Blob([await fs.readFile(new URL("../samples/" + file, import.meta.url))]),
  file,
);
const raw = await api(`/projects/${p.id}/datasets`, form);
const rules = {
  schema_version: 1,
  mode: "aggregate",
  groupBy: ["model", "epoch"],
  metrics: ["accuracy"],
  filters: [],
  sort: [
    { field: "model", direction: "asc" },
    { field: "epoch", direction: "asc" },
  ],
  missingGroup: "include",
  error: "sd",
  observationUnit: "同一模型、epoch 下独立 seed 的一次运行（合成）",
  replicate: "seed",
  x: "epoch",
  group: "model",
  display: "bars",
};
for (const [error, display] of [
  ["sd", "bars"],
  ["sem", "band"],
]) {
  const dataset = await api(`/projects/${p.id}/data/${raw.id}/process`, {
    name: `Grouped means ${error.toUpperCase()} · synthetic`,
    rules: { ...rules, error, display },
  });
  const stat = dataset.source_meta.statistics[0],
    c = JSON.parse(
      await fs.readFile(
        new URL("../docs/config-v1.example.json", import.meta.url),
        "utf8",
      ),
    );
  c.datasetVersionId = dataset.id;
  c.x = "epoch";
  c.group = "model";
  c.series = [
    {
      ...c.series[0],
      id: `mean-${error}`,
      y: stat.columns.mean,
      name: `Accuracy · mean ± ${error.toUpperCase()}`,
      error: display === "bars" ? stat.columns[error] : "",
      ...(display === "band"
        ? {
            band: {
              enabled: true,
              lower: stat.columns.lower,
              upper: stat.columns.upper,
              opacity: 0.18,
              label: "Mean ± SEM · synthetic observations",
            },
          }
        : {}),
    },
  ];
  c.style.title = `Repeated runs · mean ± ${error.toUpperCase()} (synthetic)`;
  c.axes.x.title = "Training epoch";
  c.axes.y.title = "Accuracy";
  c.axes.y.min = "0.5";
  c.axes.y.max = "1";
  await api(`/projects/${p.id}/charts`, {
    name: `均值与 ${error.toUpperCase()} · 合成演示`,
    config: c,
  });
}
console.log(
  `Created synthetic processing demo: project ${p.id}, 17 source rows, 2 derived datasets and figures.`,
);
