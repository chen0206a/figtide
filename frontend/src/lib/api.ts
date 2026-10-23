export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** offline：请求根本没有到达本地服务，与后端返回的业务错误区分开。 */
    public kind: "http" | "offline" = "http",
  ) {
    super(message);
  }
}
export const OFFLINE_MESSAGE = "本地服务没有响应";
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      ...options,
      headers:
        options.body instanceof FormData
          ? options.headers
          : { "Content-Type": "application/json", ...options.headers },
    });
  } catch (e) {
    // fetch 只在网络层失败时抛 TypeError（Failed to fetch），不要把英文原文送到界面；
    // 其它异常（例如测试里模拟的模拟服务错误）保持原样。
    if (
      e instanceof TypeError ||
      (e instanceof Error && /failed to fetch|networkerror|load failed/i.test(e.message))
    )
      throw new ApiError(OFFLINE_MESSAGE, 0, "offline");
    throw e;
  }
  if (!res.ok) {
    let message =
      res.status >= 500 ? "本地服务处理请求时出错，请稍后重试" : "请求失败，请稍后再试";
    try {
      const body = await res.json();
      if (body && typeof body.message === "string" && body.message)
        message = body.message;
    } catch {}
    throw new ApiError(message, res.status);
  }
  return res.json();
}
export const send = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export type Field = {
  name: string;
  type: "number" | "string";
  missing: number;
  inferredType?: "number" | "string";
  role?: FieldRole;
  suggestedRole?: FieldRole;
  unique?: number;
  samples?: (string | number)[];
  constant?: boolean;
  min?: number;
  max?: number;
};
export type Dataset = {
  id: number;
  dataset_id: number;
  version: number;
  filename: string;
  /** Already returned by the dataset endpoints; absent in older local fixtures. */
  created_at?: string;
  row_count: number;
  sha256: string;
  fields: Field[];
  rows: Record<string, string | number | null>[];
  warnings: string[];
  parse_rules?: ImportRules | null;
  source_meta?: ComparisonSource | ProcessingSource | null;
};
export type Project = {
  id: number;
  name: string;
  description: string;
  experiment_count: number;
  chart_count: number;
  dataset_count: number;
  archived?: boolean;
};
export type FieldRole = "none" | "x" | "y" | "group" | "error";
export type ImportRules = {
  schema_version: 1;
  delimiter: string;
  recordsPath?: string;
  sheet: number;
  missingValues: string[];
  types: Record<string, "number" | "string">;
  roles: Record<string, FieldRole>;
};
export const defaultImportRules = (): ImportRules => ({
  schema_version: 1,
  delimiter: ",",
  sheet: 0,
  missingValues: [],
  types: {},
  roles: {},
});
export type ImportPreview = Pick<
  Dataset,
  "filename" | "row_count" | "fields" | "rows" | "warnings"
> & {
  sheets: string[];
  record_paths?: string[];
  issues: { row: number; field: string; value: string; message: string }[];
  parse_rules: ImportRules;
};
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type ExperimentStatus = "planned" | "running" | "completed" | "failed";
export type Experiment = {
  id: number;
  project_id: number;
  name: string;
  parameters: Record<string, JsonValue>;
  metrics: Record<string, JsonValue>;
  notes: string;
  status: ExperimentStatus;
  tags: string[];
  revision: number;
  created_at: string;
  updated_at: string;
  dataset_version_ids: number[];
  datasets: {
    experiment_id: number;
    dataset_version_id: number;
    filename: string;
    version: number;
    sha256: string;
  }[];
};
export type ComparisonSource = {
  schema_version: 1;
  kind: "experiment_comparison";
  created_at: string;
  metric: string;
  direction: "higher" | "lower";
  baseline_id: number;
  chart_type: "bar" | "scatter";
  experiments: Experiment[];
  missing_count: number;
};
export type ProcessingRules = {
  schema_version: 1;
  mode: "aggregate" | "sort";
  groupBy: string[];
  metrics: string[];
  filters: {
    field: string;
    operator: "eq" | "gte" | "lte" | "missing";
    value: string;
  }[];
  sort: { field: string; direction: "asc" | "desc" }[];
  missingGroup: "include" | "exclude";
  error: "sd" | "sem" | "none";
  observationUnit: string;
  replicate: string;
  x: string;
  group: string;
  display: "bars" | "band";
};
export type ProcessingStatistic = {
  metric: string;
  columns: Record<
    "total" | "n" | "missing" | "mean" | "sd" | "sem" | "lower" | "upper",
    string
  >;
};
export type ProcessingSource = {
  schema_version: 1;
  kind: "data_processing";
  algorithm: "group-summary-v1";
  numeric_encoding?: "decimal-strings-v1";
  created_at: string;
  source: {
    datasetVersionId: number;
    datasetId: number;
    version: number;
    filename: string;
    sha256: string;
  };
  rules: ProcessingRules;
  statistics: ProcessingStatistic[];
  counts: Record<
    | "source_rows"
    | "filtered_rows"
    | "excluded_rows"
    | "output_rows"
    | "groups"
    | "missing_group_rows",
    number
  >;
};
export type ProcessingPreview = Pick<
  Dataset,
  "fields" | "rows" | "row_count" | "warnings"
> &
  Pick<ProcessingSource, "source" | "rules" | "statistics" | "counts">;
