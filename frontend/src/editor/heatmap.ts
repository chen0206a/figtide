import type { Config } from "./model";
import type { Dataset } from "../lib/api";
const escape = (s: unknown) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
/** SVG rectangles, rather than Plotly's raster heatmap trace, keep exported cells vector. */
export function vectorHeatmap(c: Config, rows: Dataset["rows"]) {
  const xs = [...new Set(rows.map((r) => r[c.x]).filter((v) => v != null))];
  const ys = [...new Set(rows.map((r) => r[c.heatY]).filter((v) => v != null))];
  const warnings: string[] = [];
  const shapes: any[] = [];
  const traces: any[] = [];
  if (xs.length * ys.length > 10000)
    return {
      warnings: ["热力图最多支持 10000 个网格，请先过滤数据"],
      shapes,
      traces,
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
      xaxis: {},
      yaxis: {},
    };
  const min = Math.min(...numbers),
    max = Math.max(...numbers);
  const end = c.series[0]?.color || "#6558d9";
  const stops = ["#f4f2ff", "#a69be4", end];
  const color = (n: number) => {
    const t = max === min ? 0.5 : (n - min) / (max - min);
    const index = t < 0.5 ? 0 : 1;
    const ratio = index === 0 ? t * 2 : (t - 0.5) * 2;
    const a = stops[index].slice(1),
      b = stops[index + 1].slice(1);
    return (
      "#" +
      [0, 2, 4]
        .map((i) =>
          Math.round(
            parseInt(a.slice(i, i + 2), 16) * (1 - ratio) +
              parseInt(b.slice(i, i + 2), 16) * ratio,
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
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
      colorscale: stops.map((s, i) => [i / 2, s]),
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
