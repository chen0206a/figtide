import { it, expect, vi } from "vitest";
import { fittedZoom } from "./fitZoom";

it("fits the complete paper group including padding and optional physical ruler", () => {
  const stage = document.createElement("div");
  stage.style.padding = "28px 32px";
  stage.innerHTML = '<div class="paper-group"><div class="paper-wrap"></div></div>';
  Object.defineProperties(stage, {
    clientWidth: { value: 742 }, clientHeight: { value: 545 },
  });
  const group = stage.querySelector<HTMLElement>(".paper-group")!;
  const paper = stage.querySelector<HTMLElement>(".paper-wrap")!;
  const rect = (height: number) => ({ height }) as DOMRect;
  vi.spyOn(group, "getBoundingClientRect").mockReturnValue(rect(518.375));
  vi.spyOn(paper, "getBoundingClientRect").mockReturnValue(rect(456));
  expect(fittedZoom(stage, 2400, 2400)).toBe(17);
  // The ruler adds 32px of unscaled chrome; recompute without changing config.
  vi.mocked(group.getBoundingClientRect).mockReturnValue(rect(550.375));
  expect(fittedZoom(stage, 2400, 2400)).toBe(16);
  expect(fittedZoom(stage, 250, 250)).toBe(100);
});
