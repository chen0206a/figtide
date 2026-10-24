import type { Config, Series } from "./model";
import { palettes } from "./model";
import { stylePresets } from "./stylePresets";

const DASHES = ["solid", "dash", "dot", "dashdot"];
const SYMBOLS = ["circle", "square", "diamond", "triangle-up"];

export const visibleSeries = (c: Config) => c.series.filter((s) => s.visible);
export type EncodingContext = { config: Config; groups: unknown[] };

/** Keep group colors and series identities stable when a facet displays a subset. */
export function traceEncoding(
  c: Config,
  s: Series,
  group: unknown,
  groups: unknown[],
  context?: EncodingContext,
) {
  const domain = context?.groups || groups;
  return groupEncoding(
    context?.config || c,
    s,
    Math.max(
      0,
      domain.findIndex((v) => Object.is(v, group)),
    ),
    domain.length,
  );
}

/** Palette of the active style preset; falls back to the legacy model palettes. */
export function presetColors(c: Config): readonly string[] {
  return (
    stylePresets.find((p) => p.key === c.style.preset)?.colors ||
    palettes[c.style.preset] ||
    palettes["Clean Academic"]
  );
}

/**
 * Visual encoding for one category group inside one series.
 *
 * - No grouping (or a single group): the series keeps its own color/dash/symbol.
 * - One visible series split by groups: group 0 keeps the series color, later
 *   groups continue through the preset palette so every group is distinct.
 * - Several visible series × groups: color identifies the group, dash/symbol
 *   identify the series.
 *
 * Series identity for selection stays in `customdata`; this only changes paint.
 */
export function groupEncoding(
  c: Config,
  s: Series,
  groupIndex: number,
  groupCount: number,
): { color: string; dash: string; symbol: string } {
  if (groupCount <= 1)
    return { color: s.color, dash: s.dash, symbol: s.symbol };
  const colors = presetColors(c);
  const visible = visibleSeries(c);
  if (visible.length <= 1) {
    if (groupIndex === 0)
      return { color: s.color, dash: s.dash, symbol: s.symbol };
    const own = colors.findIndex(
      (v) => v.toLowerCase() === s.color.toLowerCase(),
    );
    // Skip the series' own color so group 1+ never repeats group 0.
    const pool = own >= 0 ? colors.filter((_, i) => i !== own) : colors;
    const start = own >= 0 ? own : 0;
    return {
      color: pool[(start + groupIndex - 1) % pool.length],
      dash: s.dash,
      symbol: s.symbol,
    };
  }
  const seriesIndex = Math.max(
    0,
    visible.findIndex((v) => v.id === s.id),
  );
  return {
    color: colors[groupIndex % colors.length],
    dash: DASHES[seriesIndex % DASHES.length],
    symbol: SYMBOLS[seriesIndex % SYMBOLS.length],
  };
}

/**
 * Legend label for a grouped trace. With one visible series the group value is
 * enough (the series name is already on the y axis); otherwise keep both.
 */
export function groupTraceName(
  c: Config,
  s: Series,
  group: unknown,
  missingLabel = "缺失分组",
): string {
  if (!c.group) return s.name;
  const label = String(group ?? missingLabel);
  return visibleSeries(c).length === 1 ? label : `${s.name} · ${label}`;
}

/**
 * Plotly picks fractional steps (1, 1.5, 2 …) for short integer axes such as
 * epochs or seeds. Use a step of 1 when every finite value is an integer and
 * the span is short; leave everything else to Plotly's automatic ticks.
 */
export function integerAxisStep(values: unknown[]): number | undefined {
  const numbers = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (
    numbers.length < 2 ||
    numbers.length !== values.filter((v) => v != null).length
  )
    return undefined;
  if (!numbers.every((v) => Number.isInteger(v))) return undefined;
  const min = numbers.reduce((a, b) => Math.min(a, b), Infinity);
  const max = numbers.reduce((a, b) => Math.max(a, b), -Infinity);
  const span = max - min;
  return span > 0 && span <= 10 ? 1 : undefined;
}
