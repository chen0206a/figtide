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
    throw new Error(message);
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
};
export type Project = {
  id: number;
  name: string;
  description: string;
  experiment_count: number;
  chart_count: number;
  dataset_count: number;
};
