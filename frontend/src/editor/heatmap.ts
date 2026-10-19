import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { defaultHeatmap } from "./model";
import { interpolate, labelColor, scientificScales } from "./color";
const escape = (s: unknown) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
/** SVG rectangles, rather than Plotly's raster heatmap trace, keep exported cells vector. */
export type VectorPlot = {
  warnings: string[];
  shapes: any[];
  traces: any[];
  annotations: any[];
  xaxis: Record<string, unknown>;
  yaxis: Record<string, unknown>;
};
export function vectorHeatmap(c: Config, rows: Dataset["rows"]): VectorPlot {
  const xs = [...new Set(rows.map((r) => r[c.x]).filter((v) => v != null))];
  const ys = [...new Set(rows.map((r) => r[c.heatY]).filter((v) => v != null))];
  const warnings: string[] = [];
  const shapes: any[] = [];
  const traces: any[] = [];
  const annotations: any[] = [];
  const h = c.heatmap || defaultHeatmap;
  if (xs.length * ys.length > 10000)
    return {
      warnings: ["热力图最多支持 10000 个网格，请先过滤数据"],
      shapes,
      traces,
      annotations,
      xaxis: {},
      yaxis: {},
    };
  const values = new Map<string, number | null>();
  for (const r of rows) {
    if (r[c.x] == null || r[c.heatY] == null) continue;
    const key = JSON.stringify([r[c.x], r[c.heatY]]);
    if (values.has(key))
      return {
        warnings: ["热力图存在重复 X/Y 坐标：请先过滤数据；未进行静默聚合"],
        shapes,
        traces,
        annotations,
        xaxis: {},
        yaxis: {},
      };
    values.set(key, typeof r[c.heatZ] === "number" ? Number(r[c.heatZ]) : null);
  }
  const numbers = [...values.values()].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (!numbers.length)
    return {
      warnings: ["热力图没有可用数值，请检查 Z 字段映射"],
      shapes,
      traces,
      annotations,
      xaxis: {},
      yaxis: {},
    };
  let min = h.min.trim() ? Number(h.min) : Math.min(...numbers),
    max = h.max.trim() ? Number(h.max) : Math.max(...numbers);
  const center = h.center.trim() ? Number(h.center) : undefined;
  if (center !== undefined) {
    if (!h.min.trim()) min = Math.min(min, center - 0.5);
    if (!h.max.trim()) max = Math.max(max, center + 0.5);
  }
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min > max ||
    (min === max && (h.min.trim() || h.max.trim())) ||
    (center !== undefined &&
      (!Number.isFinite(center) || center <= min || center >= max))
  )
    return {
      warnings: ["热力图色阶无效：需最小值 < 中心值 < 最大值（中心可留空）"],
      shapes,
      traces,
      annotations,
      xaxis: {},
      yaxis: {},
    };
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  if (numbers.some((n) => n < min || n > max))
    warnings.push("部分数值超出固定色阶，颜色已截到端点；原始数值不变");
  const end = c.series[0]?.color || "#6558d9";
  if (h.labels && xs.length * ys.length > 400)
    warnings.push("数值标注最多 400 个单元格；当前仅显示色块，未截断数据");
  const stops =
    h.palette === "series"
      ? ["#f4f2ff", "#a69be4", end]
      : scientificScales[h.palette];
  const color = (n: number) => {
    const t =
      center === undefined
        ? (n - min) / (max - min)
        : n <= center
          ? (0.5 * (n - min)) / (center - min)
          : 0.5 + (0.5 * (n - center)) / (max - center);
    return interpolate(stops, t);
  };
  const px: number[] = [],
    py: number[] = [],
    z: number[] = [],
    labels: string[] = [];
  ys.forEach((y, j) =>
    xs.forEach((x, i) => {
      const v = values.get(JSON.stringify([x, y]));
      if (v == null) return;
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "y",
        x0: i - 0.5,
        x1: i + 0.5,
        y0: j - 0.5,
        y1: j + 0.5,
        line: { width: 0 },
        fillcolor: color(v),
        opacity: c.series[0]?.opacity ?? 1,
        layer: "below",
      });
      px.push(i);
      py.push(j);
      z.push(v);
      labels.push(`${escape(x)} · ${escape(y)}<br>${escape(c.heatZ)}: ${v}`);
      if (h.labels && xs.length * ys.length <= 400)
        annotations.push({
          x: i,
          y: j,
          xref: "x",
          yref: "y",
          text: String(Number(v.toPrecision(4))),
          showarrow: false,
          font: {
            size: c.style.fontSize,
            color: labelColor(
              color(v),
              c.style.background,
              c.series[0]?.opacity ?? 1,
            ),
          },
        });
    }),
  );
  traces.push({
    type: "scatter",
    meta: "vector-heatmap",
    mode: "markers",
    x: px,
    y: py,
    text: labels,
    customdata: px.map(() => c.series[0]?.id),
    hovertemplate: "%{text}<extra></extra>",
    showlegend: false,
    marker: {
      size: 1,
      opacity: 0,
      color: z,
      cmin: min === max ? min - 0.5 : min,
      cmax: min === max ? max + 0.5 : max,
      colorscale: stops.map((s, i) => [
        center === undefined
          ? i / (stops.length - 1)
          : i <= (stops.length - 1) / 2
            ? ((i / ((stops.length - 1) / 2)) * (center - min)) / (max - min)
            : (center - min) / (max - min) +
              (((i - (stops.length - 1) / 2) / ((stops.length - 1) / 2)) *
                (max - center)) /
                (max - min),
        s,
      ]),
      showscale: true,
      colorbar: {
        thickness: 12,
        outlinewidth: 0,
        title: { text: escape(c.heatZ) },
      },
    },
  });
  if (c.axes.x.log || c.axes.y.log)
    warnings.push("热力图使用离散分类轴，对数设置保留供其他图表使用");
  return {
    warnings,
    shapes,
    traces,
    annotations,
    xaxis: {
      type: "linear",
      tickmode: "array",
      tickvals: xs.map((_, i) => i),
      ticktext: xs.map(escape),
      range: [-0.5, xs.length - 0.5],
      autorange: false,
      showgrid: false,
    },
    yaxis: {
      type: "linear",
      tickmode: "array",
      tickvals: ys.map((_, i) => i),
      ticktext: ys.map(escape),
      range: [-0.5, ys.length - 0.5],
      autorange: false,
      showgrid: false,
    },
  };
}
