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
function fixture(options: { busy?: boolean; currentId?: number } = {}) {
  const onProject = vi.fn(),
    onChart = vi.fn();
  const onCreate = vi.fn(),
    onPlot = vi.fn(),
    onUpload = vi.fn(),
    onExperiments = vi.fn(),
    onData = vi.fn();
  render(
    <HomePage
      projects={projects}
      currentId={options.currentId ?? 30}
      charts={Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `Figure ${i + 1}`,
        revision: 1,
        updated_at: "2026-10-20T00:00:00Z",
      }))}
      chartsLoading={false}
      busy={options.busy ?? false}
      onCreate={onCreate}
      onProject={onProject}
      onPlot={onPlot}
      onUpload={onUpload}
      onExperiments={onExperiments}
      onData={onData}
      onChart={onChart}
      onRetry={vi.fn()}
    />,
  );
  return {
    onProject,
    onChart,
    onCreate,
    onPlot,
    onUpload,
    onExperiments,
    onData,
  };
}
it("bounds initial project DOM, pins the current project and reveals more on demand", () => {
  fixture();
  expect(document.querySelectorAll(".workspace-project")).toHaveLength(4);
  expect(document.querySelector(".workspace-project")).toHaveTextContent(
    "Research 30",
  );
  fireEvent.click(screen.getByRole("button", { name: /显示更多项目/ }));
  expect(document.querySelectorAll(".workspace-project")).toHaveLength(12);
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
  expect(document.querySelectorAll(".workspace-project")).toHaveLength(4);
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

it("keeps all four entry points actionable and blocks a duplicate import while busy", () => {
  const callbacks = fixture({ busy: true });
  const upload = screen.getByRole("button", { name: /^正在导入/ });
  expect(upload).toBeDisabled();
  fireEvent.click(upload);
  expect(callbacks.onUpload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^绘图工作台/ }));
  fireEvent.click(screen.getByRole("button", { name: /^实验笔记/ }));
  fireEvent.click(screen.getByRole("button", { name: /^数据资料库/ }));
  expect(callbacks.onPlot).toHaveBeenCalledOnce();
  expect(callbacks.onExperiments).toHaveBeenCalledOnce();
  expect(callbacks.onData).toHaveBeenCalledOnce();
});
it("opens project creation from every entry when no project is selected", () => {
  const callbacks = fixture({ currentId: 0 });
  for (const name of [/^绘图工作台/, /^导入数据/, /^实验笔记/, /^数据资料库/])
    fireEvent.click(screen.getByRole("button", { name }));
  expect(callbacks.onCreate).toHaveBeenCalledTimes(4);
  expect(callbacks.onPlot).not.toHaveBeenCalled();
  expect(callbacks.onUpload).not.toHaveBeenCalled();
});
