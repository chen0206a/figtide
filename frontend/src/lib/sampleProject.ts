import sampleCsv from "../assets/sample/示例-学习曲线.csv?raw";
import { defaults } from "../editor/model";
import {
  api,
  send,
  type Dataset,
  type ProcessingRules,
  type Project,
} from "./api";

export const SAMPLE_PROJECT_NAME = "示例 · 学习曲线";
export const SAMPLE_PROJECT_DESCRIPTION =
  "合成示例数据，用于体验 LabFlow 的功能，可以随时归档。";
export const SAMPLE_FILENAME = "示例-学习曲线.csv";
export const SAMPLE_NOTE = "合成演示数据，不能用于真实结论。";
export const SAMPLE_PARTIAL_FAILURE =
  "示例项目创建到一半失败了，可以在管理项目中归档它";
const SAMPLE_CHART_NAME = "学习曲线 · 均值与标准误";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type SampleRow = {
  model: string;
  seed: number;
  epoch: number;
  accuracy: number;
  loss: number;
};

/** CSV comment lines start with `#`; the importer has no comment syntax, so strip them first. */
export function sampleFile(): string {
  return sampleCsv
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();
}

export function sampleRows(): SampleRow[] {
  const [header, ...lines] = sampleFile().split("\n");
  const names = header.split(",").map((name) => name.trim());
  return lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const cells = line.split(",");
      const row = Object.fromEntries(
        names.map((name, i) => [name, cells[i]?.trim() ?? ""]),
      ) as Record<string, string>;
      return {
        model: row.model,
        seed: Number(row.seed),
        epoch: Number(row.epoch),
        accuracy: Number(row.accuracy),
        loss: Number(row.loss),
      };
    });
}

export function sampleModels(): string[] {
  return [...new Set(sampleRows().map((row) => row.model))];
}

export function sampleRules(): ProcessingRules {
  return {
    schema_version: 1,
    mode: "aggregate",
    groupBy: ["model", "epoch"],
    metrics: ["accuracy"],
    filters: [],
    sort: [{ field: "epoch", direction: "asc" }],
    missingGroup: "include",
    error: "sem",
    observationUnit: "seed",
    replicate: "seed",
    x: "epoch",
    group: "model",
    display: "band",
  };
}

const round3 = (value: number) => Math.round(value * 1e3) / 1e3;

/** Parameters and metrics are derived from the same CSV the project imports. */
export function sampleExperiment(model: string) {
  const rows = sampleRows().filter((row) => row.model === model);
  const lastEpoch = Math.max(...rows.map((row) => row.epoch));
  const finals = rows.filter((row) => row.epoch === lastEpoch);
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    name: `${model} · 学习曲线`,
    status: "completed" as const,
    parameters: {
      model,
      epochs: lastEpoch + 1,
      seeds: new Set(rows.map((row) => row.seed)).size,
      optimizer: "adam",
    },
    metrics: {
      final_accuracy: round3(mean(finals.map((row) => row.accuracy))),
      final_loss: round3(mean(finals.map((row) => row.loss))),
    },
    notes: SAMPLE_NOTE,
    tags: ["示例数据"],
  };
}

/**
 * Creates the sample project through the same public APIs the UI uses: upload,
 * three experiment records, one aggregated dataset with SEM band, one chart.
 * Any failure leaves the partial project in place and says so.
 */
export async function createSampleProject(
  request: Request = api,
): Promise<{ project: Project; chart: { id: number; name: string } }> {
  try {
    const project = await request<Project>(
      "/projects",
      send("POST", {
        name: SAMPLE_PROJECT_NAME,
        description: SAMPLE_PROJECT_DESCRIPTION,
      }),
    );
    const form = new FormData();
    form.append(
      "file",
      new File([sampleFile()], SAMPLE_FILENAME, { type: "text/csv" }),
    );
    const uploaded = await request<Dataset>(`/projects/${project.id}/datasets`, {
      method: "POST",
      body: form,
    });
    const source = await request<Dataset>(
      `/projects/${project.id}/data/${uploaded.id}`,
    );
    for (const model of sampleModels())
      await request(`/projects/${project.id}/experiments`, {
        ...send("POST", {
          ...sampleExperiment(model),
          dataset_version_ids: [uploaded.id],
        }),
      });
    const derived = await request<Dataset>(
      `/projects/${project.id}/data/${source.id}/process`,
      send("POST", {
        name: SAMPLE_CHART_NAME,
        rules: sampleRules(),
      }),
    );
    const config = defaults(derived);
    const metadata = derived.source_meta;
    if (metadata?.kind === "data_processing") {
      config.series = config.series.map((series) => {
        const statistic = metadata.statistics.find((s) => s.columns.mean === series.y);
        return {
          ...series,
          error: statistic?.columns.sem || "",
          band: series.band ? { ...series.band, opacity: 0.35 } : series.band,
        };
      });
    }
    const chart = await request<{ id: number; name: string }>(
      `/projects/${project.id}/charts`,
      send("POST", { name: SAMPLE_CHART_NAME, config }),
    );
    return { project, chart };
  } catch (error) {
    const wrapped = new Error(SAMPLE_PARTIAL_FAILURE);
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
}