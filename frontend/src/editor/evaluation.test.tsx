import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { binaryRanking } from "./evaluation";
import { buildPlot } from "./plot";
import {
  defaults,
  defaultEvaluation,
  defaultBand,
  defaultFacet,
  makeSeries,
} from "./model";
import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { EvaluationPanel, BandPanel } from "./EvaluationPanel";
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
    ...["epoch", "score", "lower", "upper"].map((name) => ({
      name,
      type: "number" as const,
      missing: 0,
    })),
  ],
  rows: [0.1, 0.4, 0.35, 0.8].map((score, i) => ({
    label: i < 2 ? "阴性" : "阳性",
    epoch: i + 1,
    score,
    lower: score - 0.05,
    upper: score + 0.05,
  })),
};
function config(): Config {
  return {
    ...defaults(data),
    type: "roc",
    x: "epoch",
    series: [makeSeries("score")],
    evaluation: { ...defaultEvaluation, label: "label", positive: "阳性" },
  };
}
describe("auditable binary evaluation", () => {
  it("matches hand-calculated ROC AUC and non-interpolated AP", () => {
    const before = JSON.stringify(data),
      c = config(),
      p = buildPlot(c, data),
      m = p.metrics[0];
    expect(m.auc).toBe(0.75);
    expect(m.ap).toBeCloseTo(5 / 6, 12);
    expect(m).toMatchObject({
      n: 4,
      positive: 2,
      negative: 2,
      excluded: 0,
      tp: 1,
      fp: 0,
      tn: 2,
      fn: 1,
      precision: 1,
      recall: 0.5,
      f1: 2 / 3,
      accuracy: 0.75,
    });
    expect(p.traces[0].x).toEqual([0, 0, 0.5, 0.5, 1]);
    expect(p.traces[0].y).toEqual([0, 0.5, 0.5, 1, 1]);
    c.type = "pr";
    const pr = buildPlot(c, data);
    expect(pr.traces[0].line.shape).toBe("vh");
    expect(pr.layout.xaxis.title.text).toBe("Recall");
    expect(JSON.stringify(data)).toBe(before);
  });
  it("processes tied scores together independently of row order", () => {
    const samples = [true, false, true, false].map((positive) => ({
      positive,
      score: 0.5,
    }));
    const r = binaryRanking(samples, 0.5);
    expect(r.points).toHaveLength(2);
    expect(r.auc).toBe(0.5);
    expect(r.ap).toBe(0.5);
    expect(binaryRanking(samples.reverse(), 1)).toMatchObject({
      auc: 0.5,
      ap: 0.5,
      precision: null,
      f1: 0,
      tp: 0,
      tn: 2,
    });
  });
  it("excludes missing pairs without turning them into negative classes or zero scores", () => {
    const p = buildPlot(config(), {
      ...data,
      rows: [
        ...data.rows,
        { label: null, score: 0.9, epoch: 5 },
        { label: "阳性", score: null, epoch: 6 },
      ],
    });
    expect(p.metrics[0]).toMatchObject({ n: 4, excluded: 2, auc: 0.75 });
    expect(p.warnings.join()).toContain("未当作零");
  });
  it("rejects unspecified positive and multiclass labels, reports one-class grouped samples", () => {
    const c = config();
    c.evaluation!.positive = "未指定";
    expect(buildPlot(c, data).traces).toHaveLength(0);
    c.evaluation!.positive = "阳性";
    expect(
      buildPlot(c, {
        ...data,
        rows: [...data.rows, { label: "第三类", score: 0.3 }],
      }).traces,
    ).toHaveLength(0);
    c.group = "label";
    const p = buildPlot(c, data);
    expect(p.traces).toHaveLength(0);
    expect(p.metrics).toHaveLength(2);
    expect(p.metrics.every((m) => m.auc === null && m.ap === null)).toBe(true);
    c.group = "";
    c.facet = { ...defaultFacet, mode: "field", field: "label" };
    c.style.width = 1120;
    const faceted = buildPlot(c, data);
    expect(faceted.traces).toHaveLength(0);
    expect(faceted.metrics.map((m) => m.n)).toEqual([2, 2]);
    expect(
      faceted.metrics.every(
        (m) => m.auc === null && m.seriesId === c.series[0].id,
      ),
    ).toBe(true);
  });
  it("keeps ordinary axes independent and reports per-panel filtered metrics", () => {
    const c = config();
    c.axes.x.log = true;
    c.axes.y.min = "99";
    c.evaluation!.rocXTitle = "FPR";
    c.series.push(makeSeries("upper", 1));
    c.facet = { ...defaultFacet, mode: "series" };
    c.style.width = 1120;
    const p = buildPlot(c, data);
    expect(p.metrics).toHaveLength(2);
    expect(p.metrics[0].panel).toBe("score");
    expect(p.layout.xaxis.type).toBe("linear");
    expect(p.layout.yaxis.range).toEqual([0, 1]);
    expect(p.layout.xaxis.title.text).toBe("FPR");
    expect(c.axes.x.log).toBe(true);
    c.facet.mode = "none";
    c.transforms = [
      { op: "filter", field: "epoch", operator: "gte", value: "2" },
    ];
    expect(buildPlot(c, data).metrics[0].n).toBe(3);
  });
});
describe("actual interval bands", () => {
  function bandConfig() {
    const c = config();
    c.type = "line";
    c.series[0].band = {
      ...defaultBand,
      enabled: true,
      lower: "lower",
      upper: "upper",
    };
    return c;
  }
  it("uses closed SVG polygons from actual bounds and preserves source data", () => {
    const c = bandConfig(),
      before = JSON.stringify(data),
      p = buildPlot(c, data);
    expect(p.traces[0].fill).toBe("toself");
    expect(p.traces[0].x).toEqual([1, 2, 3, 4, 4, 3, 2, 1]);
    expect(p.traces[0].y[0]).toBeCloseTo(0.15);
    expect(p.traces[0].showlegend).toBe(false);
    expect(p.traces[1].y).toEqual(data.rows.map((r) => r.score));
    expect(JSON.stringify(data)).toBe(before);
    c.type = "scatter";
    expect(buildPlot(c, data).traces).toHaveLength(1);
    expect(c.series[0].band!.enabled).toBe(true);
  });
  it("breaks at missing bounds and log exclusions instead of spanning gaps", () => {
    const c = bandConfig(),
      rows = [
        ...data.rows,
        { label: "阳性", epoch: 5, score: 0.9, lower: 0.8, upper: 1 },
      ];
    rows[2] = { ...rows[2], lower: null };
    const p = buildPlot(c, { ...data, rows });
    expect(p.traces.filter((t) => t.fill).map((t) => t.x)).toEqual([
      [1, 2, 2, 1],
      [4, 5, 5, 4],
    ]);
    expect(p.warnings.join()).toContain("断开");
    c.axes.y.log = true;
    rows[1] = { ...rows[1], lower: -1 };
    expect(
      buildPlot(c, { ...data, rows }).traces.filter((t) => t.fill),
    ).toHaveLength(1);
  });
  it("refuses reversed bounds and unsorted X without changing central values", () => {
    const c = bandConfig();
    const p = buildPlot(c, { ...data, rows: [...data.rows].reverse() });
    expect(p.traces).toHaveLength(1);
    expect(p.warnings.join()).toContain("严格递增");
    expect(
      buildPlot(c, {
        ...data,
        rows: data.rows.map((r) => ({ ...r, lower: 2 })),
      }).warnings.join(),
    ).toContain("下界大于上界");
  });
  it("routes polygons through facets, preserves legend and suppresses duplicate error bars", () => {
    const c = bandConfig();
    c.series[0].error = "upper";
    c.series.push({ ...makeSeries("upper", 1), band: c.series[0].band });
    c.style.width = 1120;
    c.facet = { ...defaultFacet, mode: "series" };
    const p = buildPlot(c, data);
    expect(p.traces.filter((t) => t.fill).map((t) => t.xaxis)).toEqual([
      "x",
      "x2",
    ]);
    expect(p.traces[1].showlegend).toBe(true);
    expect(p.traces[1].error_y).toBeUndefined();
  });
});
it("label/positive/threshold and actual bounds controls update the same persisted config", () => {
  function Harness() {
    const [c, set] = useState(config());
    return (
      <>
        <EvaluationPanel
          config={c}
          data={data}
          onChange={(v) => set({ ...c, ...v })}
        />
        <BandPanel
          series={c.series[0]}
          data={data}
          onChange={(v) => set({ ...c, series: [{ ...c.series[0], ...v }] })}
        />
        <output data-testid="config">{JSON.stringify(c)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("正类值"), {
    target: { value: "阴性" },
  });
  fireEvent.change(screen.getByLabelText("决策阈值"), {
    target: { value: "0.7" },
  });
  fireEvent.click(screen.getByRole("switch", { name: "显示实际区间带" }));
  fireEvent.change(screen.getByLabelText("区间下界列"), {
    target: { value: "lower" },
  });
  fireEvent.change(screen.getByLabelText("区间上界列"), {
    target: { value: "upper" },
  });
  const saved = JSON.parse(screen.getByTestId("config").textContent!);
  expect(saved.evaluation).toMatchObject({ positive: "阴性", threshold: 0.7 });
  expect(saved.series[0].band).toMatchObject({
    enabled: true,
    lower: "lower",
    upper: "upper",
  });
});
