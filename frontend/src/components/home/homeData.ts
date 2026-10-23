import type { Experiment, JsonValue } from "../../lib/api";
import { chartDraftKey } from "../../lib/chartDraft";

export type ChartSummary = {
  id: number;
  name: string;
  revision: number;
  updated_at: string;
};

/** "早上好" / "下午好" / "晚上好" by local hour. */
export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 11 ? "早上好" : h < 18 ? "下午好" : "晚上好";
}

/** "10月22日 · 星期四" */
export function dateLabel(now = new Date()) {
  const week = "日一二三四五六"[now.getDay()];
  return `${now.getMonth() + 1}月${now.getDate()}日 · 星期${week}`;
}

/** Compact relative time for list metadata; never invents precision. */
export function relativeTime(iso: string, now = new Date()) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const minutes = Math.floor((now.getTime() - t.getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const sameDay = t.toDateString() === now.toDateString();
  if (sameDay) return `${Math.floor(minutes / 60)} 小时前`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (t.toDateString() === yesterday.toDateString()) return "昨天";
  return `${t.getMonth() + 1}/${t.getDate()}`;
}

/**
 * The editor keeps unsaved edits of a saved chart under
 * `labflow-draft-v1:<project>:<chart>`. Report only that one exists and when
 * it was written; the editor stays responsible for validating/restoring it.
 */
export function localDraftInfo(
  storage: Pick<Storage, "getItem">,
  project: number,
  chart: number,
): { at: string } | null {
  try {
    const raw = storage.getItem(chartDraftKey(project, chart, 0));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return typeof draft?.at === "string" ? { at: draft.at } : { at: "" };
  } catch {
    return null;
  }
}

const isNumber = (v: JsonValue | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Up to `limit` metric keys that are numeric in the most experiments. */
export function metricColumns(experiments: Experiment[], limit = 2) {
  const counts = new Map<string, number>();
  for (const e of experiments)
    for (const [key, value] of Object.entries(e.metrics || {}))
      if (isNumber(value)) counts.set(key, (counts.get(key) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

export { metricDirection, bestIndex } from "../../lib/metrics";

export function formatMetric(v: JsonValue | undefined) {
  if (!isNumber(v)) return "—";
  return Math.abs(v) >= 100 || Number.isInteger(v)
    ? String(v)
    : String(Number(v.toPrecision(4)));
}
