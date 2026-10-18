import { describe, it, expect } from "vitest";
import { defaults, historyReducer } from "./model";
import { buildPlot } from "./plot";
import type { Dataset } from "../lib/api";
const d: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "demo.csv",
  row_count: 3,
  sha256: "abc",
  fields: [
    { name: "epoch", type: "number", missing: 0 },
    { name: "accuracy", type: "number", missing: 1 },
    { name: "error", type: "number", missing: 0 },
  ],
  rows: [
    { epoch: 1, accuracy: 80, error: 1 },
    { epoch: 2, accuracy: null, error: 2 },
    { epoch: 3, accuracy: 90, error: 3 },
  ],
  warnings: [],
};
describe("reproducible plot model", () => {
  it("renders heatmap cells as vector rectangles with no raster image", () => {
    const c = defaults(d);
    c.type = "heatmap";
    c.x = "epoch";
    c.heatY = "epoch";
    c.heatZ = "accuracy";
    const plot = buildPlot(c, d);
    expect(plot.traces[0].meta).toBe("vector-heatmap");
    expect(plot.layout.shapes).toHaveLength(2);
    expect(plot.layout.shapes[0].type).toBe("rect");
    expect(plot.layout.images).toBeUndefined();
  });
  it("undo and redo restore full configuration", () => {
    const c = defaults(d);
    const edited = {
      ...c,
      type: "bar" as const,
      style: { ...c.style, title: "Changed" },
    };
    const h = historyReducer(
      { past: [], present: c, future: [] },
      { type: "edit", value: edited },
    );
    const undo = historyReducer(h, { type: "undo" });
    expect(undo.present).toEqual(c);
    expect(historyReducer(undo, { type: "redo" }).present).toEqual(edited);
  });
  it("keeps missing values and never fabricates errors", () => {
    const c = defaults(d);
    const plot = buildPlot(c, d);
    expect(plot.traces[0].y).toEqual([80, null, 90]);
    expect(plot.traces[0].error_y).toBeUndefined();
    c.series[0].error = "error";
    expect(buildPlot(c, d).traces[0].error_y.array).toEqual([1, 2, 3]);
  });
  it("filters a view without mutating data", () => {
    const c = defaults(d);
    c.transforms = [
      { op: "filter", field: "epoch", operator: "gte", value: "2" },
    ];
    const before = JSON.stringify(d);
    expect(buildPlot(c, d).shownRows).toBe(2);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("rejects silent heatmap aggregation", () => {
    const c = defaults(d);
    c.type = "heatmap";
    c.x = "error";
    c.heatY = "error";
    c.heatZ = "accuracy";
    const duplicate = { ...d, rows: [d.rows[0], d.rows[0]] };
    expect(buildPlot(c, duplicate).traces).toHaveLength(0);
    expect(buildPlot(c, duplicate).warnings[0]).toContain("重复");
  });
  it("warns on negative values for log axis and invalid ranges", () => {
    const c = defaults(d);
    c.axes.y.log = true;
    c.axes.y.min = "0";
    const plot = buildPlot(c, {
      ...d,
      rows: [{ epoch: 1, accuracy: -1, error: 1 }],
    });
    expect(plot.warnings).toHaveLength(2);
    expect(plot.traces[0].y).toEqual([]);
  });
  it("preserves layout and series styles when switching plot type", () => {
    const c = defaults(d);
    c.series[0].color = "#ff0000";
    c.style.font = "Georgia";
    const a = buildPlot(c, d),
      b = buildPlot({ ...c, type: "scatter" }, d);
    expect(b.layout).toEqual(a.layout);
    expect(b.traces[0].marker.color).toBe("#ff0000");
  });
});

it("initializes confirmed field roles and leaves input metadata unchanged", () => {
  const input: Dataset = {
    ...d,
    fields: d.fields.map((f) => ({
      ...f,
      role: f.name === "epoch" ? "x" : f.name === "accuracy" ? "y" : "error",
    })),
  };
  const before = JSON.stringify(input);
  const c = defaults(input);
  expect(c.x).toBe("epoch");
  expect(c.series[0].y).toBe("accuracy");
  expect(c.series[0].error).toBe("error");
  expect(JSON.stringify(input)).toBe(before);
});
