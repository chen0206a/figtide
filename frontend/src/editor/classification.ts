import type { Config } from "./model";
import { defaultClassification } from "./model";
import { present, sampleSelection, type Row } from "./sampling";
export type ClassMetric = {
  label: string;
  support: number;
  predicted: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};
export type Average = {
  precision: number | null;
  recall: number | null;
  f1: number | null;
};
export type ClassificationReport = {
  seriesId: string;
  series: string;
  groupKey: string;
  group: string;
  classes: string[];
  counts: number[][];
  matrix: (number | null)[][];
  n: number;
  excluded: number;
  ownMissing: number;
  excludedByOthers: number;
  accuracy: number | null;
  perClass: ClassMetric[];
  macro: Average;
  weighted: Average;
  micro: Average;
  sampleRows: number[];
};
export function matrixMetrics(counts: number[][], classes: string[]) {
  const n = counts.flat().reduce((a, b) => a + b, 0);
  const perClass = classes.map((label, i) => {
    const support = counts[i].reduce((a, b) => a + b, 0),
      predicted = counts.reduce((a, row) => a + row[i], 0),
      tp = counts[i][i],
      fp = predicted - tp,
      fn = support - tp;
    return {
      label,
      support,
      predicted,
      tp,
      fp,
      fn,
      precision: predicted ? tp / predicted : null,
      recall: support ? tp / support : null,
      f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null,
    };
  });
  const macro = {} as Average,
    weighted = {} as Average;
  for (const key of ["precision", "recall", "f1"] as const) {
    macro[key] = perClass.some((m) => m[key] == null)
      ? null
      : perClass.reduce((sum, m) => sum + m[key]!, 0) / classes.length;
    const supported = perClass.filter((m) => m.support > 0);
    weighted[key] =
      !n || supported.some((m) => m[key] == null)
        ? null
        : supported.reduce((sum, m) => sum + m.support * m[key]!, 0) / n;
  }
  const correct = perClass.reduce((sum, m) => sum + m.tp, 0),
    accuracy = n ? correct / n : null;
  return {
    n,
    perClass,
    macro,
    weighted,
    micro: { precision: accuracy, recall: accuracy, f1: accuracy },
    accuracy,
  };
}
export function classificationReports(
  c: Config,
  rows: Row[],
  rowNumbers = new Map(rows.map((r, i) => [r, i + 1])),
) {
  const k = c.classification || defaultClassification,
    reports: ClassificationReport[] = [],
    warnings: string[] = [];
  const fail = (message: string) => ({ reports: [], warnings: [message] });
  if (
    !k.label ||
    k.classes.length < 2 ||
    k.classes.length > 20 ||
    k.classes.some((v) => !v || v.length > 500) ||
    new Set(k.classes).size !== k.classes.length
  )
    return fail("请选择真实标签并明确 2–20 个不重复类别的顺序");
  if (
    k.input === "scores" &&
    (k.classes.length !== 2 ||
      !k.classes.includes(k.positive) ||
      !Number.isFinite(k.threshold))
  )
    return fail("分数阈值矩阵仅支持二分类，请指定有效正类和有限阈值");
  const visible = c.series.filter((s) => s.visible);
  if (visible.some((s) => k.input === "labels" && !s.prediction))
    return fail("请为每个可见模型选择预测标签列");
  const classes = new Set(k.classes);
  for (const r of rows) {
    if (present(r[k.label]) && !classes.has(String(r[k.label])))
      return fail("真实标签含未列入类别顺序的值，请明确添加该类别；未丢弃样本");
    if (
      k.input === "labels" &&
      visible.some(
        (s) =>
          present(r[s.prediction!]) && !classes.has(String(r[s.prediction!])),
      )
    )
      return fail("预测标签含未知类别，请添加类别或检查字段；未丢弃样本");
  }
  const groups = c.group ? [...new Set(rows.map((r) => r[c.group]))] : [""];
  if (groups.length * visible.length > 100)
    return fail("分类评估最多 100 个模型分组，请先过滤；未截断数据");
  for (const s of visible)
    for (const group of groups) {
      const selected = c.group
        ? rows.filter((r) => r[c.group] === group)
        : rows;
      const chosen = sampleSelection(
        c,
        selected,
        k.label,
        k.input === "labels" ? s.prediction! : s.y,
        k.input,
      );
      const counts = k.classes.map(() => k.classes.map(() => 0));
      for (const r of chosen.used) {
        const prediction =
          k.input === "labels"
            ? String(r[s.prediction!])
            : Number(r[s.y]) >= k.threshold
              ? k.positive
              : k.classes.find((v) => v !== k.positive)!;
        counts[k.classes.indexOf(String(r[k.label]))][
          k.classes.indexOf(prediction)
        ]++;
      }
      const m = matrixMetrics(counts, k.classes);
      const matrix = counts.map((row, i) =>
        row.map((value, j) => {
          const denominator =
            k.normalization === "count"
              ? 1
              : k.normalization === "true"
                ? m.perClass[i].support
                : k.normalization === "pred"
                  ? m.perClass[j].predicted
                  : m.n;
          return denominator ? value / denominator : null;
        }),
      );
      reports.push({
        seriesId: s.id,
        series: s.name,
        groupKey: JSON.stringify(group),
        group: c.group ? String(group ?? "缺失") : "全部",
        classes: [...k.classes],
        counts,
        matrix,
        ...m,
        excluded: selected.length - m.n,
        ownMissing: chosen.ownMissing,
        excludedByOthers: chosen.excludedByOthers,
        sampleRows: chosen.used.map((r) => rowNumbers.get(r)!),
      });
      if (selected.length !== m.n)
        warnings.push(
          `${s.name}：自身缺失 ${chosen.ownMissing} 行，共同样本额外排除 ${chosen.excludedByOthers} 行`,
        );
    }
  if (
    reports.some((r) =>
      r.perClass.some(
        (m) => m.precision == null || m.recall == null || m.f1 == null,
      ),
    )
  )
    warnings.push(
      "零分母指标显示未定义；macro 传播未定义值，weighted 只考虑有实际样本的类别，不自动补零",
    );
  return { reports, warnings };
}
