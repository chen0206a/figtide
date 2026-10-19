import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { buildSinglePlot } from "./plot-core";
import { buildFacets } from "./facets";
import { renderConfig } from "./publication";

export function buildPlot(
  c: Config,
  d: Dataset,
): ReturnType<typeof buildSinglePlot> {
  c = renderConfig(c);
  return c.facet && c.facet.mode !== "none"
    ? buildFacets(c, d)
    : buildSinglePlot(c, d);
}
