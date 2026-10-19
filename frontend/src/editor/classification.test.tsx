import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Dataset } from "../lib/api";
import {
  defaults,
  defaultClassification,
  defaultEvaluation,
  defaultFacet,
  makeSeries,
  type Config,
} from "./model";
import { classificationReports, matrixMetrics } from "./classification";
import { buildPlot } from "./plot";
import { ClassificationPanel } from "./ClassificationPanel";
const rows = [
  ["A", "A", "A"],
  ["A", "B", null],
  ["B", "B", "C"],
  ["B", "C", "B"],
  ["C", "C", "C"],
  ["C", "C", "A"],
  ["C", null, "C"],
  [null, "A", "A"],
  ["A", null, "B"],
].map(([truth, a, b], i) => ({ id: i + 1, truth, a, b }));
const data: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "synthetic-classes.csv",
  sha256: "demo",
  row_count: 9,
  warnings: [],
  fields: [
    { name: "id", type: "number", missing: 0 },
    ...["truth", "a", "b"].map((name) => ({
      name,
      type: "string" as const,
      missing: 0,
    })),
  ],
  rows,
};
function config(): Config {
  return {
    ...defaults(data),
    type: "confusion",
    series: [
      { ...makeSeries("id"), name: "Model A", prediction: "a" },
      { ...makeSeries("id", 1), name: "Model B", prediction: "b" },
    ],
    classification: {
      ...defaultClassification,
      label: "truth",
      classes: ["A", "B", "C"],
    },
  };
}
describe("classification reports and SVG matrix", () => {
  it("matches a hand counted 3 class matrix and per-class/macro/micro metrics", () => {
    const c = config(),
      before = JSON.stringify(data),
      r = classificationReports(c, rows).reports[0];
    expect(r.counts).toEqual([
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 2],
    ]);
    expect(r).toMatchObject({
      n: 6,
      excluded: 3,
      ownMissing: 3,
      excludedByOthers: 0,
      accuracy: 2 / 3,
      sampleRows: [1, 2, 3, 4, 5, 6],
    });
    expect(r.perClass[0]).toMatchObject({
      support: 2,
      predicted: 1,
      tp: 1,
      fp: 0,
      fn: 1,
      precision: 1,
      recall: 0.5,
      f1: 2 / 3,
    });
    expect(r.macro.f1).toBeCloseTo((2 / 3 + 0.5 + 0.8) / 3, 14);
    expect(r.micro).toEqual({ precision: 2 / 3, recall: 2 / 3, f1: 2 / 3 });
    expect(JSON.stringify(data)).toBe(before);
  });
  it("normalizes true rows, predicted columns and all samples without changing counts or metrics", () => {
    const c = config();
    for (const normalization of ["true", "pred", "all"] as const) {
      c.classification!.normalization = normalization;
      const r = classificationReports(c, rows).reports[0];
      expect(r.matrix[0][0]).toBe(
        normalization === "true" ? 0.5 : normalization === "pred" ? 1 : 1 / 6,
      );
      expect(r.accuracy).toBe(2 / 3);
      expect(r.counts[0]).toEqual([1, 1, 0]);
    }
  });
  it("preserves undefined class metrics and normalization denominators instead of inventing zeros", () => {
    const c = config();
    c.classification!.classes.push("D");
    c.classification!.normalization = "true";
    const r = classificationReports(c, rows).reports[0];
    expect(r.matrix[3]).toEqual([null, null, null, null]);
    expect(r.perClass[3]).toMatchObject({
      support: 0,
      predicted: 0,
      precision: null,
      recall: null,
      f1: null,
    });
    expect(r.macro).toEqual({ precision: null, recall: null, f1: null });
    expect(r.weighted.f1).toBeCloseTo((2 / 3 + 0.5 + 0.8) / 3, 14);
  });
  it("uses the intersection of every visible model and records exact source row membership", () => {
    const c = config();
    c.sampling = { policy: "intersection", id: "id" };
    const r = classificationReports(c, rows).reports;
    expect(r.map((v) => v.n)).toEqual([5, 5]);
    expect(r.map((v) => v.sampleRows)).toEqual([
      [1, 3, 4, 5, 6],
      [1, 3, 4, 5, 6],
    ]);
    expect(r.map((v) => v.excludedByOthers)).toEqual([1, 2]);
    c.series[1].visible = false;
    expect(classificationReports(c, rows).reports[0].n).toBe(6);
  });
  it("rejects unknown classes and duplicate/missing sample IDs without displaying old matrices", () => {
    const c = config();
    expect(
      classificationReports(c, [
        ...rows,
        { id: 10, truth: "A", a: "unknown", b: "A" },
      ]).warnings.join(),
    ).toContain("未知类别");
    c.sampling = { policy: "intersection", id: "truth" };
    const p = buildPlot(c, data);
    expect(p.traces).toHaveLength(0);
    expect(p.classificationReports).toHaveLength(0);
    expect(p.layout.shapes).toHaveLength(0);
    expect(p.warnings.join()).toContain("样本 ID");
  });
  it("renders ordered vector cells with undefined labels and preserves ordinary axes", () => {
    const c = config();
    c.classification!.classes = ["C", "B", "A", "D"];
    c.classification!.normalization = "true";
    c.axes.x.log = true;
    const p = buildPlot(c, data);
    expect(p.layout.xaxis.ticktext).toEqual(["C", "B", "A", "D"]);
    expect(p.layout.yaxis.range).toEqual([3.5, -0.5]);
    expect(p.layout.annotations.some((a: any) => a.text === "—")).toBe(true);
    expect(p.layout.shapes).toHaveLength(16);
    expect(p.traces.every((t) => t.type === "scatter")).toBe(true);
    expect(c.axes.x.log).toBe(true);
  });
  it("thresholds binary raw scores and never applies thresholds to multiclass labels", () => {
    const c = config();
    c.classification = {
      ...defaultClassification,
      input: "scores",
      label: "truth",
      positive: "1",
      classes: ["0", "1"],
    };
    c.series = [makeSeries("score")];
    const r = classificationReports(
      c,
      [0.1, 0.4, 0.35, 0.8].map((score, i) => ({
        id: i,
        truth: i < 2 ? 0 : 1,
        score,
      })),
    ).reports[0];
    expect(r.counts).toEqual([
      [2, 0],
      [1, 1],
    ]);
    expect(r.accuracy).toBe(0.75);
  });
  it("keeps common ROC samples identical across per-series facets", () => {
    const d = {
      ...data,
      fields: [
        { name: "truth", type: "number" as const, missing: 0 },
        { name: "a", type: "number" as const, missing: 0 },
        { name: "b", type: "number" as const, missing: 1 },
      ],
      rows: [
        { truth: 0, a: 0.1, b: 0.2 },
        { truth: 0, a: 0.4, b: 0.3 },
        { truth: 1, a: 0.35, b: null },
        { truth: 1, a: 0.8, b: 0.9 },
      ],
    };
    const c = {
      ...defaults(d),
      type: "roc" as const,
      evaluation: { ...defaultEvaluation, label: "truth", positive: "1" },
      sampling: { policy: "intersection" as const, id: "" },
      series: [makeSeries("a"), makeSeries("b")],
      facet: { ...defaultFacet, mode: "series" as const },
      style: { ...defaults(d).style, width: 1120 },
    };
    const p = buildPlot(c, d);
    expect(p.metrics.map((m) => m.n)).toEqual([3, 3]);
    expect(p.metrics.map((m) => m.excludedByOthers)).toEqual([1, 0]);
    expect(p.metrics.map((m) => m.auc)).toEqual([1, 1]);
  });
  it("computes weighted metrics from actual class support", () => {
    const m = matrixMetrics(
      [
        [3, 1],
        [0, 1],
      ],
      ["A", "B"],
    );
    expect(m.perClass.map((v) => v.support)).toEqual([4, 1]);
    expect(m.weighted.recall).toBe(0.8);
    expect(m.weighted.f1).toBeCloseTo((4 * (6 / 7) + 2 / 3) / 5, 14);
  });
});
it("edits category order and sampling through the persisted config", () => {
  function Harness() {
    const [c, set] = useState(config());
    return (
      <>
        <ClassificationPanel
          config={c}
          data={data}
          onChange={(v) => set({ ...c, ...v })}
        />
        <output data-testid="config">{JSON.stringify(c)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "上移类别 2" }));
  fireEvent.change(screen.getByLabelText("有效样本策略"), {
    target: { value: "intersection" },
  });
  const c = JSON.parse(screen.getByTestId("config").textContent!);
  expect(c.classification.classes).toEqual(["B", "A", "C"]);
  expect(c.sampling.policy).toBe("intersection");
});
