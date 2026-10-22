import { describe, it, expect } from "vitest";
import type { Dataset } from "../lib/api";
import {
  defaults,
  defaultClassification,
  defaultEvaluation,
  makeSeries,
  type Config,
} from "./model";
import { buildPlot } from "./plot";
import { groupEncoding, integerAxisStep } from "./encoding";
import { stylePresets } from "./stylePresets";
import { palettes, defaultFacet } from "./model";

const grouped: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "synthetic-grouped.csv",
  sha256: "demo",
  row_count: 6,
  warnings: [],
  fields: [
    { name: "epoch", type: "number", missing: 0 },
    { name: "model", type: "string", missing: 0 },
    { name: "accuracy", type: "number", missing: 0 },
    { name: "loss", type: "number", missing: 0 },
  ],
  rows: [
    { epoch: 1, model: "Baseline", accuracy: 0.65, loss: 0.9 },
    { epoch: 2, model: "Baseline", accuracy: 0.8, loss: 0.6 },
    { epoch: 3, model: "Baseline", accuracy: 0.86, loss: 0.5 },
    { epoch: 1, model: "Method A", accuracy: 0.72, loss: 0.8 },
    { epoch: 2, model: "Method A", accuracy: 0.86, loss: 0.5 },
    { epoch: 3, model: "Method A", accuracy: 0.92, loss: 0.4 },
  ],
};
function groupedLine(): Config {
  const c = defaults(grouped);
  return {
    ...c,
    type: "line",
    x: "epoch",
    group: "model",
    series: [{ ...makeSeries("accuracy"), name: "Accuracy · mean ± SEM" }],
  };
}
const legendTraces = (traces: any[]) =>
  traces.filter((t) => t.showlegend !== false);

describe("grouped series encoding", () => {
  it("uses one palette source for fresh series and preserves explicitly saved colors", () => {
    for (const preset of stylePresets)
      expect(palettes[preset.key]).toBe(preset.colors);
    expect(makeSeries("accuracy").color).toBe("#3568b5");
    const c = groupedLine();
    c.group = "";
    c.series[0].color = "#6758ce";
    expect(buildPlot(c, grouped).traces[0].line.color).toBe("#6758ce");
  });
  it("keeps group colors and series line styles consistent across facets", () => {
    const c = groupedLine();
    c.series.push(makeSeries("loss", 1));
    c.style.width = 1120;
    const expected = legendTraces(buildPlot(c, grouped).traces);
    for (const facet of [
      { ...defaultFacet, mode: "series" as const },
      { ...defaultFacet, mode: "field" as const, field: "model" },
    ]) {
      const actual = legendTraces(buildPlot({ ...c, facet }, grouped).traces);
      for (const trace of actual) {
        const source = expected.find(
          (t) => t.legendgroup === trace.legendgroup,
        );
        expect(source).toBeDefined();
        expect(trace.name).toBe(source.name);
        expect(trace.line.color).toBe(source.line.color);
        expect(trace.line.dash).toBe(source.line.dash);
      }
    }
  });
  it("gives every group of a single series its own color", () => {
    const p = buildPlot(groupedLine(), grouped);
    const [a, b] = legendTraces(p.traces);
    expect(a.line.color).not.toBe(b.line.color);
    expect(a.marker.color).toBe(a.line.color);
    expect(b.marker.color).toBe(b.line.color);
  });
  it("keeps the user's series color for the first group", () => {
    const c = groupedLine();
    c.series[0].color = "#123456";
    const [first] = legendTraces(buildPlot(c, grouped).traces);
    expect(first.line.color).toBe("#123456");
  });
  it("names grouped traces by group only, without an inline legend title", () => {
    const p = buildPlot(groupedLine(), grouped);
    expect(legendTraces(p.traces).map((t) => t.name)).toEqual([
      "Baseline",
      "Method A",
    ]);
    expect(p.layout.legend.title).toBeUndefined();
  });
  it("uses color for group and dash for series when several series are grouped", () => {
    const c = groupedLine();
    c.series = [makeSeries("accuracy"), makeSeries("loss", 1)];
    const traces = legendTraces(buildPlot(c, grouped).traces);
    expect(traces.map((t) => t.name)).toEqual([
      "accuracy · Baseline",
      "accuracy · Method A",
      "loss · Baseline",
      "loss · Method A",
    ]);
    expect(traces[0].line.color).toBe(traces[2].line.color);
    expect(traces[0].line.color).not.toBe(traces[1].line.color);
    expect(traces[0].line.dash).not.toBe(traces[2].line.dash);
    expect(buildPlot(c, grouped).layout.legend.title).toBeUndefined();
  });
  it("leaves ungrouped series untouched", () => {
    const c = groupedLine();
    c.group = "";
    const s = c.series[0];
    expect(groupEncoding(c, s, 0, 1)).toEqual({
      color: s.color,
      dash: s.dash,
      symbol: s.symbol,
    });
    const p = buildPlot(c, grouped);
    expect(p.traces[0].name).toBe("Accuracy · mean ± SEM");
    expect(p.layout.legend.title).toBeUndefined();
  });
});

