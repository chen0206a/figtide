import type { Dataset } from "../lib/api";
import { defaults, makeSeries, type Config } from "./model";

export const planTypes = {
  line: "折线图",
  bar: "分组柱状图",
  scatter: "散点图",
  heatmap: "热力图",
  box: "箱线图",
  violin: "小提琴图",
  histogram: "直方图",
  ecdf: "经验分布图",
} as const;
export type PlotPlan = {
  id: string;
  type: keyof typeof planTypes;
  x: string;
  ys: string[];
  group: string;
  heatY: string;
  heatZ: string;
  title: string;
  reason: string;
  caveat: string;
};
export function configFromPlan(data: Dataset, plan: PlotPlan): Config {
  const fields = new Map(data.fields.map((f) => [f.name, f]));
  const numeric = (name: string) => fields.get(name)?.type === "number";
  if (
    !(plan.type in planTypes) ||
    !fields.has(plan.x) ||
    !plan.ys.length ||
    plan.ys.some((y) => !numeric(y)) ||
    (plan.group && !fields.has(plan.group)) ||
    (["scatter", "histogram", "ecdf"].includes(plan.type) &&
      !numeric(plan.x)) ||
    (plan.type === "heatmap" &&
      (!fields.has(plan.heatY) ||
        !numeric(plan.heatZ) ||
        plan.x === plan.heatY))
  )
    throw new Error("请检查图型与字段映射，Y 和色值需要数值字段。");
  const config = defaults(data);
  config.type = plan.type;
  config.x = plan.x;
  config.group = plan.group;
  config.heatY = plan.heatY;
  config.heatZ = plan.heatZ;
  config.series = plan.ys.map((y, i) => makeSeries(y, i));
  config.style.title = plan.title;
  config.axes.x.title = plan.x;
  config.axes.y.title =
    plan.type === "heatmap"
      ? plan.heatY
      : plan.ys.length === 1
        ? plan.ys[0]
        : "Value";
  return config;
}
export const planCaveats: Record<PlotPlan["type"], string> = {
  line: "折线按原始行顺序连接；不会自动排序或计算统计量。",
  bar: "展示原始数值，不自动求均值；重复类别请先检查观测单位。",
  scatter: "只展示真实观测点，不自动拟合曲线。",
  heatmap: "重复坐标不会自动聚合；请先确认每个坐标对应的观测值。",
  box: "显示当前分组的样本分布；不会补齐样本。",
  violin: "样本不足或为常量时仅显示观测，不估计密度。",
  histogram: "按所选字段的真实数值分箱，进入编辑器后可调整箱数。",
  ecdf: "展示所选字段的经验累积分布，不做参数分布假设。",
};
export function initialPlan(data: Dataset): PlotPlan {
  const config = defaults(data);
  const numeric = data.fields.filter(
    (f) => f.type === "number" && f.missing < data.row_count,
  );
  return {
    id: "manual",
    type: "line",
    x: config.x,
    ys: [
      numeric.find((f) => f.name === config.series[0]?.y)?.name ||
        numeric[0]?.name ||
        "",
    ],
    group: config.group,
    heatY: data.fields.find((f) => f.name !== config.x)?.name || "",
    heatZ: numeric[0]?.name || "",
    title: "实验结果",
    reason: "手动选择字段",
    caveat: planCaveats.line,
  };
}
