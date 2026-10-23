import type { Experiment, JsonValue } from "../lib/api";
import { metricDirection } from "../lib/metrics";
export type Columns = { parameters: string[]; metrics: string[] };
export type Sort = {
  kind: "parameters" | "metrics" | "updated_at" | "name" | "status";
  key: string;
  direction: "asc" | "desc";
};
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export function inferColumns(rows: Experiment[]): Columns {
  const keys = (kind: keyof Columns) => {
    const counts = new Map<string, number>();
    for (const row of rows)
      for (const key of Object.keys(row[kind]))
        counts.set(key, (counts.get(key) || 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => key);
  };
  return { parameters: keys("parameters"), metrics: keys("metrics") };
}
export function defaultColumns(all: Columns): Columns {
  return {
    parameters: all.parameters.slice(0, 4),
    metrics: all.metrics.slice(0, 3),
  };
}
export function readView(storage?: StorageLike): "table" | "cards" {
  try {
    return (storage || localStorage).getItem("labflow-experiments-view") ===
      "cards"
      ? "cards"
      : "table";
  } catch {
    return "table";
  }
}
export function writeView(view: "table" | "cards", storage?: StorageLike) {
  try {
    (storage || localStorage).setItem("labflow-experiments-view", view);
  } catch {
    /* local preference is optional */
  }
}
export function readColumns(
  project: number,
  storage?: StorageLike,
): Columns | null {
  try {
    const value = JSON.parse(
      (storage || localStorage).getItem(
        `labflow-experiment-columns:${project}`,
      ) || "null",
    );
    return value &&
      [value.parameters, value.metrics].every(
        (x) => Array.isArray(x) && x.every((v) => typeof v === "string"),
      )
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writeColumns(
  project: number,
  columns: Columns,
  storage?: StorageLike,
) {
  try {
    (storage || localStorage).setItem(
      `labflow-experiment-columns:${project}`,
      JSON.stringify(columns),
    );
  } catch {
    /* unavailable storage never blocks editing */
  }
}
export function defaultSort(all: Columns): Sort {
  const key = all.metrics.find((k) => metricDirection(k));
  // Display order is descending as specified; best-value color uses metric direction.
  return key
    ? { kind: "metrics", key, direction: "desc" }
    : { kind: "updated_at", key: "", direction: "desc" };
}
export function sortRows(rows: Experiment[], sort: Sort) {
  const value = (r: Experiment): JsonValue | undefined =>
    sort.kind === "parameters" || sort.kind === "metrics"
      ? r[sort.kind][sort.key]
      : r[sort.kind];
  const missing = (v: JsonValue | undefined) =>
    v == null || (typeof v === "number" && !Number.isFinite(v));
  return [...rows].sort((a, b) => {
    const x = value(a),
      y = value(b);
    if (missing(x) || missing(y))
      return missing(x) === missing(y) ? a.id - b.id : missing(x) ? 1 : -1;
    const n =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
    return n * (sort.direction === "asc" ? 1 : -1) || a.id - b.id;
  });
}