describe("integer x axis ticks", () => {
  it("steps by one on short integer axes", () => {
    expect(integerAxisStep([1, 2, 3])).toBe(1);
    expect(buildPlot(groupedLine(), grouped).layout.xaxis.dtick).toBe(1);
    expect(
      integerAxisStep(Array.from({ length: 160000 }, (_, i) => i % 3)),
    ).toBe(1);
  });
  it("leaves long, fractional or user-set axes to Plotly", () => {
    expect(integerAxisStep([0, 60])).toBeUndefined();
    expect(integerAxisStep([0.5, 1, 1.5])).toBeUndefined();
    expect(integerAxisStep(["a", "b"])).toBeUndefined();
    const c = groupedLine();
    c.axes.x.dtick = "0.5";
    expect(buildPlot(c, grouped).layout.xaxis.dtick).toBe(0.5);
  });
});

describe("confusion matrix layout", () => {
  const rows = [
    ["A", "A"],
    ["A", "B"],
    ["B", "B"],
    ["B", "B"],
    ["C", "C"],
    ["C", "A"],
  ].map(([truth, a], i) => ({ id: i + 1, truth, a }));
  const data: Dataset = {
    id: 1,
    dataset_id: 1,
    version: 1,
    filename: "synthetic-classes.csv",
    sha256: "demo",
    row_count: rows.length,
    warnings: [],
    fields: [
      { name: "id", type: "number", missing: 0 },
      { name: "truth", type: "string", missing: 0 },
      { name: "a", type: "string", missing: 0 },
    ],
    rows,
  };
  function confusion(): Config {
    return {
      ...defaults(data),
      type: "confusion",
      series: [{ ...makeSeries("id"), name: "Model A", prediction: "a" }],
      classification: {
        ...defaultClassification,
        label: "truth",
        classes: ["A", "B", "C"],
      },
    };
  }
  it("anchors the subtitle above the cells and reserves top margin for it", () => {
    const c = confusion();
    const p = buildPlot(c, data);
    const subtitle = p.layout.annotations.find((a: any) =>
      String(a.text).includes("n=6"),
    );
    expect(subtitle).toMatchObject({ yref: "paper", y: 1, yanchor: "bottom" });
    const plain = buildPlot(
      { ...c, type: "line", x: "id", legend: { ...c.legend, show: false } },
      data,
    );
    expect(p.layout.margin.t).toBeGreaterThan(plain.layout.margin.t);
  });
  it("draws square, single-hue cells separated by hairlines", () => {
    const p = buildPlot(confusion(), data);
    expect(p.layout.yaxis).toMatchObject({ scaleanchor: "x", scaleratio: 1 });
    expect(p.traces[0].marker.colorscale[0][1]).toBe("#f7fbff");
    expect(p.layout.shapes.every((s: any) => s.line.width === 2)).toBe(true);
    const fills = new Set(p.layout.shapes.map((s: any) => s.fillcolor));
    expect([...fills].every((f) => !String(f).startsWith("#44015"))).toBe(true);
  });
  it("omits the implicit all-samples group from the subtitle", () => {
    const p = buildPlot(confusion(), data);
    const texts = p.layout.annotations.map((a: any) => String(a.text));
    expect(texts).toContain("Model A · n=6");
    expect(texts.some((t: string) => t.includes("全部"))).toBe(false);
  });
  it("does not reserve a legend band when nothing is in the legend", () => {
    const c = confusion();
    const p = buildPlot(c, data);
    expect(p.layout.showlegend).toBe(false);
    expect(p.layout.margin.t).toBe(
      Math.max(c.style.top, c.style.fontSize * 2 + 24) + c.style.fontSize + 14,
    );
  });
  it("also removes the unused legend band from ordinary heatmaps", () => {
    const c = {
      ...confusion(),
      type: "heatmap" as const,
      x: "truth",
      heatY: "a",
      heatZ: "id",
    };
    const unique = {
      ...data,
      rows: [
        { truth: "A", a: "A", id: 1 },
        { truth: "B", a: "B", id: 2 },
      ],
    };
    const p = buildPlot(c, unique);
    expect(p.layout.showlegend).toBe(false);
    expect(p.layout.margin.t).toBe(
      Math.max(c.style.top, c.style.fontSize * 2 + 24),
    );
    expect(p.layout.margin.t).toBe(
      buildPlot({ ...c, legend: { ...c.legend, show: false } }, unique).layout
        .margin.t,
    );
  });
  it("uses integer colorbar ticks for counts and percentages for shares", () => {
    const c = confusion();
    const counts = buildPlot(c, data).traces[0].marker.colorbar;
    expect(counts.tickformat).toBe("d");
    expect(Number.isInteger(counts.dtick)).toBe(true);
    expect(counts.title.text).toBe("Count");
    c.classification!.normalization = "true";
    expect(buildPlot(c, data).traces[0].marker.colorbar.tickformat).toBe(".0%");
  });
});

