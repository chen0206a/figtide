import type { Config } from "./model";
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
  tools: ToolSpec[];
};
export type ToolPreview = {
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
};
export const toolValueNames: Record<string, string> = {
  x: "X 轴",
  y: "Y 轴",
  top: "上方",
  bottom: "下方",
  right: "右侧",
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
};
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

/** Check the immutable part of a preview before trusting its returned configuration. */
export function sameProtectedFigure(before: Config, after: Config): boolean {
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
    if (c.publication) delete c.publication.fontPt;
    if (c.evaluation)
      for (const key of ["rocXTitle", "rocYTitle", "prXTitle", "prYTitle"])
        delete c.evaluation[key];
    if (c.classification)
      for (const key of ["xTitle", "yTitle"]) delete c.classification[key];
    if (c.empirical)
      for (const key of ["valueTitle", "resultTitle"]) delete c.empirical[key];
    return canonical(c);
  };
  try {
    return (
      JSON.stringify(protectedState(before)) ===
      JSON.stringify(protectedState(after))
    );
  } catch {
    return false;
  }
}
