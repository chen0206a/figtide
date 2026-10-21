import type { Config } from "../editor/model";
export type ChartDraft = {
  config: Config;
  name: string;
  revision: number;
  at: string;
  storageKey: string;
};
export const chartDraftKey = (
  project: number,
  chart: number | null,
  dataset: number,
) => `labflow-draft-v1:${project}:${chart ?? `new-${dataset}`}`;
/** Read only known data versions; legacy new-chart drafts migrate on the next successful write. */
export function readChartDraft(
  storage: Pick<Storage, "getItem">,
  key: string,
  datasets: number[],
  legacyKeys: string[] = [],
  initialDataset = 0,
): ChartDraft | null {
  for (const storageKey of [key, ...legacyKeys]) {
    try {
      const d = JSON.parse(storage.getItem(storageKey) || "null");
      const c = d?.config;
      if (
        c?.schema_version !== 1 ||
        !Array.isArray(c.series) ||
        !c.style ||
        !c.axes?.x ||
        !c.axes?.y ||
        !c.legend ||
        !Array.isArray(c.annotations) ||
        !Array.isArray(c.transforms) ||
        typeof d.name !== "string" ||
        !Number.isInteger(d.revision) ||
        d.revision < 0 ||
        !datasets.includes(c.datasetVersionId)
      )
        continue;
      if (storageKey !== key && c.datasetVersionId !== initialDataset) continue;
      return { ...d, storageKey };
    } catch {
      /* A damaged or unavailable draft must not prevent opening saved work. */
    }
  }
  return null;
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
export const sameDraftContent = (
  draft: ChartDraft,
  original: { config: Config; name: string },
) =>
  JSON.stringify(canonical({ config: draft.config, name: draft.name })) ===
  JSON.stringify(canonical({ config: original.config, name: original.name }));
