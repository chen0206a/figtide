import { defaults, type Config } from "./model";
import type { Dataset } from "../lib/api";
export type ToolOperation = {
  tool: string;
  arguments: Record<string, string | number | boolean | null>;
};
export type ToolRule = {
  type: string | string[];
  enum?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
  exclusiveMinimum?: number;
};
export type ToolSpec = {
  name: string;
  label: string;
  category?: "presentation" | "structure";
  input_schema: {
    properties: Record<string, ToolRule>;
    required: string[];
    minProperties: number;
  };
};
export type ToolCatalog = {
  protocol_version: 1;
  config_schema_version: 1;
  execution: "preview-only";
  categories?: { id: string; label: string }[];
  tools: ToolSpec[];
};
export type ToolPreview = {
  processing?: {source_dataset_version_id:number;name:string;rules:unknown;preview_hash:string};
  preview_dataset?: import('../lib/api').Dataset;
  deep_review?: string;
  protocol_version: 1;
  config: Config;
  changes: { path: string; before: unknown; after: unknown }[];
  operation_count: number;
  base_revision: number;
  source: { dataset_version_id: number; sha256: string };
};
export const toolFieldNames: Record<string, string> = {
  title: "标题",
  rocXTitle: "ROC 横轴标题",
  rocYTitle: "ROC 纵轴标题",
  prXTitle: "PR 横轴标题",
  prYTitle: "PR 纵轴标题",
  xTitle: "横轴标题",
  yTitle: "纵轴标题",
  valueTitle: "观测轴标题",
  resultTitle: "结果轴标题",
  font: "字体",
  fontSize: "字号（px）",
  fontPt: "成品字号（pt）",
  bold: "字重",
  axis: "坐标轴",
  min: "最小值",
  max: "最大值",
  dtick: "刻度间隔",
  log: "坐标类型",
  grid: "网格线",
  show: "显示图例",
  position: "图例位置",
  orientation: "图例方向",
  seriesId: "目标序列",
  name: "序列名称",
  color: "颜色",
  opacity: "透明度",
  width: "宽度",
  dash: "线型",
  symbol: "点形",
  size: "点大小",
  visible: "显示序列",
  height: "高度",
  top: "上边距",
  bottom: "下边距",
  left: "左边距",
  right: "右边距",
  background: "背景色",
  type: "图表类型",
  x: "X 轴字段",
  group: "分组字段",
  heatY: "热力图 Y 分类列",
  heatZ: "热力图 Z 数值列",
  y: "Y 数值字段",
  error: "误差列",
  id: "序列标识",
};
export const toolValueNames: Record<string, string> = {
  x: "X 轴",
  y: "Y 轴",
  top: "上方",
  bottom: "下方",
  right: "右侧",
  'top-left': '左上角',
  'top-right': '右上角',
  'bottom-left': '左下角',
  'bottom-right': '右下角',
  h: "横向",
  v: "纵向",
  solid: "实线",
  dash: "虚线",
  dot: "点线",
  dashdot: "点划线",
  circle: "圆形",
  square: "方形",
  diamond: "菱形",
  "triangle-up": "三角形",
  cross: "十字",
  line: "折线图",
  bar: "柱状图",
  scatter: "散点图",
  heatmap: "热力图",
  box: "箱线图",
  violin: "小提琴图",
  histogram: "直方图",
  ecdf: "经验分布（ECDF）",
  roc: "ROC 曲线",
  pr: "PR 曲线",
  confusion: "混淆矩阵",
};
/** A chart description short enough to paste into a prompt (≤1 KB). */
export function describeFigure(c: Config, dataset?: Pick<Dataset, "id" | "version">): string {
  const parts = [
    `图表「${c.style.title || "未命名"}」`,
    `类型 ${toolValueNames[c.type] || c.type}`,
    ...(dataset?.id === c.datasetVersionId && Number.isInteger(dataset.version) && dataset.version > 0
      ? [`版本 v${dataset.version}`] : []),
    `X=${c.x || "自动"}`,
    c.group ? `分组=${c.group}` : "未分组",
  ];
  if (c.type === "heatmap")
    parts.push(`分类=${c.heatY || "未选"}`, `Z=${c.heatZ || "未选"}`);
  parts.push(
    `序列 ${c.series
      .map(
        (s) =>
          `${s.name || s.y}(${s.y}${s.error ? `±${s.error}` : ""}${s.visible ? "" : "，隐藏"})`,
      )
      .join("；")}`,
    `横轴「${c.axes.x.title || "自动"}」纵轴「${c.axes.y.title || "自动"}」`,
    `字体 ${c.style.font} ${
      c.publication?.enabled
        ? `${c.publication.fontPt}pt 成品`
        : `${c.style.fontSize}px`
    }`,
  );
  const text = parts.join(" · ");
  return text.length > 1024 ? `${text.slice(0, 1023)}…` : text;
}

