import {
  traceEncoding,
  groupTraceName,
  type EncodingContext,
} from "./encoding";
import type { Dataset } from "../lib/api";
import { defaultEmpirical, type Config } from "./model";
import type { SampleSummary } from "./distribution";
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function empiricalTraces(
  c: Config,
  rows: Dataset["rows"],
  encoding?: EncodingContext,
) {
  const e = c.empirical || defaultEmpirical,
    traces: any[] = [],
    warnings: string[] = [],
    summaries: SampleSummary[] = [];
  const groups = c.group ? [...new Set(rows.map((r) => r[c.group]))] : [""];
  if (groups.length * c.series.filter((s) => s.visible).length > 200)
    return {
      traces,
      summaries,
      warnings: ["经验分布最多 200 条分组轨迹，请先过滤数据"],
    };
  let autoMin = Infinity,
    autoMax = -Infinity;
  for (const row of rows)
    for (const series of c.series.filter((s) => s.visible)) {
      const v = row[series.y];
      if (
        typeof v === "number" &&
        Number.isFinite(v) &&
        (!c.axes.x.log || v > 0)
      ) {
        autoMin = Math.min(autoMin, v);
        autoMax = Math.max(autoMax, v);
      }
    }
  for (const s of c.series.filter((s) => s.visible))
    for (const group of groups) {
      const paint = traceEncoding(c, s, group, groups, encoding);
      const selected = c.group
        ? rows.filter((r) => r[c.group] === group)
        : rows;
      const finite = selected
        .map((r) => r[s.y])
        .filter(
          (v): v is number => typeof v === "number" && Number.isFinite(v),
        );
      let values = finite
        .filter((v) => !c.axes.x.log || v > 0)
        .sort((a, b) => a - b);
      const name = s.name + (c.group ? ` · ${group ?? "缺失分组"}` : "");
      const legendName = groupTraceName(encoding?.config || c, s, group);
      let excluded = finite.length - values.length;
      if (excluded)
        warnings.push(
          "对数 X 轴排除了非正观测，分布按剩余观测重新计算；原数据未修改",
        );
      if (c.type === "histogram" && values.length) {
        const low = e.start.trim() === "" ? autoMin : Number(e.start),
          high = e.end.trim() === "" ? autoMax : Number(e.end);
        let start = low,
          end = high;
        if (start === end && !e.start.trim() && !e.end.trim()) {
          start -= 0.5;
          end += 0.5;
        }
        const width = (end - start) / e.bins;
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          !Number.isFinite(width) ||
          width <= 0 ||
          start + width === start
        ) {
          warnings.push("分箱范围无效或数值精度不足，请指定可用的起止值");
          continue;
        }
        const inside = values.filter((v) => v >= start && v <= end);
        if (inside.length !== values.length)
          warnings.push(
            `${name} 有 ${values.length - inside.length} 个观测超出分箱范围；未覆盖原始数据`,
          );
        excluded += values.length - inside.length;
        values = inside;
        if (values.length) {
          const counts = Array<number>(e.bins).fill(0);
          for (const value of values)
            counts[Math.min(e.bins - 1, Math.floor((value - start) / width))]++;
          traces.push({
            type: "bar",
            textposition: "none",
            name: escape(legendName),
            legendgroup: s.id + JSON.stringify(group),
            x: counts.map((_, i) => start + (i + 0.5) * width),
            y: counts.map((n) =>
              e.normalization === "count"
                ? n
                : e.normalization === "probability"
                  ? n / values.length
                  : n / (values.length * width),
            ),
            width:
              (width * 0.9) /
              (groups.length * c.series.filter((s) => s.visible).length),
            opacity: s.opacity,
            marker: {
              color: paint.color,
              line: { color: paint.color, width: 0.5 },
            },
            customdata: counts.map(() => s.id),
            text: counts.map(
              (n, i) =>
                `${start + i * width} ≤ x ${i === e.bins - 1 ? "≤" : "<"} ${start + (i + 1) * width}<br>n=${n}`,
            ),
            hovertemplate: "%{text}<br>值：%{y}<extra>%{fullData.name}</extra>",
          });
        }
      } else if (c.type === "ecdf" && values.length) {
        const x: number[] = [values[0]],
          y: number[] = [0];
        for (let i = 0; i < values.length;) {
          let end = i + 1;
          while (end < values.length && values[end] === values[i]) end++;
          x.push(values[i]);
          y.push(end / values.length);
          i = end;
        }
        if (c.axes.y.log) {
          x.shift();
          y.shift();
          warnings.push(
            "ECDF 对数 Y 轴不显示零概率起点；累计概率仍按全部有效观测计算",
          );
        }
        traces.push({
          type: "scatter",
          mode: "lines+markers",
          name: escape(legendName),
          legendgroup: s.id + JSON.stringify(group),
          x,
          y,
          customdata: x.map(() => s.id),
          line: {
            color: paint.color,
            width: s.width,
            dash: paint.dash,
            shape: "hv",
          },
          marker: { color: paint.color, size: s.size, symbol: paint.symbol },
          opacity: s.opacity,
          hovertemplate:
            "%{x}<br>累计概率：%{y:.4f}<extra>%{fullData.name}</extra>",
        });
      }
      if (!values.length)
        warnings.push(`${name} 没有范围内的有效观测，未绘制分布`);
      summaries.push({
        panel: "",
        series: name,
        category: c.group ? String(group ?? "缺失分组") : "整体",
        n: values.length,
        missing: selected.length - finite.length,
        excluded,
        min: values[0] ?? null,
        max: values.at(-1) ?? null,
      });
    }
  if (c.series.some((s) => s.visible && s.error))
    warnings.push("直方图与 ECDF 不使用误差列；原映射保留");
  return { traces, warnings, summaries };
}
