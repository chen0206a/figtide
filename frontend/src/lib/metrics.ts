import type { Experiment } from "./api";
import { numeric } from "../experiments/compare";
const isNumber = (v: unknown): v is number =>
  typeof v === "number" && numeric(v) !== null;

/**
 * Highlight direction inferred from common metric names. Unknown names return
 * null and are never highlighted, so the UI does not claim a "best" value it
 * cannot justify.
 */
export function metricDirection(key: string): "max" | "min" | null {
  const k = key.toLowerCase();
  if (/(loss|error|err\b|rmse|mae|mse|perplexity|ppl|fpr|latency)/.test(k))
    return "min";
  if (
    /(acc|f1|auc|\bap\b|map|precision|recall|score|bleu|rouge|iou|dice)/.test(k)
  )
    return "max";
  return null;
}

/** Index of the best experiment for a metric, or -1 when not applicable. */
export function bestIndex(experiments: Experiment[], key: string) {
  const direction = metricDirection(key);
  if (!direction) return -1;
  let best = -1;
  experiments.forEach((e, i) => {
    const v = e.metrics?.[key];
    if (!isNumber(v)) return;
    const current = best < 0 ? undefined : experiments[best].metrics[key];
    if (
      best < 0 ||
      (direction === "max" ? v > (current as number) : v < (current as number))
    )
      best = i;
  });
  const values = experiments.map((e) => e.metrics?.[key]).filter(isNumber);
  return values.length > 1 && new Set(values).size > 1 ? best : -1;
}
