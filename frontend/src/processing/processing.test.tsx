import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaults } from "../editor/model";
import { buildPlot } from "../editor/plot";
import { initialRules, ProcessingDialog } from "./ProcessingDialog";
import type { Dataset, ProcessingSource } from "../lib/api";
const raw: Dataset = {
  id: 10,
  dataset_id: 10,
  version: 1,
  filename: "synthetic.csv",
  sha256: "demo",
  row_count: 3,
  warnings: [],
  fields: [
    { name: "epoch", type: "number", missing: 0 },
    { name: "seed", type: "number", missing: 0 },
    { name: "accuracy", type: "number", missing: 0 },
  ],
  rows: [1, 2, 3].map((accuracy, i) => ({ epoch: 1, seed: i, accuracy })),
};
const columns = {
  total: "accuracy__total",
  n: "accuracy__n",
  missing: "accuracy__missing",
  mean: "accuracy__mean",
  sd: "accuracy__sd",
  sem: "accuracy__sem",
  lower: "accuracy__lower",
  upper: "accuracy__upper",
};
function derived(): Dataset {
  const source: ProcessingSource = {
    schema_version: 1,
    kind: "data_processing",
    algorithm: "group-summary-v1",
    created_at: "2026-10-19T00:00:00Z",
    source: {
      datasetVersionId: 10,
      datasetId: 10,
      version: 1,
      filename: raw.filename,
      sha256: raw.sha256,
    },
    rules: {
      ...initialRules(raw),
      groupBy: ["epoch"],
      x: "epoch",
      error: "sem",
      observationUnit: "seed",
      display: "bars",
    },
    statistics: [{ metric: "accuracy", columns }],
    counts: {
      source_rows: 3,
      filtered_rows: 3,
      excluded_rows: 0,
      output_rows: 1,
      groups: 1,
      missing_group_rows: 0,
    },
  };
  return {
    ...raw,
    id: 11,
    dataset_id: 11,
    filename: "summary.csv",
    row_count: 1,
    fields: [
      { name: "epoch", type: "number", missing: 0, role: "x" },
      ...Object.values(columns).map((name) => ({
        name,
        type: "number" as const,
        missing: 0,
        role: name === columns.mean ? ("y" as const) : ("none" as const),
      })),
    ],
    rows: [
      {
        epoch: 1,
        accuracy__mean: 2,
        accuracy__sem: 1 / Math.sqrt(3),
        accuracy__sd: 1,
        accuracy__lower: 2 - 1 / Math.sqrt(3),
        accuracy__upper: 2 + 1 / Math.sqrt(3),
        accuracy__n: 3,
      },
    ],
    source_meta: source,
  };
}
afterEach(() => vi.restoreAllMocks());
describe("processing and chart contracts", () => {
  it("facets remaining experimental conditions and refuses to join unmapped groups", () => {
    const d = derived(),
      s = d.source_meta as ProcessingSource;
    s.rules.groupBy = ["epoch", "dataset"];
    d.fields.push({ name: "dataset", type: "string", missing: 0 });
    d.rows = [
      { ...d.rows[0], dataset: "D1" },
      { ...d.rows[0], dataset: "D2" },
    ];
    const c = defaults(d);
    c.style.width = 1120;
    expect(c.facet).toMatchObject({ mode: "field", field: "dataset" });
    expect(buildPlot(c, d).panelCount).toBe(2);
    c.facet!.mode = "none";
    expect(buildPlot(c, d).traces).toHaveLength(0);
    expect(buildPlot(c, d).warnings.join()).toContain("不同实验条件");
    c.transforms = [
      { op: "filter", field: "dataset", operator: "eq", value: "D1" },
    ];
    expect(buildPlot(c, d).traces).toHaveLength(1);
  });
  it("maps multiple metric means to their own errors without selecting sample counts", () => {
    const d = derived(),
      s = d.source_meta as ProcessingSource;
    const loss = { ...columns };
    for (const k of Object.keys(loss) as (keyof typeof columns)[])
      loss[k] = columns[k].replace("accuracy", "loss");
    s.statistics.push({ metric: "loss", columns: loss });
    d.fields.push(
      { name: loss.mean, type: "number", missing: 0, role: "y" },
      { name: loss.sem, type: "number", missing: 0 },
    );
    d.rows[0][loss.mean] = 0.2;
    d.rows[0][loss.sem] = 0.03;
    expect(defaults(d).series.map((s) => [s.y, s.error])).toEqual([
      [columns.mean, columns.sem],
      [loss.mean, loss.sem],
    ]);
  });
  it("maps mean and chosen SEM independently from count and SD fields", () => {
    const d = derived(),
      c = defaults(d);
    expect(c.series).toHaveLength(1);
    expect(c.series[0]).toMatchObject({
      y: columns.mean,
      error: columns.sem,
      name: "accuracy · mean ± SEM",
    });
    expect(c.axes.x.title).toBe("Epoch");
    expect(c.style.title).toBe("Grouped means ± SEM");
    expect(buildPlot(c, d).traces[0].error_y.array).toEqual([1 / Math.sqrt(3)]);
  });
  it("maps actual computed interval fields and leaves sort-only data separate from experiment comparison", () => {
    const d = derived(),
      s = d.source_meta as ProcessingSource;
    s.rules.display = "band";
    const c = defaults(d);
    expect(c.series[0].band).toMatchObject({
      enabled: true,
      lower: columns.lower,
      upper: columns.upper,
    });
    expect(c.series[0].error).toBe("");
    s.rules.mode = "sort";
    expect(defaults(d).style.title).toBe("Model performance");
  });
  it("previews rules, invalidates changed settings and only submits original rule instructions", async () => {
    const d = derived(),
      s = d.source_meta as ProcessingSource;
    const preview = {
      fields: d.fields,
      rows: d.rows,
      row_count: 1,
      warnings: ["n < 2 保持缺失"],
      statistics: s.statistics,
      counts: s.counts,
      rules: s.rules,
      source: s.source,
    };
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(preview), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(preview), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(d), { status: 200 }));
    const saved = vi.fn();
    render(
      <ProcessingDialog
        project={1}
        data={raw}
        onClose={() => {}}
        onSaved={saved}
      />,
    );
    expect(screen.getByRole("button", { name: "预览处理结果" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("每行代表的观测单位"), {
      target: { value: "独立 seed" },
    });
    fireEvent.click(screen.getByLabelText("分组字段 epoch"));
    fireEvent.click(screen.getByRole("button", { name: "预览处理结果" }));
    await screen.findByText(/源数据 3 行 → 结果 1 行/);
    expect(screen.getByRole("button", { name: "保存并绘图" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("误差口径"), {
      target: { value: "sem" },
    });
    expect(screen.queryByLabelText("处理结果预览")).toBeNull();
    expect(screen.getByRole("button", { name: "保存并绘图" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "预览处理结果" }));
    await screen.findByLabelText("处理结果预览");
    fireEvent.click(screen.getByRole("button", { name: "保存并绘图" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(d, true));
    expect(fetch.mock.calls[2][0]).toBe("/api/projects/1/data/10/process");
    const body = JSON.parse(fetch.mock.calls[2][1]!.body as string);
    expect(body.rules).toMatchObject({
      groupBy: ["epoch"],
      metrics: ["accuracy"],
      error: "sem",
      observationUnit: "独立 seed",
    });
    expect(body.rows).toBeUndefined();
  });
  it("displays parser/service errors without enabling save", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "重复标识不唯一" }), {
        status: 400,
      }),
    );
    render(
      <ProcessingDialog
        project={1}
        data={raw}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("每行代表的观测单位"), {
      target: { value: "seed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览处理结果" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "重复标识不唯一",
    );
    expect(screen.getByRole("button", { name: "保存并绘图" })).toBeDisabled();
  });
});
