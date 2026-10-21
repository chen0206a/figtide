import { expect, it } from "vitest";
import { chartDraftKey, readChartDraft, sameDraftContent } from "./chartDraft";
import config from "../../../docs/config-v1.example.json";
import type { Config } from "../editor/model";
const draft = {
  config: { ...config, datasetVersionId: 12 },
  name: "Saved locally",
  revision: 3,
  at: "2026-10-21T00:00:00Z",
};
it("isolates drafts by project, saved chart and new-chart dataset", () => {
  const keys = [
    chartDraftKey(1, null, 12),
    chartDraftKey(1, null, 13),
    chartDraftKey(2, null, 12),
    chartDraftKey(1, 7, 12),
  ];
  expect(new Set(keys).size).toBe(4);
});
it("restores exact configuration only from data belonging to this project", () => {
  const storage = { getItem: () => JSON.stringify(draft) };
  expect(readChartDraft(storage, "draft", [12])?.config).toEqual(draft.config);
  expect(readChartDraft(storage, "draft", [13])).toBeNull();
});
it("migrates matching legacy drafts without confusing a different dataset", () => {
  const storage = {
    getItem: (key: string) => (key === "old" ? JSON.stringify(draft) : null),
  };
  expect(
    readChartDraft(storage, "new", [12, 13], ["old"], 12)?.storageKey,
  ).toBe("old");
  expect(readChartDraft(storage, "new", [12, 13], ["old"], 13)).toBeNull();
});
it("rejects damaged and unsupported drafts without throwing", () => {
  for (const value of [
    "{bad",
    JSON.stringify({ ...draft, revision: -1 }),
    JSON.stringify({ ...draft, config: { schema_version: 2 } }),
  ])
    expect(readChartDraft({ getItem: () => value }, "draft", [12])).toBeNull();
});
it("recognizes an already-saved snapshot even if the database changed JSON key order", () => {
  const reordered = Object.fromEntries(
    Object.entries(draft.config).reverse(),
  ) as unknown as Config;
  expect(
    sameDraftContent(
      {
        ...draft,
        config: draft.config as unknown as Config,
        storageKey: "key",
      },
      { name: draft.name, config: reordered },
    ),
  ).toBe(true);
  expect(
    sameDraftContent(
      {
        ...draft,
        config: draft.config as unknown as Config,
        storageKey: "key",
      },
      { name: "Different", config: reordered },
    ),
  ).toBe(false);
});
