import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { Dataset } from "../lib/api";
import { defaults, defaultFacet, makeSeries } from "./model";
import { buildPlot } from "./plot";
import { ProfessionalPanel } from "./ProfessionalPanel";

const data: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "synthetic.csv",
  sha256: "demo",
  row_count: 8,
  fields: [
    { name: "model", type: "string", missing: 0 },
    { name: "score", type: "number", missing: 1 },
    { name: "f1", type: "number", missing: 0 },
    { name: "dataset", type: "string", missing: 0 },
  ],
  warnings: [],
  rows: [1, 2, 3, 4, 5, 6, null, 8].map((score, i) => ({
    model: i < 5 ? "A" : "B",
    score,
    f1: i + 10,
    dataset: i < 4 ? "CIFAR" : "SVHN",
  })),
};
describe("professional plots", () => {
  it("uses actual observations and explicit quartile/point options without altering input", () => {
    const c = defaults(data);
    c.type = "box";
    c.series[0].y = "score";
    c.distribution!.quartileMethod = "exclusive";
    const before = JSON.stringify(data),
      plot = buildPlot(c, data);
    expect(plot.traces[0].type).toBe("box");
    expect(plot.traces[0].quartilemethod).toBe("exclusive");
    expect(plot.traces[0].y).toEqual([1, 2, 3, 4, 5, 6, 8]);
    expect(plot.traces[0].error_y).toBeUndefined();
    expect(plot.summaries.map((s) => [s.n, s.missing])).toEqual([
      [5, 0],
      [2, 1],
    ]);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("avoids violin density for sparse or constant categories but preserves real points", () => {
    const c = defaults(data);
    c.type = "violin";
    const plot = buildPlot(c, data);
    expect(plot.traces[0].y).toEqual([1, 2, 3, 4, 5]);
    expect(plot.traces[0].spanmode).toBe("hard");
    expect(plot.traces[1].type).toBe("scatter");
    expect(plot.traces[1].y).toEqual([6, 8]);
    expect(plot.warnings.join()).toContain("仅显示真实观测");
    const constant = buildPlot(c, {
      ...data,
      rows: data.rows.map((r) => ({ ...r, score: 5 })),
    });
    expect(constant.traces.every((t) => t.type === "scatter")).toBe(true);
    c.distribution!.points = "none";
    const hidden = buildPlot(c, data);
    expect(hidden.traces).toHaveLength(1);
    expect(hidden.traces[0].points).toBe(false);
  });
  it("counts log exclusions separately from missing values and keeps categorical X", () => {
    const c = defaults(data);
    c.type = "box";
    c.axes.x.log = true;
    c.axes.y.log = true;
    const plot = buildPlot(c, {
      ...data,
      rows: [
        { model: "A", score: null },
        { model: "A", score: 0 },
        { model: "A", score: 2 },
      ],
    });
    expect(plot.summaries[0]).toMatchObject({ n: 1, missing: 1, excluded: 1 });
    expect(plot.layout.xaxis.type).toBe("category");
  });
  it("routes series into independent domains, shares only requested ranges and preserves titles", () => {
    const c = defaults(data);
    c.series.push(makeSeries("f1", 1));
    c.facet = {
      ...defaultFacet,
      mode: "series",
      shareY: true,
      titles: { [`series:${c.series[0].id}`]: "Accuracy <test>" },
    };
    const plot = buildPlot(c, data);
    expect(plot.panelCount).toBe(2);
    expect(plot.traces.map((t) => t.xaxis)).toEqual(["x", "x2"]);
    expect(plot.layout.yaxis2.matches).toBe("y");
    expect(plot.layout.xaxis.domain[1]).toBeLessThan(
      plot.layout.xaxis2.domain[0],
    );
    expect(plot.layout.annotations[0].text).toBe("(a)  Accuracy &lt;test&gt;");
    expect(buildPlot({ ...c, type: "bar" }, data).layout.annotations).toEqual(
      plot.layout.annotations,
    );
  });
  it("facets by filtered category, and rejects overflow without silently selecting eight groups", () => {
    const c = defaults(data);
    c.facet = { ...defaultFacet, mode: "field", field: "dataset", titles: {} };
    const plot = buildPlot(c, data);
    expect(plot.panelCount).toBe(2);
    expect(plot.traces[0].y).toHaveLength(4);
    c.transforms = [
      { op: "filter", field: "dataset", operator: "eq", value: "CIFAR" },
    ];
    expect(buildPlot(c, data).panelCount).toBe(1);
    c.transforms = [];
    const overflow = buildPlot(c, {
      ...data,
      rows: Array.from({ length: 9 }, (_, i) => ({
        model: "A",
        score: i,
        dataset: String(i),
      })),
    });
    expect(overflow.traces).toHaveLength(0);
    expect(overflow.warnings.join()).toContain("未截断");
  });
  it("reports insufficient canvas space and preserves heatmap settings", () => {
    const c = defaults(data);
    c.facet = {
      ...defaultFacet,
      mode: "field",
      field: "dataset",
      columns: 1,
      titles: {},
    };
    c.style.height = 250;
    expect(buildPlot(c, data).warnings.join()).toContain("空间不足");
    c.type = "heatmap";
    expect(buildPlot(c, data).warnings.join()).toContain("暂使用单图");
  });
  it("limits high-cardinality distribution mapping before expensive rendering", () => {
    const c = defaults(data);
    c.type = "box";
    const plot = buildPlot(c, {
      ...data,
      rows: Array.from({ length: 101 }, (_, i) => ({
        model: String(i),
        score: i,
      })),
    });
    expect(plot.traces).toHaveLength(0);
    expect(plot.warnings.join()).toContain("100 个 X 类别");
  });
  it("fits an eight-row layout within persisted canvas size limits", () => {
    const c = defaults(data);
    c.facet = {
      ...defaultFacet,
      mode: "field",
      field: "dataset",
      columns: 1,
      titles: {},
    };
    const input = {
      ...data,
      rows: Array.from({ length: 8 }, (_, i) => ({
        model: "A",
        score: i,
        dataset: String(i),
      })),
    };
    let next: Partial<typeof c> = {};
    render(
      <ProfessionalPanel
        config={c}
        data={input}
        onChange={(value) => {
          next = value;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "适配多子图画布" }));
    expect(next.style!.height).toBe(2400);
    expect(buildPlot({ ...c, ...next }, input).panelCount).toBe(8);
  });
  it("edits distribution and subplot settings together without losing them on type switches", () => {
    function Harness() {
      const [c, set] = useState({ ...defaults(data), type: "violin" as const });
      return (
        <>
          <ProfessionalPanel
            config={c}
            data={data}
            onChange={(v) => set((old) => ({ ...old, ...v }) as typeof old)}
          />
          <output>{JSON.stringify(c)}</output>
        </>
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("密度带宽"), {
      target: { value: "0.3" },
    });
    fireEvent.change(screen.getByLabelText("分面方式"), {
      target: { value: "field" },
    });
    fireEvent.change(screen.getByLabelText("分面字段"), {
      target: { value: "dataset" },
    });
    fireEvent.change(screen.getByLabelText("子图 a 标题"), {
      target: { value: "Dataset A" },
    });
    const saved = JSON.parse(screen.getByRole("status").textContent!);
    expect(saved.distribution.bandwidth).toBe("0.3");
    expect(saved.facet.titles['field:dataset:"CIFAR"']).toBe("Dataset A");
  });
});