export type FigureSpec = {
  type: Config["type"];
  x: string;
  y: string;
  group?: string;
  error?: string;
  title?: string;
};

/** Build a configuration from the shared defaults, never from a second default table. */
export function createConfigFromSpec(d: Dataset, spec: FigureSpec): Config {
  const c = defaults(d);
  c.type = spec.type;
  c.x = spec.x;
  c.group = spec.group || "";
  c.series = [
    {
      ...c.series[0],
      y: spec.y,
      error: spec.error || "",
      name: spec.y,
      visible: true,
    },
  ];
  if (spec.title) c.style.title = spec.title;
  return c;
}
export const columnFields = new Set([
  "x",
  "y",
  "group",
  "heatY",
  "heatZ",
  "error",
]);
export function operationValues(
  tool: string,
  c: Config,
  target?: string,
): Record<string, string | number | boolean> {
  switch (tool) {
    case "set_axis": {
      const axis = target === "x" ? "x" : "y";
      const title =
        c.type === "roc" || c.type === "pr"
          ? (c.evaluation as any)?.[`${c.type}${axis.toUpperCase()}Title`] || ""
          : c.type === "confusion"
            ? c.classification?.[axis === "x" ? "xTitle" : "yTitle"] || ""
            : c.type === "histogram" || c.type === "ecdf"
              ? c.empirical?.[axis === "x" ? "valueTitle" : "resultTitle"] || ""
              : c.axes[axis].title;
      return { axis, ...c.axes[axis], title };
    }
    case "set_legend":
      return { ...c.legend };
    case "set_series": {
      const s = c.series.find((s) => s.id === target) || c.series[0];
      return {
        seriesId: s.id,
        name: s.name,
        color: s.color,
        opacity: s.opacity,
        width: s.width,
        dash: s.dash,
        symbol: s.symbol,
        size: s.size,
        visible: s.visible,
      };
    }
    case "set_chart":
      return { type: c.type };
    case "set_mapping":
      return { x: c.x, group: c.group, heatY: c.heatY, heatZ: c.heatZ };
    case "map_series": {
      const s = c.series.find((s) => s.id === target) || c.series[0];
      return { seriesId: s.id, y: s.y, error: s.error };
    }
    case "add_series": {
      const used = new Set(c.series.map((s) => s.id));
      let n = c.series.length + 1;
      while (used.has(`s${n}`)) n++;
      return { id: `s${n}`, y: c.series[0]?.y || c.x, name: "" };
    }
    case "remove_series":
      return {
        seriesId: (c.series.find((s) => s.id === target) || c.series.at(-1)!)
          .id,
      };
    default:
      return { ...c.style, fontPt: c.publication?.fontPt || 8 };
  }
}
export function makeToolOperation(
  spec: ToolSpec,
  values: Record<string, string | number | boolean>,
  enabled: string[],
): ToolOperation {
  const args: ToolOperation["arguments"] = {};
  for (const key of new Set([...spec.input_schema.required, ...enabled])) {
    const rule = spec.input_schema.properties[key];
    if (!rule) throw new Error("不支持的操作字段");
    const value = values[key];
    const numeric =
      Array.isArray(rule.type) ||
      rule.type === "number" ||
      rule.type === "integer";
    if (numeric) {
      if (
        (value === "" || value == null) &&
        Array.isArray(rule.type) &&
        rule.type.includes("null")
      )
        args[key] = null;
      else {
        if (value === "" || value == null || !Number.isFinite(Number(value)))
          throw new Error(`请填写有效的${toolFieldNames[key]}`);
        args[key] = Number(value);
      }
    } else args[key] = value;
  }
  if (Object.keys(args).length < spec.input_schema.minProperties)
    throw new Error("至少选择一项要调整的属性");
  return { tool: spec.name, arguments: args };
}
export function changeLabel(path: string, c: Config) {
  const parts = path.split("/").slice(1);
  const field = parts.at(-1) || path;
  const label = toolFieldNames[field] || field;
  if (parts[0] === "series")
    return `${c.series[Number(parts[1])]?.name || "序列"} · ${label}`;
  if (parts[0] === "axes") return `${parts[1].toUpperCase()} 轴 · ${label}`;
  return label;
}
export function displayToolValue(value: unknown, key = ""): string {
  if (value === null || value === "")
    return ["min", "max", "dtick"].includes(key) ? "自动" : "留空";
  if (typeof value === "boolean")
    return key === "log"
      ? value
        ? "对数"
        : "线性"
      : key === "bold"
        ? value
          ? "加粗"
          : "常规"
        : value
          ? "开启"
          : "关闭";
  return ["axis", "position", "orientation", "dash", "symbol"].includes(key)
    ? toolValueNames[String(value)] || String(value)
    : String(value);
}

