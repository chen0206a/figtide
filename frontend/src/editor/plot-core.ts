import { vectorHeatmap } from "./heatmap";
import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { distributionTraces } from "./distribution";
import { empiricalTraces } from "./empirical";
import { defaultEmpirical } from "./model";
const plain = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function filteredRows(c: Config, d: Dataset) {
  let rows = d.rows;
  for (const t of c.transforms) {
    rows = rows.filter((r) =>
      t.operator === "eq"
        ? String(r[t.field]) === t.value
        : r[t.field] != null &&
          Number.isFinite(Number(t.value)) &&
          (t.operator === "gte"
            ? Number(r[t.field]) >= Number(t.value)
            : Number(r[t.field]) <= Number(t.value)),
    );
  }
  return rows;
}
export function buildSinglePlot(c: Config, d: Dataset) {
  const rows = filteredRows(c, d);
  const warnings = [...d.warnings];
  const fields = new Set(d.fields.map((f) => f.name));
  const traces: any[] = [];
  if (!fields.has(c.x)) warnings.push("X 字段不存在，请重新映射");
  let heat: ReturnType<typeof vectorHeatmap> | undefined;
  const distribution = c.type === "box" || c.type === "violin";
  const empirical = c.type === "histogram" || c.type === "ecdf";
  const stats = empirical
    ? empiricalTraces(c, rows)
    : distribution
      ? distributionTraces(c, rows)
      : undefined;
  if (stats) {
    traces.push(...stats.traces);
    warnings.push(...stats.warnings);
  } else if (c.type === "heatmap") {
    heat = vectorHeatmap(c, rows);
    warnings.push(...heat.warnings);
    traces.push(...heat.traces);
  } else
    for (const s of c.series) {
      if (!s.visible) continue;
      if (!fields.has(s.y)) {
        warnings.push(`${s.name} 的 Y 字段不存在，请重新映射`);
        continue;
      }
      const groups = c.group ? [...new Set(rows.map((r) => r[c.group]))] : [""];
      for (const group of groups) {
        const selected = c.group
          ? rows.filter((r) => r[c.group] === group)
          : rows;
        const valid = selected.filter((r) => {
          if (c.axes.x.log && typeof r[c.x] === "number" && Number(r[c.x]) <= 0)
            return false;
          if (c.axes.y.log && r[s.y] != null && Number(r[s.y]) <= 0)
            return false;
          return true;
        });
        if (valid.length !== selected.length)
          warnings.push("对数轴排除了非正值；原始数据未修改");
        const errors = s.error ? valid.map((r) => r[s.error]) : [];
        if (errors.some((v) => typeof v === "number" && v < 0))
          warnings.push("误差字段含负值，误差棒未显示");
        traces.push({
          type: c.type === "bar" ? "bar" : "scatter",
          mode: c.type === "scatter" ? "markers" : "lines+markers",
          name: plain(s.name + (c.group ? " · " + String(group) : "")),
          legendgroup: s.id + ":" + JSON.stringify(group),
          x: valid.map((r) => r[c.x]),
          y: valid.map((r) => r[s.y]),
          opacity: s.opacity,
          line: { color: s.color, width: s.width, dash: s.dash },
          marker: {
            color: s.color,
            size: s.size,
            symbol: s.symbol,
            line: { width: c.type === "scatter" ? 0 : 1, color: s.color },
          },
          error_y:
            s.error && !errors.some((v) => typeof v === "number" && v < 0)
              ? {
                  type: "data",
                  array: errors,
                  visible: true,
                  color: s.color,
                  thickness: 1,
                  width: 3,
                }
              : undefined,
          connectgaps: false,
          customdata: valid.map(() => s.id),
          hovertemplate: "%{x}<br>%{y}<extra>%{fullData.name}</extra>",
        });
      }
    }
  const axis = (a: Config["axes"]["x"]) => {
    const min = a.min === "" ? undefined : Number(a.min),
      max = a.max === "" ? undefined : Number(a.max);
    let range: any = undefined;
    if (min !== undefined || max !== undefined) {
      if (
        (min !== undefined && !Number.isFinite(min)) ||
        (max !== undefined && !Number.isFinite(max)) ||
        (min !== undefined && max !== undefined && min >= max) ||
        (a.log &&
          ((min !== undefined && min <= 0) || (max !== undefined && max <= 0)))
      )
        warnings.push("坐标轴范围无效，已使用自动范围");
      else
        range = [
          min === undefined ? null : a.log ? Math.log10(min) : min,
          max === undefined ? null : a.log ? Math.log10(max) : max,
        ];
    }
    return {
      title: { text: plain(a.title), standoff: 14 },
      type: a.log ? "log" : undefined,
      range,
      autorange: range ? false : true,
      dtick: a.dtick && Number(a.dtick) > 0 ? Number(a.dtick) : undefined,
      showgrid: a.grid,
      gridcolor: "#e9ecf1",
      gridwidth: 1,
      zeroline: false,
      showline: true,
      linecolor: "#566072",
      linewidth: 1,
      ticks: "outside",
      ticklen: 5,
      tickcolor: "#566072",
      automargin: true,
    };
  };
  const pos =
    c.legend.position === "bottom"
      ? { x: 0.5, y: -0.22, xanchor: "center", yanchor: "top" }
      : c.legend.position === "right"
        ? { x: 1.04, y: 1, xanchor: "left" }
        : { x: 0.5, y: 1.01, xanchor: "center", yanchor: "bottom" };
  const layout: any = {
    width: c.style.width,
    height: c.style.height,
    title: {
      text: plain(c.style.title),
      x: 0.5,
      xanchor: "center",
      y: 0.97,
      yanchor: "top",
      font: { size: c.style.fontSize + 4 },
    },
    font: {
      family: c.style.font,
      size: c.style.fontSize,
      color: "#253044",
      weight: c.style.bold ? 700 : 400,
    },
    paper_bgcolor: c.style.background,
    plot_bgcolor: c.style.background,
    margin: {
      t: Math.max(
        c.style.top,
        c.legend.show && c.legend.position === "top"
          ? c.style.fontSize * 3 + 40
          : c.style.fontSize * 2 + 24,
      ),
      b: c.style.bottom,
      l: c.style.left,
      r: c.style.right,
    },
    xaxis: {
      ...axis(
        distribution
          ? { ...c.axes.x, log: false, min: "", max: "", dtick: "" }
          : c.axes.x,
      ),
      ...heat?.xaxis,
      ...(distribution ? { type: "category" } : {}),
      ...(empirical
        ? {
            title: {
              text: plain(
                c.empirical?.valueTitle ||
                  c.series.find((s) => s.visible)?.name ||
                  "观测值",
              ),
              standoff: 14,
            },
          }
        : {}),
    },
    yaxis: { ...axis(c.axes.y), ...heat?.yaxis },
    shapes: heat?.shapes || [],
    showlegend: c.legend.show,
    legend: {
      ...pos,
      orientation: c.legend.orientation,
      font: { size: c.style.fontSize - 1 },
    },
    barmode: "group",
    boxmode: "group",
    violinmode: "group",
    bargap: 0.25,
    annotations: [
      ...(heat?.annotations || []),
      ...c.annotations.map((a) => ({
        text: plain(a.text),
        x: a.x,
        y: a.y,
        xref: "paper",
        yref: "paper",
        showarrow: false,
      })),
    ],
    hovermode: "closest",
    dragmode: false,
  };
  if (empirical) {
    const e = c.empirical || defaultEmpirical;
    layout.yaxis.title = {
      text: plain(
        e.resultTitle ||
          (c.type === "ecdf"
            ? "累计概率"
            : { count: "频数", probability: "概率", density: "概率密度" }[
                e.normalization
              ]),
      ),
      standoff: 14,
    };
    if (c.type === "ecdf" && !c.axes.y.min && !c.axes.y.max && !c.axes.y.log)
      Object.assign(layout.yaxis, { range: [0, 1.05], autorange: false });
    if (c.type === "histogram" && c.axes.y.log)
      warnings.push("直方图对数 Y 轴不显示零频箱；分箱计数仍包含这些箱");
  }
  return {
    traces,
    layout,
    warnings: [...new Set(warnings)],
    shownRows: rows.length,
    summaries: stats?.summaries || [],
    panelCount: 1,
  };
}
