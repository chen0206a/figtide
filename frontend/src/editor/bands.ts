import type { Config, Series } from "./model";
type Row = Record<string, string | number | null>;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
/** Independent closed polygons prevent interpolation across missing bounds. */
export function bandTraces(
  c: Config,
  s: Series,
  rows: Row[],
  legendgroup: string,
) {
  const b = s.band,
    traces: any[] = [],
    warnings: string[] = [];
  if (c.type !== "line" || !b?.enabled) return { traces, warnings };
  if (!b.lower || !b.upper)
    return { traces, warnings: [`${s.name}：请选择实际区间上下界列`] };
  let last = -Infinity;
  for (const r of rows) {
    const x = r[c.x],
      low = r[b.lower],
      high = r[b.upper];
    if (finite(low) && finite(high) && low > high)
      return { traces, warnings: [`${s.name}：下界大于上界，区间带未显示`] };
    if (x != null && !finite(x))
      return {
        traces,
        warnings: [`${s.name}：区间带要求数值 X，未显示区间带`],
      };
    if (finite(x)) {
      if (x <= last)
        return {
          traces,
          warnings: [`${s.name}：X 须按原始行顺序严格递增，未排序或显示区间带`],
        };
      last = x;
    }
  }
  let segment: Row[] = [],
    missing = 0;
  const flush = () => {
    if (segment.length >= 2) {
      const reverse = [...segment].reverse();
      const rgb = [1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16));
      traces.push({
        type: "scatter",
        mode: "lines",
        x: [...segment.map((r) => r[c.x]), ...reverse.map((r) => r[c.x])],
        y: [
          ...segment.map((r) => r[b.upper]),
          ...reverse.map((r) => r[b.lower]),
        ],
        fill: "toself",
        fillcolor: `rgba(${rgb.join(",")},${b.opacity})`,
        line: { width: 0, color: s.color },
        opacity: s.opacity,
        showlegend: false,
        legendgroup,
        name: b.label
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;"),
        customdata: Array(segment.length * 2).fill(s.id),
        hoverinfo: "name",
        connectgaps: false,
      });
    }
    segment = [];
  };
  for (const r of rows) {
    const low = r[b.lower],
      high = r[b.upper];
    if (
      !finite(r[c.x]) ||
      !finite(r[s.y]) ||
      !finite(low) ||
      !finite(high) ||
      (c.axes.x.log && Number(r[c.x]) <= 0) ||
      (c.axes.y.log && (low <= 0 || high <= 0 || Number(r[s.y]) <= 0))
    ) {
      missing++;
      flush();
    } else segment.push(r);
  }
  flush();
  if (missing)
    warnings.push(
      `${s.name}：${missing} 行区间数据缺失或不适用于对数轴，区间带在此断开`,
    );
  return { traces, warnings };
}
