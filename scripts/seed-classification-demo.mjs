// Explicit synthetic predictions. No training, external service or generated curves.
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
const name = "分类评估与共同样本 · 合成演示";
const existing = (await api("/projects")).find((p) => p.name === name);
if (existing) {
  console.log(
    `Synthetic classification demo already exists: project ${existing.id}`,
  );
  process.exit(0);
}
const p = await api("/projects", {
  name,
  description:
    "三类人工合成预测与二分类分数，演示缺失、计数/归一化和共同样本比较，不代表真实模型结果。",
});
async function upload(file) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([
      await fs.readFile(new URL("../samples/" + file, import.meta.url)),
    ]),
    file,
  );
  return api(`/projects/${p.id}/datasets`, form);
}
const data = await upload("synthetic-multiclass.csv"),
  binary = await upload("synthetic-classification.csv");
const template = JSON.parse(
  await fs.readFile(
    new URL("../docs/config-v1.example.json", import.meta.url),
    "utf8",
  ),
);
const c = structuredClone(template);
c.type = "confusion";
c.datasetVersionId = data.id;
c.series = [
  ["model_a", "Model A"],
  ["model_b", "Model B"],
].map(([prediction, name], i) => ({
  ...c.series[0],
  id: `model-${i}`,
  prediction,
  name,
  y: "sample_id",
  error: "",
}));
c.classification = {
  algorithm: "classification-v1",
  label: "truth",
  input: "labels",
  classes: ["cat", "dog", "bird"],
  positive: "1",
  threshold: 0.5,
  normalization: "count",
  seriesId: "model-0",
  groupValue: "",
  xTitle: "Predicted class",
  yTitle: "True class",
};
c.sampling = { policy: "independent", id: "sample_id" };
c.style.title = "Multiclass predictions · synthetic samples";
c.style.right = 85;
await api(`/projects/${p.id}/charts`, {
  name: "多分类计数 · 合成演示",
  config: c,
});
c.classification.normalization = "true";
c.sampling.policy = "intersection";
c.style.title = "Common samples · row-normalized confusion";
await api(`/projects/${p.id}/charts`, {
  name: "共同样本混淆矩阵 · 合成演示",
  config: c,
});
const roc = structuredClone(template);
roc.type = "roc";
roc.datasetVersionId = binary.id;
roc.series = [
  ["model_a_score", "Model A", "#0072b2"],
  ["model_b_score", "Model B", "#d55e00"],
].map(([y, name, color], i) => ({
  ...roc.series[0],
  id: `ranking-${i}`,
  y,
  name,
  color,
  error: "",
  size: 4,
}));
roc.evaluation = {
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
roc.sampling = { policy: "intersection", id: "sample_id" };
roc.style.title = "Common-sample ROC · synthetic scores";
await api(`/projects/${p.id}/charts`, {
  name: "共同样本 ROC · 合成演示",
  config: roc,
});
console.log(
  `Created synthetic classification demo: project ${p.id}, 2 datasets and 3 figures.`,
);
