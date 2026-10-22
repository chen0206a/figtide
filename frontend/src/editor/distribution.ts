import {
  traceEncoding,
  groupTraceName,
  type EncodingContext,
} from "./encoding";
import type { Dataset } from "../lib/api";
import { defaultDistribution, type Config } from "./model";

export type SampleSummary = {
  panel: string;
  series: string;
  category: string;
  n: number;
  missing: number;
  excluded: number;
  min: number | null;
  max: number | null;
};
const escape = (s: unknown) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function distributionTraces(
  c: Config,
  rows: Dataset["rows"],
  encoding?: EncodingContext,
) {
  const options = c.distribution || defaultDistribution;
  const traces: any[] = [],
    warnings: string[] = [],
    summaries: SampleSummary[] = [];
  if (c.axes.x.log)
    warnings.push("分布图 X 轴为类别；对数 X 设置保留供其他图表使用");
  if (c.series.some((s) => s.visible && s.error))
    warnings.push(
      "分布图由真实观测计算箱体与密度，不使用误差列；误差映射已保留",
    );
  const omittedX = rows.filter((r) => r[c.x] == null).length;
  if (omittedX)
    warnings.push(`${omittedX} 行缺少 X 类别，未参与分布；原数据未修改`);
  if (
    new Set(rows.map((r) => r[c.x]).filter((value) => value != null)).size >
      100 ||
    (c.group && new Set(rows.map((r) => r[c.group])).size > 50)
  )
    return {
      traces,
      summaries,
      warnings: [
        ...warnings,
        "分布图最多 100 个 X 类别、50 个分组；请映射类别字段或先过滤数据",
      ],
    };
  for (const s of c.series.filter((s) => s.visible)) {
    const groups = c.group ? [...new Set(rows.map((r) => r[c.group]))] : [""];
    for (const group of groups) {
      const paint = traceEncoding(c, s, group, groups, encoding);
      const selected = rows.filter(
        (r) => r[c.x] != null && (!c.group || r[c.group] === group),
      );
      const categories = [...new Set(selected.map((r) => r[c.x]))];
      const validRows: Dataset["rows"] = [],
        sparseRows: Dataset["rows"] = [];
      const name = s.name + (c.group ? ` · ${group ?? "缺失分组"}` : "");
      const legendName = groupTraceName(encoding?.config || c, s, group);
      for (const category of categories) {
        const sample = selected.filter((r) => r[c.x] === category);
        const finite = sample.filter(
          (r) => typeof r[s.y] === "number" && Number.isFinite(r[s.y]),
        );
        const usable = finite.filter(
          (r) => !c.axes.y.log || Number(r[s.y]) > 0,
        );
        if (usable.length < finite.length)
          warnings.push("对数 Y 轴排除了非正观测；原数据未修改");
        const values = usable.map((r) => Number(r[s.y]));
        summaries.push({
          panel: "",
          series: name,
          category: String(category),
          n: values.length,
          missing: sample.length - finite.length,
          excluded: finite.length - usable.length,
          min: values.length ? Math.min(...values) : null,
          max: values.length ? Math.max(...values) : null,
        });
        if (!values.length) {
          warnings.push(`${name} / ${category} 没有有效观测，未绘制分布`);
        } else if (
          c.type === "violin" &&
          (values.length < 3 || new Set(values).size < 2)
        ) {
          warnings.push(
            `${name} / ${category} 样本不足或为常量：${options.points === "all" ? "仅显示真实观测点，不估计密度" : "不估计密度；未开启全部观测点，当前组不绘制"}`,
          );
          if (options.points === "all") sparseRows.push(...usable);
        } else {
          if (values.length < 3)
            warnings.push(
              `${name} / ${category} 仅 ${values.length} 个观测，箱体解释需谨慎`,
            );
          validRows.push(...usable);
        }
      }
      const common = {
        name: escape(legendName),
        legendgroup: s.id + ":" + JSON.stringify(group),
        opacity: s.opacity,
        line: { color: paint.color, width: s.width },
        marker: { color: paint.color, size: s.size, symbol: paint.symbol },
      };
      if (validRows.length)
        traces.push({
          ...common,
          type: c.type,
          x: validRows.map((r) => escape(r[c.x])),
          y: validRows.map((r) => r[s.y]),
          customdata: validRows.map(() => s.id),
          quartilemethod: options.quartileMethod,
          jitter: 0,
          pointpos: 0,
          ...(c.type === "box"
            ? {
                boxpoints: options.points === "none" ? false : options.points,
                boxmean: options.mean,
              }
            : {
                points: options.points === "none" ? false : options.points,
                box: { visible: options.innerBox },
                meanline: { visible: options.mean },
                bandwidth:
                  options.bandwidth.trim() &&
                  Number.isFinite(Number(options.bandwidth)) &&
                  Number(options.bandwidth) > 0
                    ? Number(options.bandwidth)
                    : undefined,
                spanmode: options.span,
                scalemode: "width",
                scalegroup: "distribution-width",
              }),
        });
      if (sparseRows.length)
        traces.push({
          ...common,
          type: "scatter",
          mode: "markers",
          showlegend: !validRows.length,
          x: sparseRows.map((r) => escape(r[c.x])),
          y: sparseRows.map((r) => r[s.y]),
          customdata: sparseRows.map(() => s.id),
          hovertemplate: "%{x}<br>%{y}<extra>真实观测 · 未估计密度</extra>",
        });
    }
  }
  if (
    options.bandwidth.trim() &&
    (!Number.isFinite(Number(options.bandwidth)) ||
      Number(options.bandwidth) <= 0)
  )
    warnings.push("密度带宽无效，预览使用自动带宽；保存前请填写正数或清空");
  return { traces, warnings, summaries };
}
