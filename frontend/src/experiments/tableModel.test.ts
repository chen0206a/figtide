import { describe, it, expect } from "vitest";
import {
  defaultColumns,
  defaultSort,
  inferColumns,
  readColumns,
  readView,
  sortRows,
  writeColumns,
  writeView,
} from "./tableModel";
import type { Experiment } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";
const row = (
  id: number,
  metrics: Experiment["metrics"],
  parameters: Experiment["parameters"] = {},
): Experiment => ({
  id,
  name: `run${id}`,
  project_id: 1,
  metrics,
  parameters,
  notes: "",
  status: "completed",
  tags: [],
  revision: 1,
  created_at: "2026-10-23T10:10:00Z",
  updated_at: `2026-10-${20 + id}T10:10:00Z`,
  datasets: [],
  dataset_version_ids: [],
});
const storage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) || null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
};
describe("experiment table", () => {
  it("infers keys from all records ranked by frequency and deterministic ties", () => {
    const all = inferColumns([
      row(1, { accuracy: 1, loss: 2 }, { seed: 1, lr: 2 }),
      row(2, { loss: 1 }, { lr: 1, batch: 32 }),
    ]);
    expect(all).toEqual({
      parameters: ["lr", "batch", "seed"],
      metrics: ["loss", "accuracy"],
    });
    expect(
      defaultColumns({
        parameters: ["a", "b", "c", "d", "e"],
        metrics: ["a", "b", "c", "d"],
      }),
    ).toEqual({ parameters: ["a", "b", "c", "d"], metrics: ["a", "b", "c"] });
  });
  it("sorts real numbers numerically while null and missing stay last in both directions", () => {
    const rows = [
      row(1, { accuracy: null }),
      row(2, { accuracy: 2 }),
      row(3, { accuracy: 10 }),
      row(4, {}),
    ];
    expect(
      sortRows(rows, {
        kind: "metrics",
        key: "accuracy",
        direction: "desc",
      }).map((r) => r.id),
    ).toEqual([3, 2, 1, 4]);
    expect(
      sortRows(rows, {
        kind: "metrics",
        key: "accuracy",
        direction: "asc",
      }).map((r) => r.id),
    ).toEqual([2, 3, 1, 4]);
    expect(rows[0].metrics.accuracy).toBeNull();
  });
  it("defaults to a known metric descending, otherwise update time descending", () => {
    expect(
      defaultSort({ parameters: [], metrics: ["throughput", "accuracy"] }),
    ).toEqual({ kind: "metrics", key: "accuracy", direction: "desc" });
    expect(defaultSort({ parameters: [], metrics: ["throughput"] }).kind).toBe(
      "updated_at",
    );
  });
  it("persists views and isolates columns by project, including intentional empty selections", () => {
    const s = storage();
    writeView("cards", s);
    expect(readView(s)).toBe("cards");
    writeColumns(1, { parameters: [], metrics: ["accuracy"] }, s);
    expect(readColumns(1, s)).toEqual({
      parameters: [],
      metrics: ["accuracy"],
    });
    expect(readColumns(2, s)).toBeNull();
  });
  it("uses defaults when storage is blocked and never throws on writes", () => {
    const s = {
      getItem: () => {
        throw Error("denied");
      },
      setItem: () => {
        throw Error("denied");
      },
    };
    expect(readView(s)).toBe("table");
    expect(readColumns(1, s)).toBeNull();
    expect(() => {
      writeView("cards", s);
      writeColumns(1, { parameters: [], metrics: [] }, s);
    }).not.toThrow();
  });
  it("rejects corrupt preferences without blocking the page", () => {
    const s = storage();
    s.setItem("labflow-experiment-columns:1", '{"parameters":3,"metrics":[]}');
    expect(readColumns(1, s)).toBeNull();
    s.setItem("labflow-experiments-view", "unknown");
    expect(readView(s)).toBe("table");
  });
  it("formats dates in local time with stable cross-year and invalid handling", () => {
    const d = new Date(2026, 9, 23, 17, 10);
    expect(formatDateTime(d.toISOString())).toBe("2026-10-23 17:10");
    expect(formatDate(d.toISOString(), d)).toBe("10/23");
    expect(formatDate(new Date(2025, 9, 23).toISOString(), d)).toBe(
      "2025-10-23",
    );
    expect(formatDateTime("bad")).toBe("—");
  });
});
