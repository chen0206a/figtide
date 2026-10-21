import type { Config } from "./model";
import type { StyleProfile } from "./reuse";

export const stylePresets = [
  {
    key: "Clean Academic",
    name: "清晰学术",
    description: "蓝青实线、小圆点与轻网格，适合日常结果对比。",
    traits: ["蓝青配色", "轻网格", "顶部图例"],
    colors: ["#3568b5", "#228b83", "#d89042", "#a56991", "#708090"],
    dashes: ["solid"],
    symbols: ["circle"],
    size: 4,
    legend: { position: "top", orientation: "h" },
    heatmap: "series",
    font: "Arial",
    fontSize: 14,
    width: 2.5,
    grid: true,
  },
  {
    key: "Nature-inspired",
    name: "极简印刷",
    description: "低饱和配色、细线和虚实区分，减少网格干扰。",
    traits: ["低饱和", "虚实线", "无网格"],
    colors: ["#303b4a", "#976548", "#587c70", "#7a7190", "#85816d"],
    dashes: ["solid", "dash", "dot"],
    symbols: ["circle", "square", "diamond"],
    size: 4,
    legend: { position: "top", orientation: "h" },
    heatmap: "cividis",
    font: "Arial",
    fontSize: 13,
    width: 1.8,
    grid: false,
  },
  {
    key: "Modern Research",
    name: "现代研究",
    description: "高对比色、粗线和大标记，适合屏幕阅读与汇报。",
    traits: ["高对比", "粗线大点", "右侧图例"],
    colors: ["#2563eb", "#e7843b", "#15958c", "#ad59a3", "#537187"],
    dashes: ["solid"],
    symbols: ["circle"],
    size: 8,
    legend: { position: "right", orientation: "v" },
    heatmap: "viridis",
    font: "Helvetica",
    fontSize: 16,
    width: 3.5,
    grid: true,
  },
  {
    key: "Okabe–Ito",
    name: "色觉友好",
    description: "结合蓝橙配色、线型与点形区分序列。",
    traits: ["蓝橙配色", "点形区分", "底部图例"],
    colors: [
      "#0072b2",
      "#e69f00",
      "#009e73",
      "#cc79a7",
      "#d55e00",
      "#56b4e9",
      "#000000",
      "#f0e442",
    ],
    dashes: ["solid", "dash", "dot", "dashdot"],
    symbols: ["circle", "square", "diamond", "triangle-up"],
    size: 6,
    legend: { position: "bottom", orientation: "h" },
    heatmap: "cividis",
    font: "Arial",
    fontSize: 14,
    width: 2.5,
    grid: false,
  },
] as const;

function definition(key: string) {
  const p = stylePresets.find((v) => v.key === key);
  if (!p) throw new Error("未知图表样式");
  return p;
}
function encoding(p: ReturnType<typeof definition>, i: number) {
  return {
    color: p.colors[i % p.colors.length],
    dash: p.dashes[i % p.dashes.length],
    symbol: p.symbols[i % p.symbols.length],
    size: p.size,
    width: p.width,
  };
}

/** Fixed three-series design sample; never reads or changes experimental observations. */
export function presetThumbnail(key: string): StyleProfile {
  const p = definition(key);
  return {
    schema_version: 1,
    style: {
      preset: key,
      font: p.font,
      fontSize: p.fontSize,
      bold: false,
      background: "#ffffff",
      width: 760,
      height: 500,
      top: 60,
      bottom: 65,
      left: 65,
      right: 35,
    },
    axes: { x: { grid: false }, y: { grid: p.grid } },
    legend: { ...p.legend, show: true },
    series: [0, 1, 2].map((i) => ({ ...encoding(p, i), opacity: 1 })),
    heatmap: { palette: p.heatmap, labels: false },
  };
}

export function applyPreset(c: Config, key: string): Config {
  const p = definition(key);
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
    legend: { ...c.legend, ...p.legend },
    ...(c.heatmap ? { heatmap: { ...c.heatmap, palette: p.heatmap } } : {}),
    series: c.series.map((s, i) => ({
      ...s,
      ...encoding(p, i),
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
