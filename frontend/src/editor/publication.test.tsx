import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { defaults, seriesEncoding } from "./model";
import { buildPlot } from "./plot";
import {
  publicationMetrics,
  renderConfig,
  physicalSvg,
  pngDensity,
} from "./publication";
import { PublicationPanel } from "./PublicationPanel";
import type { Dataset } from "../lib/api";
const data: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "synthetic.csv",
  sha256: "demo",
  row_count: 6,
  fields: [
    { name: "model", type: "string", missing: 0 },
    { name: "value", type: "number", missing: 1 },
  ],
  rows: [0, 1, 2, 3, 4, null].map((value) => ({ model: "A", value })),
  warnings: [],
};
describe("publication and empirical plots", () => {
  it("uses exact equal bins, keeps upper endpoint, and never changes raw rows", () => {
    const c = defaults(data);
    c.type = "histogram";
    c.empirical!.bins = 2;
    const before = JSON.stringify(data);
    const p = buildPlot(c, data);
    expect(p.traces[0].y).toEqual([2, 3]);
    expect(p.traces[0].x).toEqual([1, 3]);
    expect(p.summaries[0]).toMatchObject({ n: 5, missing: 1, excluded: 0 });
    expect(JSON.stringify(data)).toBe(before);
  });
  it("normalizes probability and density using included observations and warns on exclusions", () => {
    const c = defaults(data);
    c.type = "histogram";
    Object.assign(c.empirical!, {
      bins: 2,
      start: "1",
      end: "3",
      normalization: "probability",
    });
    expect(buildPlot(c, data).traces[0].y).toEqual([1 / 3, 2 / 3]);
    expect(buildPlot(c, data).summaries[0].excluded).toBe(2);
    Object.assign(c.empirical!, {
      start: "0",
      end: "4",
      normalization: "density",
    });
    expect(buildPlot(c, data).traces[0].y).toEqual([0.2, 0.3]);
  });
  it("shares automatic bin edges across categories", () => {
    const c = defaults(data);
    c.type = "histogram";
    c.group = "model";
    c.empirical!.bins = 2;
    const p = buildPlot(c, {
      ...data,
      rows: [
        { model: "A", value: 0 },
        { model: "A", value: 1 },
        { model: "B", value: 3 },
        { model: "B", value: 4 },
      ],
    });
    expect(p.traces[0].x).toEqual(p.traces[1].x);
    expect(p.traces.map((t) => t.y)).toEqual([
      [2, 0],
      [0, 2],
    ]);
  });
  it("makes a right-continuous ECDF, collapses ties, and handles missing/log values explicitly", () => {
    const c = defaults(data);
    c.type = "ecdf";
    const p = buildPlot(c, {
      ...data,
      rows: [1, 1, 3, null].map((value) => ({ model: "A", value })),
    });
    expect(p.traces[0].x).toEqual([1, 1, 3]);
    expect(p.traces[0].y).toEqual([0, 2 / 3, 1]);
    expect(p.traces[0].line.shape).toBe("hv");
    c.axes.x.log = true;
    expect(buildPlot(c, data).summaries[0]).toMatchObject({
      n: 4,
      missing: 1,
      excluded: 1,
    });
  });
  it("handles constant samples and reports invalid manual bounds without fake bars", () => {
    const c = defaults(data);
    c.type = "histogram";
    expect(
      buildPlot(c, {
        ...data,
        rows: [{ model: "A", value: 7 }],
      }).traces[0].y.reduce((a: number, b: number) => a + b, 0),
    ).toBe(1);
    c.empirical!.start = "10";
    c.empirical!.end = "1";
    expect(buildPlot(c, data).traces).toHaveLength(0);
  });
  it("computes physical font/DPI independently from editor zoom and preserves disabled legacy styles", () => {
    const c = defaults(data);
    const before = JSON.stringify(c);
    expect(renderConfig(c)).toBe(c);
    c.publication = { enabled: true, widthMm: 89, fontPt: 7, dpi: 300 };
    const m = publicationMetrics(c);
    expect(m.pixelWidth).toBe(1051);
    expect((((m.fontPx * 89) / 760) * 72) / 25.4).toBeCloseTo(7, 8);
    expect(buildPlot(c, data).layout.font.size).toBeCloseTo(m.fontPx);
    expect(c.style.fontSize).toBe(14);
    expect(JSON.parse(before).publication.enabled).toBe(false);
  });
  it("writes SVG mm dimensions while preserving viewBox, text and vector paths", () => {
    const c = defaults(data);
    c.publication!.enabled = true;
    c.publication!.widthMm = 89;
    const raw =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="500"><text>合成样本</text><path d="M0 0L1 1"/></svg>',
      );
    const xml = decodeURIComponent(
      physicalSvg(raw, c).split(",").slice(1).join(","),
    );
    expect(xml).toContain('width="89mm"');
    expect(xml).toContain('viewBox="0 0 760 500"');
    expect(xml).toContain("合成样本");
    expect(xml).toContain("<path");
    expect(xml).not.toContain("<image");
  });
  it("writes a PNG pHYs density chunk without changing image data", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=";
    const bytes = Uint8Array.from(
      atob(pngDensity(png, 300).split(",")[1]),
      (c) => c.charCodeAt(0),
    );
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(37, 41))).toBe("pHYs");
    expect(view.getUint32(41)).toBe(11811);
    expect(bytes[49]).toBe(1);
    expect(view.getUint32(16)).toBe(1);
    const updated = Uint8Array.from(
      atob(pngDensity(pngDensity(png, 300), 600).split(",")[1]),
      (c) => c.charCodeAt(0),
    );
    expect(updated.length).toBe(bytes.length);
    expect(new DataView(updated.buffer).getUint32(41)).toBe(23622);
    const original = Uint8Array.from(atob(png.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    expect(updated.slice(54)).toEqual(original.slice(33));
  });
  it("maps scientific heatmap center consistently to cells and colorbar and adds contrasting vector labels", () => {
    const c = defaults(data);
    c.type = "heatmap";
    c.x = "model";
    c.heatY = "model";
    c.heatZ = "value";
    Object.assign(c.heatmap!, {
      palette: "blueRed",
      min: "-2",
      max: "6",
      center: "0",
      labels: true,
    });
    const p = buildPlot(c, {
      ...data,
      rows: [
        { model: "A", value: -2 },
        { model: "B", value: 0 },
        { model: "C", value: 6 },
      ],
    });
    expect(p.layout.shapes.map((s: any) => s.fillcolor)).toEqual([
      "#2166ac",
      "#f7f7f7",
      "#b2182b",
    ]);
    expect(p.layout.annotations).toHaveLength(3);
    expect(p.traces[0].marker.colorscale[2]).toEqual([0.25, "#f7f7f7"]);
    expect(p.layout.annotations[1].font.color).toBe("#000000");
  });
  it("applies redundant series encoding and updates physical form state", () => {
    expect(seriesEncoding("Clean Academic", 0).color).toBe(
      seriesEncoding("Clean Academic", 5).color,
    );
    expect(seriesEncoding("Clean Academic", 0).dash).not.toBe(
      seriesEncoding("Clean Academic", 5).dash,
    );
    function Harness() {
      const [c, set] = useState(defaults(data));
      return (
        <>
          <PublicationPanel
            config={c}
            onChange={(v) => set((old) => ({ ...old, ...v }))}
          />
          <output>{JSON.stringify(c)}</output>
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("switch", { name: "按论文物理尺寸输出" }));
    fireEvent.click(screen.getByRole("button", { name: "单栏 · 88 mm" }));
    expect(
      JSON.parse(screen.getByRole("status").textContent!).publication,
    ).toMatchObject({ enabled: true, widthMm: 88 });
  });
});
