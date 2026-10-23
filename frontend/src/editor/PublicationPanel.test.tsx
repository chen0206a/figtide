import { it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Dataset } from "../lib/api";
import { defaults } from "./model";
import { PublicationPanel } from "./PublicationPanel";
import {
  publicationMetrics,
  publicationPreset,
  renderConfig,
} from "./publication";
const data: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "synthetic.csv",
  row_count: 2,
  fields: [
    { name: "epoch", type: "number", missing: 0 },
    { name: "accuracy", type: "number", missing: 0 },
  ],
  rows: [
    { epoch: 1, accuracy: 0.8 },
    { epoch: 2, accuracy: 0.9 },
  ],
  warnings: [],
  sha256: "demo",
};
it("presets only patch existing publication fields and preserve style dimensions", () => {
  const c = defaults(data),
    before = structuredClone(c);
  for (const width of [88, 120, 180] as const) {
    const patch = publicationPreset(c, width);
    expect(Object.keys(patch)).toEqual(["publication"]);
    expect(patch.publication).toEqual({
      ...c.publication,
      enabled: true,
      widthMm: width,
    });
    expect({ ...c, ...patch }.style).toEqual(before.style);
  }
  expect(c).toEqual(before);
});
it("uses proportional height and existing physical typography conversion", () => {
  const c = defaults(data),
    single = { ...c, ...publicationPreset(c, 88) },
    double = { ...c, ...publicationPreset(c, 180) };
  expect(publicationMetrics(double).heightMm).toBeCloseTo((180 * 500) / 760);
  expect(renderConfig(single).style.fontSize).toBeGreaterThan(
    renderConfig(double).style.fontSize,
  );
  expect(renderConfig(double).style.width).toBe(760);
  expect(renderConfig(double).style.height).toBe(500);
});
it("new single ungrouped series hides legend while grouped and multiple series show it", () => {
  expect(defaults(data).legend.show).toBe(false);
  expect(
    defaults({
      ...data,
      fields: [
        ...data.fields,
        { name: "model", type: "string", role: "group", missing: 0 },
      ],
    }).legend.show,
  ).toBe(true);
  expect(
    defaults({
      ...data,
      fields: data.fields.map((f) => ({ ...f, role: "y" as const })),
    }).legend.show,
  ).toBe(true);
  const saved = {
    ...defaults(data),
    legend: { show: true, position: "top", orientation: "h" as const },
  };
  expect(renderConfig(saved).legend.show).toBe(true);
  expect(saved.legend.show).toBe(true);
});
it("property presets enable physical output, readonly height and clamped custom fields", () => {
  function Harness() {
    const [c, set] = useState(defaults(data));
    return (
      <>
        <PublicationPanel
          config={c}
          onChange={(p) => set((old) => ({ ...old, ...p }))}
        />
        <output>{JSON.stringify(c)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "双栏 · 180 mm" }));
  expect(screen.getByRole("switch")).toBeChecked();
  expect(screen.getByLabelText("成品宽度 / mm")).toHaveValue(180);
  expect(screen.getByLabelText("高度（按比例） / mm")).toHaveAttribute(
    "readonly",
  );
  fireEvent.click(screen.getByRole("button", { name: "自定义" }));
  expect(screen.getByLabelText("成品宽度 / mm")).toHaveFocus();
  fireEvent.change(screen.getByLabelText("成品宽度 / mm"), {
    target: { value: "400" },
  });
  expect(screen.getByLabelText("成品宽度 / mm")).toHaveValue(300);
  fireEvent.change(screen.getByLabelText("成品基础字号 / pt"), {
    target: { value: "2" },
  });
  expect(screen.getByLabelText("成品基础字号 / pt")).toHaveValue(4);
  fireEvent.change(screen.getByLabelText("PNG 目标 DPI"), {
    target: { value: "2000" },
  });
  expect(screen.getByLabelText("PNG 目标 DPI")).toHaveValue(1200);
});
