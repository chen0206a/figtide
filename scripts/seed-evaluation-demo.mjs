// Explicit synthetic data; use only the project's own local Java API and MySQL.
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
const name = "模型评估与区间 · 合成演示";
const existing = (await api("/projects")).find((p) => p.name === name);
if (existing) {
  console.log(
    `Synthetic evaluation demo already exists: project ${existing.id}`,
  );
  process.exit(0);
}
const p = await api("/projects", {
  name,
  description:
    "人工合成标签、预测分数与上下界。只用于软件演示，不作为实验结论。",
});
async function upload(filename) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([
      await fs.readFile(new URL("../samples/" + filename, import.meta.url)),
    ]),
    filename,
  );
  return api(`/projects/${p.id}/datasets`, form);
}
const classification = await upload("synthetic-classification.csv"),
  bounds = await upload("synthetic-intervals.csv");
const c = JSON.parse(
  await fs.readFile(
    new URL("../docs/config-v1.example.json", import.meta.url),
    "utf8",
  ),
);
c.datasetVersionId = classification.id;
c.type = "roc";
c.x = "sample_id";
c.series = [
  ["model_a_score", "Model A", "#0072b2"],
  ["model_b_score", "Model B", "#d55e00"],
].map(([y, name, color], i) => ({
  ...c.series[0],
  id: `evaluation-${i}`,
  y,
  name,
  color,
  error: "",
  size: 4,
}));
c.evaluation = {
  algorithm: "binary-ranking-v1",
  missing: "exclude",
  label: "label",
  positive: "1",
  threshold: 0.5,
  baseline: true,
  rocXTitle: "",
  rocYTitle: "",
  prXTitle: "",
  prYTitle: "",
};
c.style.title = "Binary classification · synthetic samples";
c.style.preset = "Okabe–Ito";
c.axes.x.grid = true;
await api(`/projects/${p.id}/charts`, { name: "ROC · 合成演示", config: c });
c.type = "pr";
await api(`/projects/${p.id}/charts`, { name: "PR · 合成演示", config: c });
c.type = "line";
c.datasetVersionId = bounds.id;
c.x = "epoch";
c.axes.x.title = "Training epoch";
c.axes.y.title = "Accuracy";
c.axes.y.min = "0.4";
c.axes.y.max = "1";
c.style.title = "Learning dynamics · supplied synthetic intervals";
c.series = [
  {
    ...c.series[0],
    y: "accuracy",
    name: "Accuracy",
    band: {
      enabled: true,
      lower: "lower",
      upper: "upper",
      opacity: 0.18,
      label: "Supplied bounds · no confidence claim",
    },
  },
];
await api(`/projects/${p.id}/charts`, {
  name: "实际区间带 · 合成演示",
  config: c,
});
console.log(`Created synthetic evaluation demo: project ${p.id}, 3 figures.`);
