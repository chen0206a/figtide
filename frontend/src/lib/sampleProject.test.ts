import { describe, expect, it } from "vitest";
import type { Dataset } from "./api";
import {
  createSampleProject,
  SAMPLE_FILENAME,
  SAMPLE_PARTIAL_FAILURE,
  SAMPLE_PROJECT_NAME,
  sampleExperiment,
  sampleFile,
  sampleRows,
  sampleRules,
} from "./sampleProject";

const derived = {
  id: 9,
  dataset_id: 9,
  version: 1,
  filename: "学习曲线 · 均值与标准误.csv",
  row_count: 36,
  sha256: "abc",
  fields: [
    { name: "model", type: "string", missing: 0, role: "group" },
    { name: "epoch", type: "number", missing: 0, role: "x" },
    { name: "accuracy__mean", type: "number", missing: 0, role: "y" },
    { name: "accuracy__sem", type: "number", missing: 0, role: "none" },
    { name: "accuracy__lower", type: "number", missing: 0, role: "none" },
    { name: "accuracy__upper", type: "number", missing: 0, role: "none" },
  ],
  rows: [
    {
      model: "linear",
      epoch: 0,
      accuracy__mean: 0.55,
      accuracy__sem: 0.01,
      accuracy__lower: 0.54,
      accuracy__upper: 0.56,
    },
  ],
  warnings: [],
  source_meta: {
    schema_version: 1,
    kind: "data_processing",
    algorithm: "group-summary-v1",
    numeric_encoding: "decimal-strings-v1",
    created_at: "2026-01-01T00:00:00Z",
    source: {
      datasetVersionId: 4,
      datasetId: 4,
      version: 1,
      filename: SAMPLE_FILENAME,
      sha256: "abc",
    },
    rules: sampleRules(),
    statistics: [
      {
        metric: "accuracy",
        columns: {
          total: "accuracy__total",
          n: "accuracy__n",
          missing: "accuracy__missing",
          mean: "accuracy__mean",
          sd: "accuracy__sd",
          sem: "accuracy__sem",
          lower: "accuracy__lower",
          upper: "accuracy__upper",
        },
      },
    ],
    counts: {},
  },
} as unknown as Dataset;

function recorder(failAt?: string) {
  const calls: { path: string; options?: RequestInit }[] = [];
  const request = async <T,>(path: string, options?: RequestInit): Promise<T> => {
    calls.push({ path, options });
    if (failAt && path === failAt) throw new Error("boom");
    if (path === "/projects")
      return { id: 7, name: SAMPLE_PROJECT_NAME, description: "" } as T;
    if (path === "/projects/7/datasets") return { id: 4 } as T;
    if (path === "/projects/7/data/4") return { id: 4 } as T;
    if (path.endsWith("/process")) return derived as T;
    if (path === "/projects/7/charts") return { id: 21, name: "学习曲线" } as T;
    return {} as T;
  };
  return { calls, request };
}

const body = (call: { options?: RequestInit }) =>
  JSON.parse(String(call.options?.body));

describe("示例项目", () => {
  it("uses only the documented public APIs, in order", async () => {
    const { calls, request } = recorder();
    const result = await createSampleProject(request);
    expect(result.project.id).toBe(7);
    expect(result.chart.id).toBe(21);
    expect(calls.map((call) => call.path)).toEqual([
      "/projects",
      "/projects/7/datasets",
      "/projects/7/data/4",
      "/projects/7/experiments",
      "/projects/7/experiments",
      "/projects/7/experiments",
      "/projects/7/data/4/process",
      "/projects/7/charts",
    ]);
    expect(body(calls[0]).name).toBe(SAMPLE_PROJECT_NAME);
    const uploaded = calls[1].options?.body as FormData;
    expect((uploaded.get("file") as File).name).toBe(SAMPLE_FILENAME);
  });

  it("records three experiments whose metrics come from the same CSV", async () => {
    const { calls, request } = recorder();
    await createSampleProject(request);
    const experiments = calls
      .slice(3, 6)
      .map((call) => body(call));
    expect(experiments.map((e) => e.parameters.model)).toEqual([
      "linear",
      "mlp",
      "transformer",
    ]);
    for (const experiment of experiments) {
      expect(experiment.parameters.epochs).toBe(12);
      expect(experiment.parameters.seeds).toBe(3);
      expect(experiment.dataset_version_ids).toEqual([4]);
    }
    expect(experiments[0].metrics.final_accuracy).toBeCloseTo(0.847, 3);
    expect(experiments[1].metrics.final_accuracy).toBeCloseTo(0.931, 3);
    expect(experiments[2].metrics.final_loss).toBeCloseTo(0.638, 3);
  });

  it("aggregates the seeds into a banded line chart of the same data", async () => {
    const { calls, request } = recorder();
    await createSampleProject(request);
    const process = body(calls[6]);
    expect(process.rules).toMatchObject({
      groupBy: ["model", "epoch"],
      metrics: ["accuracy"],
      error: "sem",
      observationUnit: "seed",
      display: "band",
    });
    const chart = body(calls[7]);
    expect(chart.config.type).toBe("line");
    expect(chart.config.x).toBe("epoch");
    expect(chart.config.group).toBe("model");
    expect(chart.config.datasetVersionId).toBe(9);
    expect(chart.config.series[0].y).toBe("accuracy__mean");
    expect(chart.config.series[0].error).toBe("accuracy__sem");
    expect(chart.config.series[0].band).toMatchObject({
      enabled: true,
      lower: "accuracy__lower",
      upper: "accuracy__upper",
    });
  });

  it("keeps the partial project and says so when a later step fails", async () => {
    const { request } = recorder("/projects/7/charts");
    await expect(createSampleProject(request)).rejects.toThrow(
      SAMPLE_PARTIAL_FAILURE,
    );
  });

  it("keeps the sample file free of the note line the importer cannot read", async () => {
    expect(sampleRows()).toHaveLength(108);
    for (const line of sampleFile().split("\n").slice(1)) {
      expect(line.trim()).toMatch(/^[^,]+,\d+,\d+,\d+\.\d{3},\d+\.\d{3}$/);
    }
    expect(sampleRows()[0]).toMatchObject({ model: "linear", epoch: 0 });
    expect(sampleExperiment("mlp").name).toBe("mlp · 学习曲线");
  });
});
