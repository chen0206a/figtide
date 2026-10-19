import type { Config } from "./model";
import { defaultEvaluation } from "./model";
type Row = Record<string, string | number | null>;
export type EvaluationMetric = {
  panel: string;
  series: string;
  seriesId: string;
  group: string;
  n: number;
  positive: number;
  negative: number;
  excluded: number;
  auc: number | null;
  ap: number | null;
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  accuracy: number | null;
};
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const present = (v: unknown) => v != null && v !== "";
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
/** One point per distinct score. Sorting never mutates source rows. */
export function binaryRanking(
  samples: { positive: boolean; score: number }[],
  threshold: number,
) {
  const sorted = [...samples].sort((a, b) => b.score - a.score);
  const positive = sorted.filter((s) => s.positive).length,
    negative = sorted.length - positive;
  const points = [{ fpr: 0, recall: 0, precision: 1 }];
  let tp = 0,
    fp = 0,
    auc = 0,
    ap = 0;
  for (let i = 0; i < sorted.length;) {
    const score = sorted[i].score;
    do {
      if (sorted[i].positive) tp++;
      else fp++;
      i++;
    } while (i < sorted.length && sorted[i].score === score);
    const next = {
      fpr: negative ? fp / negative : 0,
      recall: positive ? tp / positive : 0,
      precision: tp / (tp + fp),
    };
    const prev = points.at(-1)!;
    auc += ((next.fpr - prev.fpr) * (next.recall + prev.recall)) / 2;
    ap += (next.recall - prev.recall) * next.precision;
    points.push(next);
  }
  tp = samples.filter((s) => s.positive && s.score >= threshold).length;
  fp = samples.filter((s) => !s.positive && s.score >= threshold).length;
  const fn = positive - tp,
    tn = negative - fp;
  return {
    points,
    positive,
    negative,
    auc: positive && negative ? auc : null,
    ap: positive && negative ? ap : null,
    tp,
    fp,
    tn,
    fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: positive ? tp / positive : null,
    f1: positive ? (2 * tp) / (2 * tp + fp + fn) : null,
    accuracy: samples.length ? (tp + tn) / samples.length : null,
  };
}
export function evaluationTraces(
  c: Config,
  rows: Row[],
  labelUniverse?: Set<string>,
) {
  const e = c.evaluation || defaultEvaluation;
  const traces: any[] = [],
    metrics: EvaluationMetric[] = [],
    warnings: string[] = [];
  const labels =
    labelUniverse ||
    new Set(
      rows.filter((r) => present(r[e.label])).map((r) => String(r[e.label])),
    );
  if (
    !e.label ||
    labels.size !== 2 ||
    !labels.has(e.positive) ||
    !Number.isFinite(e.threshold)
  ) {
    warnings.push(
      "评估需选择恰好两类的真实标签、有效正类值与有限决策阈值；不会自动猜测正类",
    );
    return { traces, metrics, warnings };
  }
  const groups = c.group ? [...new Set(rows.map((r) => r[c.group]))] : [""];
  if (groups.length * c.series.filter((s) => s.visible).length > 100) {
    warnings.push("评估最多 100 个序列分组，请先过滤；未截断样本");
    return { traces, metrics, warnings };
  }
  for (const s of c.series.filter((s) => s.visible))
    for (const group of groups) {
      const selected = c.group
        ? rows.filter((r) => r[c.group] === group)
        : rows;
      const samples = selected
        .filter((r) => present(r[e.label]) && finite(r[s.y]))
        .map((r) => ({
          positive: String(r[e.label]) === e.positive,
          score: r[s.y] as number,
        }));
      const result = binaryRanking(samples, e.threshold);
      const { points, ...values } = result;
      const metric = {
        panel: "",
        series: s.name,
        seriesId: s.id,
        group: c.group ? String(group ?? "缺失") : "全部",
        n: samples.length,
        excluded: selected.length - samples.length,
        threshold: e.threshold,
        ...values,
      };
      metrics.push(metric);
      const name = s.name + (c.group ? ` · ${group ?? "缺失"}` : "");
      if (metric.excluded)
        warnings.push(
          `${name}：排除 ${metric.excluded} 行缺失标签/分数；未当作零`,
        );
      if (!result.positive || !result.negative) {
        warnings.push(
          `${name}：有效样本未同时包含正负类，不绘制评估曲线或计算 AUC/AP`,
        );
        continue;
      }
      const key = s.id + ":" + JSON.stringify(group);
      traces.push({
        type: "scatter",
        mode: "lines+markers",
        name: escape(name),
        legendgroup: key,
        x: points.map((p) => (c.type === "roc" ? p.fpr : p.recall)),
        y: points.map((p) => (c.type === "roc" ? p.recall : p.precision)),
        line: {
          color: s.color,
          width: s.width,
          dash: s.dash,
          shape: c.type === "pr" ? "vh" : "linear",
        },
        marker: { color: s.color, size: s.size, symbol: s.symbol },
        opacity: s.opacity,
        customdata: points.map(() => s.id),
        connectgaps: false,
        hovertemplate: "%{x:.4f}<br>%{y:.4f}<extra>%{fullData.name}</extra>",
      });
      if (e.baseline)
        traces.push({
          type: "scatter",
          mode: "lines",
          showlegend: false,
          legendgroup: key,
          name:
            c.type === "roc"
              ? "随机排序参考"
              : `正类比例 ${result.positive / samples.length}`,
          x: [0, 1],
          y:
            c.type === "roc"
              ? [0, 1]
              : [
                  result.positive / samples.length,
                  result.positive / samples.length,
                ],
          line: {
            color: c.type === "roc" ? "#a2a9b5" : s.color,
            width: 1,
            dash: "dot",
          },
          opacity: 0.6,
          hoverinfo: "name",
        });
    }
  if (metrics.length > 1)
    warnings.push(
      "各序列按自身有效样本计算；比较前请核对 n、正负例与排除数，未自动取共同样本",
    );
  return { traces, metrics, warnings };
}
