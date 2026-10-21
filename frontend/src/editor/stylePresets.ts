import { palettes, seriesEncoding, type Config } from "./model";
import type { StyleProfile } from "./reuse";

export const stylePresets = [
  {
    key: "Clean Academic",
    name: "清晰学术",
    description: "轻网格、简洁线条，让趋势成为重点。",
    font: "Arial",
    fontSize: 14,
    width: 2.5,
    grid: true,
  },
  {
    key: "Nature-inspired",
    name: "经典期刊",
    description: "紧凑字体、克制线宽，适合并列比较。",
    font: "Arial",
    fontSize: 13,
    width: 1.8,
    grid: false,
  },
  {
    key: "Modern Research",
    name: "现代研究",
    description: "更醒目的文字和线条，适合屏幕展示。",
    font: "Helvetica",
    fontSize: 16,
    width: 3,
    grid: true,
  },
  {
    key: "Okabe–Ito",
    name: "色觉友好",
    description: "结合蓝橙配色、线型与点形区分序列。",
    font: "Arial",
    fontSize: 14,
    width: 2.5,
    grid: false,
  },
] as const;

export function applyPreset(c: Config, key: string): Config {
  const p = stylePresets.find((v) => v.key === key);
  if (!p || !palettes[key]) throw new Error("未知图表样式");
  return {
    ...c,
    style: {
      ...c.style,
      preset: key,
      font: p.font,
      fontSize: p.fontSize,
      bold: false,
    },
    axes: { x: { ...c.axes.x, grid: false }, y: { ...c.axes.y, grid: p.grid } },
    series: c.series.map((s, i) => ({
      ...s,
      ...seriesEncoding(key, i),
      width: p.width,
    })),
  };
}

export function styleProfile(c: Config): StyleProfile {
  // Same appearance contract as Java; never persist field bindings or statistics.
  const { title: _title, ...style } = c.style;
  return {
    schema_version: 1,
    style,
    axes: { x: { grid: c.axes.x.grid }, y: { grid: c.axes.y.grid } },
    legend: { ...c.legend },
    series: c.series.map(
      ({ color, opacity, width, dash, symbol, size, band }) => ({
        color,
        opacity,
        width,
        dash,
        symbol,
        size,
        ...(band ? { band: { opacity: band.opacity } } : {}),
      }),
    ),
    ...(c.publication ? { publication: { ...c.publication } } : {}),
    ...(c.heatmap
      ? { heatmap: { palette: c.heatmap.palette, labels: c.heatmap.labels } }
      : {}),
  };
}
