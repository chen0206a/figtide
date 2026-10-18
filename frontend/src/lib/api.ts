export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api" + path, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) {
    let message = "请求失败，请检查本地服务";
    try {
      message = (await res.json()).message || message;
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
  row_count: number;
  sha256: string;
  fields: Field[];
  rows: Record<string, string | number | null>[];
  warnings: string[];
  parse_rules?: ImportRules | null;
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
  issues: { row: number; field: string; value: string; message: string }[];
  parse_rules: ImportRules;
};
