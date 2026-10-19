// Synthetic observations, explicit fields; no training or external AI service.
import fs from "node:fs/promises";
const base = process.env.LABFLOW_API || "http://127.0.0.1:8086/api";
async function api(path, body, method = body ? "POST" : "GET") {
  const response = await fetch(base + path, {
    method,
    ...(body instanceof FormData
      ? { body }
      : body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message);
  return result;
}
const name = "成果复用与交付 · 合成演示";
const existing = (await api("/projects")).find((p) => p.name === name);
if (existing) {
  console.log(`Synthetic delivery demo already exists: project ${existing.id}`);
  process.exit(0);
}
const p = await api("/projects", {
  name,
  description:
    "两份人工合成学习曲线，仅演示外观复用、字段重映射、图表历史、项目备份及矢量输出，不代表真实模型训练。",
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
const a = await upload("synthetic-reuse-source.csv"),
  b = await upload("synthetic-reuse-target.csv");
const c = JSON.parse(
  await fs.readFile(
    new URL("../docs/config-v1.example.json", import.meta.url),
    "utf8",
  ),
);
c.datasetVersionId = a.id;
c.x = "epoch";
c.heatY = "epoch";
c.heatZ = "accuracy";
c.series[0].error = "";
c.series[0].color = "#6357c8";
c.series[0].name = "Model α · synthetic";
c.style.font = "Noto Sans SC";
c.style.title = "合成实验 · Model α";
c.publication = { enabled: true, widthMm: 89, fontPt: 8, dpi: 300 };
const chart = await api(`/projects/${p.id}/charts`, {
  name: "Model α · 原始图版（合成）",
  config: c,
});
c.style.left = 85;
await api(
  `/projects/${p.id}/charts/${chart.id}`,
  { name: chart.name, revision: chart.revision, config: c },
  "PUT",
);
await api(`/projects/${p.id}/style-templates`, {
  name: "单栏论文图 · 89 mm",
  config: c,
});
const copy = structuredClone(c);
copy.datasetVersionId = b.id;
copy.x = "step";
copy.heatY = "step";
copy.heatZ = "validation_accuracy";
copy.series[0].y = "validation_accuracy";
copy.series[0].name = "Model β · synthetic";
copy.style.title = "合成实验 · Model β";
copy.axes.x.title = "Step";
copy.axes.y.title = "Validation accuracy";
await api(`/projects/${p.id}/charts`, {
  name: "Model β · 显式映射副本（合成）",
  config: copy,
});
for (const [label, id, accuracy] of [
  ["Model α", a.id, 0.86],
  ["Model β", b.id, 0.9],
])
  await api(`/projects/${p.id}/experiments`, {
    name: `${label} · 合成记录`,
    status: "completed",
    parameters: { purpose: "synthetic delivery demo" },
    metrics: { accuracy },
    notes:
      "人工合成数值，未进行模型训练。关联固定数据版本；仅展示记录与交付工作流。",
    tags: ["synthetic"],
    dataset_version_ids: [id],
  });
console.log(
  `Synthetic delivery demo created: project ${p.id}; 2 datasets, 2 charts (3 snapshots), 2 experiments, 1 style template.`,
);
