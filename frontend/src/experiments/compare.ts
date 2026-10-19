import type { JsonValue } from "../lib/api";
export const numeric = (value: JsonValue | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export function stable(value: JsonValue | undefined): string {
  if (value === undefined) return "<missing>";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
    .join(",")}}`;
}
export function delta(
  value: JsonValue | undefined,
  baseline: JsonValue | undefined,
): number | null {
  const a = numeric(value),
    b = numeric(baseline);
  return a === null || b === null || !Number.isFinite(a - b) ? null : a - b;
}
export const display = (value: JsonValue | undefined) =>
  value === undefined || value === null
    ? "缺失"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
export const formatDelta = (n: number) =>
  `${n > 0 ? "+" : ""}${Number(n.toPrecision(6))}`;
