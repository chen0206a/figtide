import { describe, expect, it } from "vitest";
import type { Dataset } from "../lib/api";
import { configFromPlan, initialPlan } from "./plotPlans";
import { buildPlot } from "./plot";
const data: Dataset = {
  id: 3,
  dataset_id: 1,
  version: 2,
  filename: "test.jsonl",
  sha256: "raw",
  row_count: 2,
  warnings: [],
  fields: [
    { name: "epoch", type: "number", missing: 0 },
    { name: "accuracy", type: "number", missing: 0, role: "y" },
    { name: "error", type: "number", missing: 0, role: "error" },
    { name: "model", type: "string", missing: 0 },
  ],
  rows: [
    { epoch: 1, accuracy: 0.8, error: 0.1, model: "A" },
    { epoch: 2, accuracy: 0.9, error: 0.1, model: "A" },
  ],
};
describe("typed plot plans", () => {
  it("uses real mapping and immutable source without inferring error bars", () => {
    const before = structuredClone(data);
    const plan = {
      ...initialPlan(data),
      type: "scatter" as const,
      x: "epoch",
      ys: ["accuracy"],
      group: "model",
    };
    const config = configFromPlan(data, plan);
    expect(config.datasetVersionId).toBe(3);
    expect(config.series[0].error).toBe("");
    expect(config.series[0].y).toBe("accuracy");
    expect(buildPlot(config, data).traces[0].y).toEqual([0.8, 0.9]);
    expect(data).toEqual(before);
  });
  it("rejects invented and nonnumeric mapped fields before preview or save", () => {
    expect(() =>
      configFromPlan(data, { ...initialPlan(data), ys: ["invented"] }),
    ).toThrow();
    expect(() =>
      configFromPlan(data, {
        ...initialPlan(data),
        type: "scatter",
        x: "model",
      }),
    ).toThrow();
    expect(() =>
      configFromPlan(data, {
        ...initialPlan(data),
        type: "heatmap",
        heatY: "epoch",
      }),
    ).toThrow();
  });
});
