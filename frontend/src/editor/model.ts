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
};
export type Axis = {
  title: string;
  min: string;
  max: string;
  log: boolean;
  grid: boolean;
  dtick: string;
};
export type Config = {
  schema_version: 1;
  datasetVersionId: number;
  type: "line" | "bar" | "scatter" | "heatmap";
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
};
export const makeSeries = (y: string, i = 0): Series => ({
  id: crypto.randomUUID(),
  y,
  name: y,
  color: palettes["Clean Academic"][i % 5],
  opacity: 1,
  width: 2.5,
  dash: "solid",
  symbol: "circle",
  size: 6,
  error: "",
  visible: true,
});
export function defaults(d: Dataset): Config {
  const nums = d.fields.filter((f) => f.type === "number").map((f) => f.name);
  return {
    schema_version: 1,
    datasetVersionId: d.id,
    type: "line",
    x: d.fields[0]?.name || "",
    group: "",
    heatY: d.fields[1]?.name || "",
    heatZ: nums.at(-1) || "",
    series: [makeSeries(nums[1] || nums[0] || "")],
    axes: {
      x: {
        title: d.fields[0]?.name || "X",
        min: "",
        max: "",
        log: false,
        grid: false,
        dtick: "",
      },
      y: {
        title: nums[1] || nums[0] || "Y",
        min: "",
        max: "",
        log: false,
        grid: true,
        dtick: "",
      },
    },
    style: {
      title: "Model performance",
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
