import { defaultClassification, type Config } from "./model";
import type { ClassificationReport } from "./classification";
import { vectorHeatmap } from "./heatmap";
import { labelColor, interpolate, scientificScales } from "./color";
export function confusionPlot(c: Config, reports: ClassificationReport[]) {
  const k = c.classification || defaultClassification;
  const report = reports.find(
    (r) =>
      r.seriesId === (k.seriesId || c.series.find((s) => s.visible)?.id) &&
      r.groupKey ===
        (k.groupValue ||
          reports.find(
            (v) =>
              v.seriesId ===
              (k.seriesId || c.series.find((s) => s.visible)?.id),
          )?.groupKey),
  );
  const escape = (v: string) =>
    v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  /** Colorbar labels follow the figure language (axis defaults are English). */
  const colorbarTitle = {
    count: "Count",
    true: "Share of true class",
    pred: "Share of predicted class",
    all: "Share of all samples",
  };
  const title = {
    count: "样本数",
    true: "真实类别内比例",
    pred: "预测类别内比例",
    all: "全部样本比例",
  }[k.normalization];
  if (report)
    c = {
      ...c,
      series: [
        c.series.find((s) => s.id === report.seriesId)!,
        ...c.series.filter((s) => s.id !== report.seriesId),
      ],
    };
  const rows = report
    ? report.classes.flatMap((truth, i) =>
        report.classes.map((prediction, j) => ({
          truth,
          prediction,
          [title]: report.matrix[i][j],
        })),
      )
    : [];
  const max =
    k.normalization === "count" && report
      ? Math.max(1, ...report.counts.flat())
      : 1;
  const heat = vectorHeatmap(
    {
      ...c,
      x: "prediction",
      heatY: "truth",
      heatZ: title,
      axes: { x: { ...c.axes.x, log: false }, y: { ...c.axes.y, log: false } },
      heatmap: {
        palette: "viridis",
        min: "0",
        max: String(max),
        center: "",
        labels: false,
      },
    },
    rows,
  );
  if (!report || !report.n)
    return {
      ...heat,
      traces: [],
      shapes: [],
      annotations: [],
      warnings: [
        ...heat.warnings,
        report
          ? "当前模型/组没有有效成对样本，不绘制空矩阵"
          : "请选择有效的矩阵模型与分组",
      ],
    };
  heat.annotations = report.classes.flatMap((_, i) =>
    report.classes.map((__, j) => {
      const v = report.matrix[i][j],
        color =
          v == null
            ? "#f1f3f6"
            : interpolate(scientificScales.viridis, v / max);
      if (v == null)
        heat.shapes.push({
          type: "rect",
          xref: "x",
          yref: "y",
          x0: j - 0.5,
          x1: j + 0.5,
          y0: i - 0.5,
          y1: i + 0.5,
          line: { width: 0 },
          fillcolor: color,
          layer: "below",
        });
      return {
        x: j,
        y: i,
        xref: "x",
        yref: "y",
        showarrow: false,
        text:
          v == null
            ? "—"
            : k.normalization === "count"
              ? String(report.counts[i][j])
              : `${report.counts[i][j]}<br>${(v * 100).toFixed(1)}%`,
        font: {
          size: c.style.fontSize,
          color: labelColor(
            color,
            c.style.background,
            c.series[0]?.opacity ?? 1,
          ),
        },
      };
    }),
  );
  heat.yaxis = { ...heat.yaxis, range: [report.classes.length - 0.5, -0.5] };
  // Anchor the subtitle's baseline above the plot area and reserve room for
  // it, so it can never be painted underneath the first row of cells.
  heat.annotations.push({
    xref: "paper",
    yref: "paper",
    x: 0.5,
    y: 1,
    yanchor: "bottom",
    yshift: 6,
    showarrow: false,
    text: escape(`${report.series} · ${report.group} · n=${report.n}`),
    font: { size: c.style.fontSize, color: "#566072" },
  });
  heat.marginTop = c.style.fontSize + 14;
  const colorbar = heat.traces[0]?.marker?.colorbar;
  if (colorbar)
    Object.assign(colorbar, {
      title: { text: escape(colorbarTitle[k.normalization]), side: "right" },
      ...(k.normalization === "count"
        ? { tickformat: "d", dtick: Math.max(1, Math.ceil(max / 5)) }
        : { tickformat: ".0%" }),
    });
  heat.traces.forEach((t) => {
    t.customdata = t.x.map(() => report.seriesId);
    t.text = t.x.map((x: number, i: number) => {
      const y = t.y[i];
      return `${escape(report.classes[y])} → ${escape(report.classes[x])}<br>样本数: ${report.counts[y][x]}<br>${escape(title)}: ${report.matrix[y][x]}`;
    });
  });
  return {
    ...heat,
    warnings: heat.warnings,
    xaxis: {
      ...heat.xaxis,
      title: { text: escape(k.xTitle || "Predicted class"), standoff: 14 },
    },
    yaxis: {
      ...heat.yaxis,
      title: { text: escape(k.yTitle || "True class"), standoff: 14 },
    },
  };
}
