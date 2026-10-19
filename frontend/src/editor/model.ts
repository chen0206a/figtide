import type { Dataset } from "../lib/api";
export type Series = {
  id: string;
  y: string;
  name: string;
  color: string;
  opacity: number;
  width: number;
  dash: string;
  symbol: string;
  size: number;
  error: string;
  visible: boolean;
  band?: {
    enabled: boolean;
    lower: string;
    upper: string;
    opacity: number;
    label: string;
  };
};
export type Axis = {
  title: string;
  min: string;
  max: string;
  log: boolean;
  grid: boolean;
  dtick: string;
};
export type Distribution = {
  points: "all" | "outliers" | "none";
  quartileMethod: "linear" | "exclusive" | "inclusive";
  mean: boolean;
  innerBox: boolean;
  bandwidth: string;
  span: "hard" | "soft";
};
export type Facet = {
  mode: "none" | "series" | "field";
  field: string;
  columns: number;
  gapX: number;
  gapY: number;
  shareX: boolean;
  shareY: boolean;
  labels: boolean;
  titles: Record<string, string>;
};
export const defaultDistribution: Distribution = {
  points: "all",
  quartileMethod: "linear",
  mean: false,
  innerBox: true,
  bandwidth: "",
  span: "hard",
};
export const defaultFacet: Facet = {
  mode: "none",
  field: "",
  columns: 2,
  gapX: 90,
  gapY: 100,
  shareX: true,
  shareY: false,
  labels: true,
  titles: {},
};
export type Config = {
  schema_version: 1;
  datasetVersionId: number;
  type:
    | "line"
    | "bar"
    | "scatter"
    | "heatmap"
    | "box"
    | "violin"
    | "histogram"
    | "ecdf"
    | "roc"
    | "pr";
  evaluation?: {
    algorithm: "binary-ranking-v1";
    missing: "exclude";
    label: string;
    positive: string;
    threshold: number;
    baseline: boolean;
    rocXTitle: string;
    rocYTitle: string;
    prXTitle: string;
    prYTitle: string;
  };
  publication?: {
    enabled: boolean;
    widthMm: number;
    fontPt: number;
    dpi: number;
  };
  empirical?: {
    bins: number;
    start: string;
    end: string;
    normalization: "count" | "probability" | "density";
    valueTitle: string;
    resultTitle: string;
  };
  heatmap?: {
    palette: "series" | "viridis" | "cividis" | "blueRed";
    min: string;
    max: string;
    center: string;
    labels: boolean;
  };
  distribution?: Distribution;
  facet?: Facet;
  x: string;
  group: string;
  heatY: string;
  heatZ: string;
  series: Series[];
  axes: { x: Axis; y: Axis };
  style: {
    title: string;
    font: string;
    fontSize: number;
    bold: boolean;
    width: number;
    height: number;
    background: string;
    top: number;
    bottom: number;
    left: number;
    right: number;
    preset: string;
  };
  legend: { show: boolean; position: string; orientation: "h" | "v" };
  annotations: { id: string; text: string; x: number; y: number }[];
  transforms: {
    op: "filter";
    field: string;
    operator: "eq" | "gte" | "lte";
    value: string;
  }[];
};
export const palettes: Record<string, string[]> = {
  "Clean Academic": ["#6758ce", "#269e95", "#d99641", "#db6d87", "#518ac0"],
  "Nature-inspired": ["#3b5488", "#00a087", "#e64b35", "#f39b7f", "#8491b4"],
  "Modern Research": ["#735fe8", "#21a7a0", "#eaab54", "#df729a", "#62a0db"],
  "Okabe–Ito": [
    "#0072b2",
    "#e69f00",
    "#009e73",
    "#cc79a7",
    "#d55e00",
    "#56b4e9",
    "#000000",
    "#f0e442",
  ],
};
export const defaultPublication = {
  enabled: false,
  widthMm: 183,
  fontPt: 8,
  dpi: 300,
};
export const defaultEvaluation: NonNullable<Config["evaluation"]> = {
  algorithm: "binary-ranking-v1",
  missing: "exclude",
  label: "",
  positive: "1",
  threshold: 0.5,
  baseline: true,
  rocXTitle: "",
  rocYTitle: "",
  prXTitle: "",
  prYTitle: "",
};
export const defaultBand: NonNullable<Series["band"]> = {
  enabled: false,
  lower: "",
  upper: "",
  opacity: 0.18,
  label: "实际区间",
};
export const defaultEmpirical: NonNullable<Config["empirical"]> = {
  bins: 20,
  start: "",
  end: "",
  normalization: "count",
  valueTitle: "",
  resultTitle: "",
};
export const defaultHeatmap: NonNullable<Config["heatmap"]> = {
  palette: "series",
  min: "",
  max: "",
  center: "",
  labels: false,
};
export function seriesEncoding(palette: string, i: number) {
  const colors = palettes[palette] || palettes["Clean Academic"];
  const cycle = Math.floor(i / colors.length);
  return {
    color: colors[i % colors.length],
    dash: ["solid", "dash", "dot", "dashdot"][cycle % 4],
    symbol: ["circle", "square", "diamond", "triangle-up"][cycle % 4],
  };
}
export const makeSeries = (y: string, i = 0): Series => ({
  id: crypto.randomUUID(),
  y,
  name: y,
  ...seriesEncoding("Clean Academic", i),
  opacity: 1,
  width: 2.5,
  size: 6,
  error: "",
  visible: true,
});
export function defaults(d: Dataset): Config {
  const nums = d.fields.filter((f) => f.type === "number").map((f) => f.name);
  const x =
    d.fields.find((f) => f.role === "x")?.name || d.fields[0]?.name || "";
  const ys = d.fields
    .filter((f) => f.role === "y" && f.type === "number")
    .map((f) => f.name);
  const error =
    d.fields.find((f) => f.role === "error" && f.type === "number")?.name || "";
  return {
    schema_version: 1,
    datasetVersionId: d.id,
    type: d.source_meta?.chart_type || "line",
    distribution: { ...defaultDistribution },
    facet: { ...defaultFacet, titles: {} },
    publication: { ...defaultPublication },
    empirical: { ...defaultEmpirical },
    heatmap: { ...defaultHeatmap },
    x,
    group: d.fields.find((f) => f.role === "group")?.name || "",
    heatY: d.fields[1]?.name || "",
    heatZ: nums.at(-1) || "",
    series: (ys.length
      ? ys
      : [nums.find((n) => n !== x && n !== error) || nums[0] || ""]
    ).map((y, i) => ({
      ...makeSeries(y, i),
      name: d.source_meta?.metric || y,
      error: ys.length === 1 ? error : "",
    })),
    axes: {
      x: {
        title: d.source_meta ? "实验" : x || "X",
        min: "",
        max: "",
        log: false,
        grid: false,
        dtick: "",
      },
      y: {
        title:
          d.source_meta?.metric ||
          ys[0] ||
          nums.find((n) => n !== x && n !== error) ||
          nums[0] ||
          "Y",
        min: "",
        max: "",
        log: false,
        grid: true,
        dtick: "",
      },
    },
    style: {
      title: d.source_meta
        ? `${d.source_meta.metric} · 实验对比`
        : "Model performance",
      font: "Arial",
      fontSize: 14,
      bold: false,
      width: 760,
      height: 500,
      background: "#ffffff",
      top: 70,
      bottom: 70,
      left: 75,
      right: 35,
      preset: "Clean Academic",
    },
    legend: { show: true, position: "top", orientation: "h" },
    annotations: [],
    transforms: [],
  };
}
export type History = { past: Config[]; present: Config; future: Config[] };
export function historyReducer(
  h: History,
  a: { type: "edit" | "reset" | "undo" | "redo"; value?: Config },
): History {
  if (a.type === "reset") return { past: [], present: a.value!, future: [] };
  if (a.type === "undo" && h.past.length)
    return {
      past: h.past.slice(0, -1),
      present: h.past.at(-1)!,
      future: [h.present, ...h.future],
    };
  if (a.type === "redo" && h.future.length)
    return {
      past: [...h.past, h.present],
      present: h.future[0],
      future: h.future.slice(1),
    };
  if (
    a.type === "edit" &&
    JSON.stringify(h.present) !== JSON.stringify(a.value)
  )
    return {
      past: [...h.past.slice(-99), h.present],
      present: a.value!,
      future: [],
    };
  return h;
}