export function toolFieldAvailable(
  tool: string,
  key: string,
  c: Config,
  axis = "y",
): boolean {
  const matrix = ["heatmap", "confusion"].includes(c.type);
  if (matrix && ["set_series", "set_legend"].includes(tool)) return false;
  if (tool === "set_style")
    return !(c.publication?.enabled ? key === "fontSize" : key === "fontPt");
  if (tool === "set_axis") {
    if (
      ["min", "max", "dtick", "log"].includes(key) &&
      (matrix ||
        ["roc", "pr"].includes(c.type) ||
        (["box", "violin"].includes(c.type) && axis === "x") ||
        (c.facet && c.facet.mode !== "none"))
    )
      return false;
    if (key === "grid" && matrix) return false;
    if (
      key === "title" &&
      ["histogram", "ecdf"].includes(c.type) &&
      !c.empirical
    )
      return false;
  }
  if (tool === "set_mapping" && key === "x")
    return !["heatmap", "confusion", "histogram", "ecdf", "roc", "pr"].includes(
      c.type,
    );
  if (tool === "map_series" && key === "error")
    return ["line", "bar", "scatter"].includes(c.type);
  if (tool === "set_series") {
    if (
      ["size", "symbol"].includes(key) &&
      ["bar", "histogram"].includes(c.type)
    )
      return false;
    if (key === "width" && ["bar", "histogram", "scatter"].includes(c.type))
      return false;
    if (key === "dash" && !["line", "roc", "pr", "ecdf"].includes(c.type))
      return false;
  }
  return true;
}

/** A chart type is only offered when the configuration already carries what it needs. */
export function chartTypeAvailable(type: string, c: Config): boolean {
  if (type === "heatmap") return Boolean(c.heatY && c.heatZ);
  if (type === "roc" || type === "pr") return Boolean(c.evaluation);
  if (type === "confusion") return Boolean(c.classification);
  return true;
}

/** Paths a structural tool is allowed to change; everything else must stay put. */
export function structuralAllowance(operations: ToolOperation[]): string[] {
  const allowed = new Set<string>();
  for (const op of operations) {
    if (op.tool === "set_chart") allowed.add("/type");
    else if (op.tool === "set_mapping")
      for (const key of ["x", "group", "heatY", "heatZ"])
        allowed.add(`/${key}`);
    else if (["map_series", "add_series", "remove_series"].includes(op.tool))
      allowed.add("/series");
    else if (
      op.tool === "set_series" &&
      typeof op.arguments.seriesId === "string"
    )
      allowed.add(`/series-appearance/${op.arguments.seriesId}`);
  }
  return [...allowed];
}

/** Check the immutable part of a preview before trusting its returned configuration. */
export function sameProtectedFigure(
  before: Config,
  after: Config,
  allowed: string[] = [],
): boolean {
  const allow = new Set(allowed);
  const appearance = (s: any) =>
    JSON.stringify([
      s.color,
      s.opacity,
      s.width,
      s.dash,
      s.symbol,
      s.size,
      s.visible,
    ]);
  const canonical = (value: any): any =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, canonical(value[k])]),
          )
        : value;
  const protectedState = (config: Config) => {
    const c: any = structuredClone(config);
    const looks = new Map<string, string>();
    for (const s of c.series) looks.set(s.id, appearance(s));
    for (const key of [
      "title",
      "font",
      "fontSize",
      "bold",
      "width",
      "height",
      "top",
      "bottom",
      "left",
      "right",
      "background",
    ])
      delete c.style[key];
    for (const axis of ["x", "y"])
      for (const key of ["title", "min", "max", "dtick", "grid", "log"])
        delete c.axes[axis][key];
    for (const key of ["show", "position", "orientation"]) delete c.legend[key];
    if (allow.has("/series")) delete c.series;
    else
      for (const s of c.series)
        for (const key of [
          "name",
          "color",
          "opacity",
          "width",
          "dash",
          "symbol",
          "size",
          "visible",
        ])
          delete s[key];
    if (allow.has("/type")) delete c.type;
    for (const key of ["x", "group", "heatY", "heatZ"])
      if (allow.has(`/${key}`)) delete c[key];
    if (c.publication) delete c.publication.fontPt;
    if (c.evaluation)
      for (const key of ["rocXTitle", "rocYTitle", "prXTitle", "prYTitle"])
        delete c.evaluation[key];
    if (c.classification)
      for (const key of ["xTitle", "yTitle"]) delete c.classification[key];
    if (c.empirical)
      for (const key of ["valueTitle", "resultTitle"]) delete c.empirical[key];
    return { state: canonical(c), looks };
  };
  try {
    const a = protectedState(before),
      b = protectedState(after);
    if (JSON.stringify(a.state) !== JSON.stringify(b.state)) return false;
    if (!allow.has("/series")) return true;
    // Surviving series keep their look unless explicitly targeted by set_series in this batch.
    for (const [id, look] of a.looks)
      if (
        b.looks.has(id) &&
        b.looks.get(id) !== look &&
        !allow.has(`/series-appearance/${id}`)
      )
        return false;
    return true;
  } catch {
    return false;
  }
}
