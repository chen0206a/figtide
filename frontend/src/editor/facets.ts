import type { Dataset } from "../lib/api";
import { defaultFacet, type Config } from "./model";
import { buildSinglePlot, filteredRows } from "./plot-core";
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function facetEntries(c: Config, d: Dataset) {
  const f = c.facet || defaultFacet;
  if (f.mode === "series")
    return c.series
      .filter((s) => s.visible)
      .map((s) => ({
        key: `series:${s.id}`,
        title: s.name,
        seriesId: s.id,
        value: undefined as unknown,
      }));
  if (f.mode === "field" && d.fields.some((field) => field.name === f.field))
    return [...new Set(filteredRows(c, d).map((r) => r[f.field]))].map(
      (value) => ({
        key: `field:${f.field}:${JSON.stringify(value)}`,
        title: `${f.field} · ${value ?? "缺失"}`,
        seriesId: "",
        value,
      }),
    );
  return [];
}
export function buildFacets(
  c: Config,
  d: Dataset,
): ReturnType<typeof buildSinglePlot> {
  const f = c.facet || defaultFacet;
  const base = buildSinglePlot(c, d);
  if (c.type === "heatmap")
    return {
      ...base,
      warnings: [...base.warnings, "热力图暂使用单图；分面设置已保留"],
    };
  const entries = facetEntries(c, d);
  const fail = (message: string) => ({
    ...base,
    traces: [],
    panelCount: 0,
    layout: {
      ...base.layout,
      shapes: [],
      annotations: c.annotations.map((a) => ({
        ...a,
        text: escape(a.text),
        xref: "paper",
        yref: "paper",
        showarrow: false,
      })),
    },
    warnings: [...base.warnings, message],
  });
  if (!entries.length)
    return fail("没有可用子图，请选择分面字段、显示序列或调整过滤条件");
  if (entries.length > 8)
    return fail(
      `分面产生 ${entries.length} 个子图，最多 8 个；请先过滤或减少序列，未截断数据`,
    );
  const cols = Math.min(f.columns, entries.length),
    rowCount = Math.ceil(entries.length / cols);
  const width = c.style.width - base.layout.margin.l - base.layout.margin.r;
  const height =
    c.style.height - base.layout.margin.t - base.layout.margin.b - 25;
  const cellW = (width - f.gapX * (cols - 1)) / cols;
  const cellH = (height - f.gapY * (rowCount - 1)) / rowCount;
  if (cellW < 100 || cellH < 90)
    return fail("子图可用空间不足，请增大画布、减少列数或缩小间距");
  const traces: any[] = [],
    summaries: typeof base.summaries = [];
  const warnings = new Set<string>(d.warnings);
  const layout: any = {
    ...base.layout,
    margin: { ...base.layout.margin, t: base.layout.margin.t + 25 },
    shapes: [],
    annotations: [...base.layout.annotations],
  };
  if (c.legend.position === "top")
    layout.legend = {
      ...layout.legend,
      y: 1 + (c.style.fontSize + 26) / height,
    };
  const seen = new Set<string>();
  entries.forEach((entry, i) => {
    const childConfig = {
      ...c,
      facet: undefined,
      series: entry.seriesId
        ? c.series.filter((s) => s.id === entry.seriesId)
        : c.series,
      axes: {
        ...c.axes,
        y: {
          ...c.axes.y,
          title: entry.seriesId ? entry.title : c.axes.y.title,
        },
      },
      annotations: [],
    };
    const childData =
      f.mode === "field"
        ? { ...d, rows: d.rows.filter((r) => r[f.field] === entry.value) }
        : d;
    const child = buildSinglePlot(childConfig, childData);
    child.warnings.forEach((w) => warnings.add(w));
    const suffix = i ? String(i + 1) : "",
      xref = `x${suffix}`,
      yref = `y${suffix}`;
    const col = i % cols,
      row = Math.floor(i / cols);
    const x0 = (col * (cellW + f.gapX)) / width,
      x1 = x0 + cellW / width;
    const y1 = 1 - (row * (cellH + f.gapY)) / height,
      y0 = y1 - cellH / height;
    layout[`xaxis${suffix}`] = {
      ...child.layout.xaxis,
      domain: [x0, x1],
      anchor: yref,
      matches: i && f.shareX ? "x" : undefined,
    };
    layout[`yaxis${suffix}`] = {
      ...child.layout.yaxis,
      domain: [y0, y1],
      anchor: xref,
      matches: i && f.shareY ? "y" : undefined,
    };
    for (const trace of child.traces) {
      const key = trace.legendgroup || trace.name;
      const showlegend = trace.showlegend !== false && !seen.has(key);
      if (trace.showlegend !== false) seen.add(key);
      traces.push({
        ...trace,
        xaxis: xref,
        yaxis: yref,
        legendgroup: key,
        showlegend,
      });
    }
    summaries.push(
      ...child.summaries.map((s) => ({
        ...s,
        panel: f.titles[entry.key] ?? entry.title,
      })),
    );
    layout.annotations.push({
      text: escape(
        `${f.labels ? `(${String.fromCharCode(97 + i)})  ` : ""}${f.titles[entry.key] ?? entry.title}`,
      ),
      x: x0,
      y: y1,
      xref: "paper",
      yref: "paper",
      xanchor: "left",
      yanchor: "bottom",
      yshift: 12,
      showarrow: false,
      font: { size: c.style.fontSize, weight: 600 },
    });
  });
  if (traces.length > 200)
    return fail("分面包含过多分组（超过 200 条轨迹），请先过滤类别");
  return {
    traces,
    layout,
    warnings: [...warnings],
    summaries,
    shownRows: filteredRows(c, d).length,
    panelCount: entries.length,
  };
}
