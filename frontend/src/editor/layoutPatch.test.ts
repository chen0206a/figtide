import { expect, it } from "vitest";
import { layoutPatch } from "./layoutPatch";
it("clears removed axis ranges, tick steps and legend anchors explicitly", () => {
  expect(
    layoutPatch(
      {
        xaxis: { type: "log", range: [0, 2], dtick: 1 },
        legend: { xanchor: "left", x: 1 },
      },
      { xaxis: { type: "linear", autorange: true }, legend: { x: 0 } },
    ),
  ).toEqual({
    "xaxis.type": "linear",
    "xaxis.range": null,
    "xaxis.dtick": null,
    "xaxis.autorange": true,
    "legend.xanchor": null,
    "legend.x": 0,
  });
});
it("replaces annotation arrays atomically without mutating either layout", () => {
  const previous = {
    annotations: [{ text: "old" }],
    font: { color: "#000", size: 16 },
  };
  const next = { annotations: [], font: { color: "#123", size: 16 } };
  const patch = layoutPatch(previous, next);
  expect(patch).toEqual({ annotations: [], "font.color": "#123" });
  (patch.annotations as unknown[]).push({ text: "extra" });
  expect(next.annotations).toEqual([]);
  expect(previous.annotations).toEqual([{ text: "old" }]);
});
it("does not relayout identical arrays or unchanged nested values", () => {
  const layout = {
    xaxis: { domain: [0, 1] },
    annotations: [{ text: "caption" }],
    showlegend: false,
  };
  expect(layoutPatch(layout, structuredClone(layout))).toEqual({});
});
