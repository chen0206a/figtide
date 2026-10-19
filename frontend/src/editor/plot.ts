import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { buildSinglePlot, filteredRows } from "./plot-core";
import { buildFacets } from "./facets";
import { renderConfig } from "./publication";
import { identityWarning } from "./sampling";

export function buildPlot(
  c: Config,
  d: Dataset,
): ReturnType<typeof buildSinglePlot> {
  c = renderConfig(c);
  const result =
    c.facet && c.facet.mode !== "none"
      ? buildFacets(c, d)
      : buildSinglePlot(c, d);
  if (["roc", "pr", "confusion"].includes(c.type)) {
    const warning = identityWarning(c, filteredRows(c, d));
    if (warning)
      return {
        ...result,
        traces: [],
        layout: { ...result.layout, shapes: [], annotations: [] },
        metrics: [],
        classificationReports: [],
        warnings: [...result.warnings, warning],
      };
  }
  if (
    d.source_meta?.kind === "data_processing" &&
    d.source_meta.rules.mode === "aggregate" &&
    ["line", "bar", "scatter"].includes(c.type)
  ) {
    const rows = filteredRows(c, d);
    const unmapped = d.source_meta.rules.groupBy.filter(
      (field) =>
        field !== c.x &&
        field !== c.group &&
        !(c.facet?.mode === "field" && c.facet.field === field) &&
        new Set(rows.map((r) => JSON.stringify(r[field]))).size > 1,
    );
    if (unmapped.length)
      return {
        ...result,
        traces: [],
        summaries: [],
        metrics: [],
        panelCount: 0,
        warnings: [
          ...result.warnings,
          `仍有变化的汇总条件未映射：${unmapped.join("、")}。请设置类别、分面或显式过滤，不会把不同实验条件直接连在一起`,
        ],
      };
  }
  return result;
}
