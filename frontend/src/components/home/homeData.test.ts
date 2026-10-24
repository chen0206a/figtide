import { describe, expect, it } from "vitest";
import type { Experiment } from "../../lib/api";
import {
  bestIndex,
  dateLabel,
  formatMetric,
  greeting,
  localDraftInfo,
  metricColumns,
  metricDirection,
  relativeTime,
} from "./homeData";

const experiment = (
  id: number,
  metrics: Experiment["metrics"],
): Experiment => ({
  id,
  project_id: 1,
  name: `EXP-${id}`,
  parameters: {},
  metrics,
  notes: "",
  status: "completed",
  tags: [],
  revision: 1,
  created_at: "2026-10-18T00:00:00Z",
  updated_at: `2026-10-18T00:00:0${id}Z`,
  dataset_version_ids: [],
  datasets: [],
});

describe("home labels", () => {
  it("greets by local hour and formats the date", () => {
    expect(greeting(new Date(2026, 9, 22, 9))).toBe("早上好");
    expect(greeting(new Date(2026, 9, 22, 14))).toBe("下午好");
    expect(greeting(new Date(2026, 9, 22, 21))).toBe("晚上好");
    expect(dateLabel(new Date(2026, 9, 22))).toBe("10月22日 · 星期四");
  });
  it("formats relative time without inventing precision", () => {
    const now = new Date(2026, 9, 22, 12, 0);
    expect(relativeTime(new Date(2026, 9, 22, 11, 58).toISOString(), now)).toBe(
      "2 分钟前",
    );
    expect(relativeTime(new Date(2026, 9, 22, 8, 0).toISOString(), now)).toBe(
      "4 小时前",
    );
    expect(relativeTime(new Date(2026, 9, 21, 8, 0).toISOString(), now)).toBe(
      "昨天",
    );
    expect(relativeTime(new Date(2026, 9, 19, 8, 0).toISOString(), now)).toBe(
      "10/19",
    );
    expect(relativeTime("not a date", now)).toBe("");
  });
});

describe("local draft detection", () => {
  it("reads only the saved chart's draft key and tolerates damage", () => {
    const store = new Map<string, string>([
      ["labflow-draft-v1:5:4", JSON.stringify({ at: "2026-10-22T03:00:00Z" })],
      ["labflow-draft-v1:5:9", "{broken"],
    ]);
    const storage = { getItem: (k: string) => store.get(k) ?? null };
    expect(localDraftInfo(storage, 5, 4)).toEqual({
      at: "2026-10-22T03:00:00Z",
    });
    expect(localDraftInfo(storage, 5, 9)).toBeNull();
    expect(localDraftInfo(storage, 5, 1)).toBeNull();
    expect(
      localDraftInfo(
        {
          getItem: () => {
            throw new Error("blocked");
          },
        },
        5,
        4,
      ),
    ).toBeNull();
  });
});

describe("experiment metric columns", () => {
  const rows = [
    experiment(1, { accuracy: 87.1, macro_f1: 0.861, note: "x" }),
    experiment(2, { accuracy: 92.8, macro_f1: 0.916, loss: 0.2 }),
    experiment(3, { accuracy: 84.6, macro_f1: 0.834, loss: 0.3 }),
  ];
  it("picks the most common numeric metrics", () => {
    expect(metricColumns(rows)).toEqual(["accuracy", "macro_f1"]);
  });
  it("highlights only metrics with a known direction", () => {
    expect(metricDirection("accuracy")).toBe("max");
    expect(metricDirection("val_loss")).toBe("min");
    expect(metricDirection("throughput")).toBeNull();
    expect(bestIndex(rows, "accuracy")).toBe(1);
    expect(bestIndex(rows, "loss")).toBe(1);
    expect(bestIndex(rows, "note")).toBe(-1);
  });
  it("does not highlight ties or single values", () => {
    expect(
      bestIndex([experiment(1, { acc: 1 }), experiment(2, { acc: 1 })], "acc"),
    ).toBe(-1);
    expect(bestIndex([experiment(1, { acc: 1 })], "acc")).toBe(-1);
  });
  it("formats metric values compactly", () => {
    expect(formatMetric(92.8)).toBe("92.8");
    expect(formatMetric(0.91634)).toBe("0.9163");
    expect(formatMetric(42)).toBe("42");
    expect(formatMetric("n/a")).toBe("—");
  });
});
