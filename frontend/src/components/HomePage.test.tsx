import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";
import type { Project } from "../lib/api";
const projects = Array.from(
  { length: 30 },
  (_, i) =>
    ({
      id: i + 1,
      name: `Research ${i + 1}`,
      description: `Description ${i + 1}`,
      experiment_count: 0,
      chart_count: 0,
      dataset_count: 0,
    }) as Project,
);
function fixture() {
  const onProject = vi.fn(),
    onChart = vi.fn();
  render(
    <HomePage
      projects={projects}
      currentId={30}
      charts={Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `Figure ${i + 1}`,
        revision: 1,
        updated_at: "2026-10-20T00:00:00Z",
      }))}
      chartsLoading={false}
      busy={false}
      onCreate={vi.fn()}
      onProject={onProject}
      onPlot={vi.fn()}
      onUpload={vi.fn()}
      onExperiments={vi.fn()}
      onData={vi.fn()}
      onChart={onChart}
      onRetry={vi.fn()}
    />,
  );
  return { onProject, onChart };
}
it("bounds initial project DOM, pins the current project and reveals more on demand", () => {
  fixture();
  expect(document.querySelectorAll(".workspace-project")).toHaveLength(8);
  expect(document.querySelector(".workspace-project")).toHaveTextContent(
    "Research 30",
  );
  fireEvent.click(screen.getByRole("button", { name: /显示更多项目/ }));
  expect(document.querySelectorAll(".workspace-project")).toHaveLength(20);
});
it("finds a project beyond the first batch and clears a no-match filter", () => {
  const { onProject } = fixture();
  fireEvent.change(screen.getByLabelText("搜索工作区项目"), {
    target: { value: "Description 24" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Research 24/ }));
  expect(onProject).toHaveBeenCalledWith(24);
  fireEvent.change(screen.getByLabelText("搜索工作区项目"), {
    target: { value: "no match" },
  });
  expect(screen.getByText("没有匹配的项目")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(document.querySelectorAll(".workspace-project")).toHaveLength(8);
});
it("opens a recent chart after progressive disclosure", () => {
  const { onChart } = fixture();
  expect(screen.queryByText("Figure 12")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /显示更多图表/ }));
  fireEvent.click(
    screen.getByText("Figure 12", { exact: true }).closest("button")!,
  );
  expect(onChart).toHaveBeenCalledWith(12);
});
