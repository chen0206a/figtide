import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FigureShowcase } from "./FigureShowcase";
afterEach(() => vi.unstubAllGlobals());
it("pauses the gallery explicitly and keeps cloned plates out of the accessibility tree", () => {
  render(<FigureShowcase />);
  expect(screen.getAllByRole("img")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "暂停示例播放" }));
  expect(document.querySelector(".showcase-track")).toHaveAttribute(
    "data-playing",
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "播放示例" }));
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
  expect(screen.getByText("静态浏览")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "播放示例" }),
  ).not.toBeInTheDocument();
  expect(document.querySelector(".showcase-track")).toHaveAttribute(
    "data-playing",
    "false",
  );
});