describe("evaluation legend metric", () => {
  const data: Dataset = {
    id: 1,
    dataset_id: 1,
    version: 1,
    filename: "synthetic-evaluation.csv",
    sha256: "demo",
    row_count: 4,
    warnings: [],
    fields: [
      { name: "label", type: "string", missing: 0 },
      { name: "score", type: "number", missing: 0 },
    ],
    rows: [0.1, 0.4, 0.35, 0.8].map((score, i) => ({
      label: i < 2 ? "neg" : "pos",
      score,
    })),
  };
  function roc(legendMetric?: boolean): Config {
    const evaluation = {
      ...defaultEvaluation,
      label: "label",
      positive: "pos",
    };
    if (legendMetric === undefined) delete evaluation.legendMetric;
    else evaluation.legendMetric = legendMetric;
    return {
      ...defaults(data),
      type: "roc",
      series: [{ ...makeSeries("score"), name: "Model A" }],
      evaluation,
    };
  }
  it("appends AUC for new charts and AP for PR curves", () => {
    expect(buildPlot(roc(true), data).traces[0].name).toBe(
      "Model A (AUC = 0.750)",
    );
    const pr = roc(true);
    pr.type = "pr";
    expect(buildPlot(pr, data).traces[0].name).toMatch(
      /^Model A \(AP = 0\.83\d\)$/,
    );
  });
  it("keeps charts saved without the option unchanged", () => {
    expect(buildPlot(roc(undefined), data).traces[0].name).toBe("Model A");
    expect(buildPlot(roc(false), data).traces[0].name).toBe("Model A");
  });
});
