import type { Config } from "./model";
import { defaultSampling } from "./model";
import type { Dataset } from "../lib/api";
export type Row = Dataset["rows"][number];
export const present = (v: unknown) => v != null && v !== "";
export const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function identityWarning(c: Config, rows: Row[]) {
  const id = c.sampling?.id;
  if (!id) return "";
  const ids = rows.map((r) => r[id]);
  return ids.some((v) => !present(v)) ||
    new Set(ids.map(String)).size !== ids.length
    ? "样本 ID 在当前过滤后的数据中必须非缺失且唯一；未自动去重或猜测配对"
    : "";
}
export function sampleSelection(
  c: Config,
  rows: Row[],
  label: string,
  column: string,
  kind: "labels" | "scores",
  reference: Config = c,
) {
  const valid = (r: Row, col: string) =>
    present(r[label]) && (kind === "scores" ? finite(r[col]) : present(r[col]));
  const cols = reference.series
    .filter((s) => s.visible)
    .map((s) => (kind === "scores" ? s.y : s.prediction || ""));
  const own = rows.filter((r) => valid(r, column));
  const used =
    (c.sampling || defaultSampling).policy === "intersection"
      ? own.filter((r) => cols.every((col) => valid(r, col)))
      : own;
  return {
    used,
    ownMissing: rows.length - own.length,
    excludedByOthers: own.length - used.length,
  };
}
