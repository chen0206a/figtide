import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FigureShowcase } from "./FigureShowcase";
afterEach(() => vi.unstubAllGlobals());
it("keeps the gallery moving without playback controls and hides duplicate plates from assistive technology", () => {
  render(<FigureShowcase />);
  expect(screen.getAllByRole("img")).toHaveLength(10);
  expect(
    screen.queryByRole("button", { name: /暂停|播放/ }),
  ).not.toBeInTheDocument();
  expect(document.querySelector(".showcase-copy")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(document.querySelector(".showcase-copy")).toHaveAttribute("inert");
  expect(document.querySelector(".showcase-track")).toHaveAttribute(
    "data-playing",
    "true",
  );
});
it("identifies external reference plates and exposes source and license links", () => {
  render(<FigureShowcase />);
  fireEvent.click(screen.getByRole("button", { name: /素材来源/ }));
  expect(screen.getByRole("dialog")).toHaveTextContent("并非 LabFlow 导出截图");
  expect(
    screen.getByRole("link", { name: "查看 Matplotlib 完整许可" }),
  ).toHaveAttribute("href", "/showcase/MATPLOTLIB-LICENSE.txt");
});
it("uses a static gallery for reduced-motion users", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(<FigureShowcase />);
  expect(
    screen.queryByRole("button", { name: "播放示例" }),
  ).not.toBeInTheDocument();
  expect(document.querySelector(".showcase-track")).toHaveAttribute(
    "data-playing",
    "false",
  );
});
