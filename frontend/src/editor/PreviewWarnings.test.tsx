import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PreviewWarnings } from "./PreviewWarnings";
import { StyleThumbnail } from "./StyleThumbnail";
import { applyPreset, presetThumbnail, stylePresets } from "./stylePresets";
import { defaults } from "./model";
import type { Dataset } from "../lib/api";
afterEach(cleanup);
describe("preview diagnostics", () => {
  it("does not show an empty warning panel", () => {
    const { container } = render(<PreviewWarnings warnings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("collapses 180 diagnostics and reveals every original message in bounded batches", async () => {
    const warnings = Array.from(
      { length: 180 },
      (_, i) => `series / ${i} 样本不足或为常量：仅显示真实观测点，不估计密度`,
    );
    const { container } = render(<PreviewWarnings warnings={warnings} />);
    expect(screen.getByText("180 条数据提示")).toBeVisible();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(container.textContent).not.toContain(warnings[0]);
    fireEvent.click(container.querySelector("summary")!);
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(30),
    );
    expect(screen.getByText(warnings[0])).toBeVisible();
    for (let remaining = 150; remaining >= 30; remaining -= 30)
      fireEvent.click(
        screen.getByRole("button", {
          name: `再显示 30 条（剩余 ${remaining}）`,
        }),
      );
    expect(screen.getAllByRole("listitem")).toHaveLength(180);
    expect(screen.getByText(warnings[179])).toBeVisible();
  });
});
describe("distinct preset examples", () => {
  it("always shows three illustrative series even for a single-series chart, with distinct encodings", () => {
    const signatures = new Set<string>();
    for (const preset of stylePresets) {
      const profile = presetThumbnail(preset.key);
      expect(profile.series).toHaveLength(3);
      const { container, unmount } = render(
        <StyleThumbnail profile={profile} />,
      );
      expect(container.querySelectorAll("[data-sample-series]")).toHaveLength(
        3,
      );
      expect(container.querySelectorAll("polyline")).toHaveLength(3);
      signatures.add(
        JSON.stringify([profile.series, profile.legend, profile.axes]),
      );
      unmount();
    }
    expect(signatures.size).toBe(4);
    const accessible = presetThumbnail("Okabe–Ito");
    expect(new Set(accessible.series.map((s) => s.symbol)).size).toBe(3);
    expect(new Set(accessible.series.map((s) => s.dash)).size).toBe(3);
    expect(accessible.legend.position).toBe("bottom");
  });
  it("applies the same palette and encodings as the sample while retaining legend visibility and scientific settings", () => {
    const d = {
      id: 1,
      fields: [
        { name: "x", type: "number" },
        { name: "y", type: "number" },
      ],
      rows: [{ x: 1, y: 2 }],
      warnings: [],
    } as unknown as Dataset;
    const c = defaults(d);
    c.legend.show = false;
    const before = JSON.stringify(c);
    for (const preset of stylePresets) {
      const sample = presetThumbnail(preset.key),
        applied = applyPreset(c, preset.key);
      for (const key of ["color", "width", "size", "dash", "symbol"] as const)
        expect(applied.series[0][key]).toBe(sample.series[0][key]);
      expect(applied.legend.show).toBe(false);
      expect(applied.legend.position).toBe(sample.legend.position);
      expect(applied.type).toBe(c.type);
      expect(applied.x).toBe(c.x);
      expect(applied.datasetVersionId).toBe(c.datasetVersionId);
    }
    expect(JSON.stringify(c)).toBe(before);
  });
});
