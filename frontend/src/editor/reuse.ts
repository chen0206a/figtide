import type { Config, Series } from "./model";
import type { Dataset } from "../lib/api";

export type StyleProfile = {
  schema_version: 1;
  style: Omit<Config["style"], "title">;
  axes: { x: { grid: boolean }; y: { grid: boolean } };
  legend: Config["legend"];
  publication?: Config["publication"];
  heatmap?: Pick<NonNullable<Config["heatmap"]>, "palette" | "labels">;
  series: (Pick<
    Series,
    "color" | "opacity" | "width" | "dash" | "symbol" | "size"
  > & { band?: { opacity: number } })[];
};
export function applyStyle(c: Config, p: StyleProfile): Config {
  if (p.schema_version !== 1 || !p.series.length)
    throw new Error("不支持的样式模板");
  // Explicit keys also protect bindings when importing a backup from another workspace.
  const s = p.style;
  return {
    ...c,
    style: {
      ...c.style,
      font: s.font,
      fontSize: s.fontSize,
      bold: s.bold,
      background: s.background,
      width: s.width,
      height: s.height,
      top: s.top,
      bottom: s.bottom,
      left: s.left,
      right: s.right,
      preset: s.preset,
    },
    axes: {
      x: { ...c.axes.x, grid: p.axes.x.grid },
      y: { ...c.axes.y, grid: p.axes.y.grid },
    },
    legend: {
      show: p.legend.show,
      position: p.legend.position,
      orientation: p.legend.orientation,
    },
    ...(p.publication ? { publication: { ...p.publication } } : {}),
    ...(c.heatmap && p.heatmap
      ? {
          heatmap: {
            ...c.heatmap,
            palette: p.heatmap.palette,
            labels: p.heatmap.labels,
          },
        }
      : {}),
    series: c.series.map((v, i) => {
      const a = p.series[i % p.series.length];
      return {
        ...v,
        color: a.color,
        opacity: a.opacity,
        width: a.width,
        dash: a.dash,
        symbol: a.symbol,
        size: a.size,
        ...(v.band && a.band
          ? { band: { ...v.band, opacity: a.band.opacity } }
          : {}),
      };
    }),
  };
}
type Binding = { field: string; numeric: boolean; uses: string[] };
// Return paths, including dormant settings, so later type switches cannot expose stale bindings.
function paths(
  c: Config,
): { path: (string | number)[]; numeric: boolean; use: string }[] {
  const result: { path: (string | number)[]; numeric: boolean; use: string }[] =
    [];
  const add = (path: (string | number)[], numeric: boolean, use: string) => {
    let value: any = c;
    for (const k of path) value = value?.[k];
    if (typeof value === "string" && value) result.push({ path, numeric, use });
  };
  add(
    ["x"],
    c.type === "line" && c.series.some((s) => s.band?.enabled),
    "X 轴",
  );
  add(["group"], false, "类别分组");
  add(["heatY"], false, "热力图 Y");
  add(["heatZ"], true, "热力图 Z");
  add(["facet", "field"], false, "分面");
  add(["evaluation", "label"], false, "二分类真实标签");
  add(["classification", "label"], false, "矩阵真实标签");
  add(["sampling", "id"], false, "样本 ID");
  c.series.forEach((s, i) => {
    add(
      ["series", i, "y"],
      !(c.type === "confusion" && c.classification?.input === "labels"),
      `序列 ${i + 1} 数值`,
    );
    add(["series", i, "error"], true, `序列 ${i + 1} 误差`);
    add(["series", i, "prediction"], false, `序列 ${i + 1} 预测标签`);
    add(["series", i, "band", "lower"], true, `序列 ${i + 1} 区间下界`);
    add(["series", i, "band", "upper"], true, `序列 ${i + 1} 区间上界`);
  });
  c.transforms.forEach((t, i) =>
    add(["transforms", i, "field"], t.operator !== "eq", `过滤 ${i + 1}`),
  );
  return result;
}
function get(c: Config, path: (string | number)[]): string {
  let value: any = c;
  for (const k of path) value = value[k];
  return value;
}
export function bindings(c: Config): Binding[] {
  const result = new Map<string, Binding>();
  for (const b of paths(c)) {
    const field = get(c, b.path),
      existing = result.get(field);
    if (existing) {
      existing.numeric ||= b.numeric;
      existing.uses.push(b.use);
    } else result.set(field, { field, numeric: b.numeric, uses: [b.use] });
  }
  return [...result.values()];
}
export function reuseConfig(
  c: Config,
  target: Dataset,
  mapping: Record<string, string>,
): Config {
  for (const b of bindings(c)) {
    const f = target.fields.find((f) => f.name === mapping[b.field]);
    if (!f || (b.numeric && f.type !== "number"))
      throw new Error(
        `请为「${b.field}」选择${b.numeric ? "数值" : "有效"}字段`,
      );
  }
  const copy = structuredClone(c);
  for (const b of paths(c)) {
    let node: any = copy;
    for (const k of b.path.slice(0, -1)) node = node[k];
    node[b.path[b.path.length - 1]] = mapping[get(c, b.path)];
  }
  copy.datasetVersionId = target.id;
  if (copy.facet) copy.facet.titles = {};
  if (copy.classification) copy.classification.groupValue = "";
  return copy;
}
