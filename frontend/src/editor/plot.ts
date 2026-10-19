import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { buildSinglePlot } from "./plot-core";
import { buildFacets } from "./facets";

export function buildPlot(
  c: Config,
  d: Dataset,
): ReturnType<typeof buildSinglePlot> {
  return c.facet && c.facet.mode !== "none"
    ? buildFacets(c, d)
    : buildSinglePlot(c, d);
}
