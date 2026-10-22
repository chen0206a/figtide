import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Project } from "../../lib/api";
import { HomePage, type HomePageProps } from "./HomePage";

// Plotly is not needed to verify the home page wiring.
vi.mock("../../editor/FigurePreview", () => ({
  default: ({ label }: { label: string }) => (
    <div role="img" aria-label={label} />
  ),
}));

const projects = Array.from(
  { length: 30 },
  (_, i) =>
    ({
      id: i + 1,
      name: `Research ${i + 1}`,
      description: `Description ${i + 1}`,
      experiment_count: i,
      chart_count: 0,
      dataset_count: 1,
    }) as Project,
);
const charts = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Figure ${i + 1}`,
  revision: 1,
  updated_at: "2026-10-20T00:00:00Z",
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.endsWith("/agent/provider")
        ? { available: true, model: "test-model" }
        : /\/charts\/\d+$/.test(url)
          ? {
              id: 1,
              name: "Figure 1",
              revision: 1,
              updated_at: "2026-10-20T00:00:00Z",
              dataset_version_id: 7,
              config: {
                datasetVersionId: 7,
                type: "line",
                style: { preset: "Clean Academic", width: 760, height: 500 },
              },
            }
          : /\/data\/\d+$/.test(url)
            ? {
                id: 7,
                filename: "curves.csv",
                version: 1,
                fields: [],
                rows: [],
              }
            : url.endsWith("/experiments")
              ? []
              : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function fixture(overrides: Partial<HomePageProps> = {}) {
  const props: HomePageProps = {
    projects,
    currentId: 30,
    charts,
    chartsLoading: false,
    busy: false,
    onCreate: vi.fn(),
    onProject: vi.fn(),
    onPlot: vi.fn(),
    onUpload: vi.fn(),
    onExperiments: vi.fn(),
    onData: vi.fn(),
    onChart: vi.fn(),
    onRetry: vi.fn(),
    onAssistant: vi.fn(),
    onModelConnection: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HomePage {...props} />
    </QueryClientProvider>,
  );
  return props;
}

it("puts the latest chart first with a real preview and opens it", async () => {
  const p = fixture();
  expect(
    await screen.findByRole("img", { name: "Figure 1 的预览" }),
  ).toBeVisible();
  expect(screen.getByText(/FIGURE 01 · LINE · CLEAN ACADEMIC/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /继续编辑/ }));
  expect(p.onChart).toHaveBeenCalledWith(1);
});

it("lists the remaining charts and reveals more on demand", () => {
  const p = fixture();
  const recents = screen.getByRole("region", { name: "最近图表" });
  expect(recents.querySelectorAll(".home-list-item")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: /显示更多图表/ }));
  fireEvent.click(screen.getByText("Figure 12").closest("button")!);
  expect(p.onChart).toHaveBeenCalledWith(12);
});

it("pins the current project, searches and shows more projects", () => {
  const p = fixture();
  const rows = () => document.querySelectorAll(".home-project");
  expect(rows()).toHaveLength(4);
  expect(rows()[0]).toHaveTextContent("Research 30");
  expect(rows()[0]).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: /显示更多项目/ }));
  expect(rows()).toHaveLength(12);
  fireEvent.change(screen.getByLabelText("搜索工作区项目"), {
    target: { value: "Research 24" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Research 24/ }));
  expect(p.onProject).toHaveBeenCalledWith(24);
  fireEvent.change(screen.getByLabelText("搜索工作区项目"), {
    target: { value: "missing" },
  });
  expect(screen.getByText(/没有匹配的项目/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(rows()).toHaveLength(4);
});

it("keeps quick actions working and blocks a duplicate import while busy", () => {
  const p = fixture({ busy: true });
  for (const upload of screen.getAllByRole("button", { name: /导入/ })) {
    expect(upload).toBeDisabled();
    fireEvent.click(upload);
  }
  expect(p.onUpload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^新建图表.*11 类/ }));
  fireEvent.click(screen.getByRole("button", { name: /^对比实验/ }));
  fireEvent.click(screen.getByRole("button", { name: /^处理与汇总/ }));
  expect(p.onPlot).toHaveBeenCalledOnce();
  expect(p.onExperiments).toHaveBeenCalledOnce();
  expect(p.onData).toHaveBeenCalledOnce();
});

it("routes every entry to project creation when no project is selected", () => {
  const p = fixture({ currentId: 0, charts: [] });
  fireEvent.click(screen.getByRole("button", { name: /^创建第一个项目/ }));
  fireEvent.click(screen.getByRole("button", { name: /^导入数据.*自动识别/ }));
  fireEvent.click(screen.getByRole("button", { name: /^对比实验/ }));
  fireEvent.click(screen.getByRole("button", { name: /^处理与汇总/ }));
  expect(p.onCreate).toHaveBeenCalledTimes(4);
  expect(p.onPlot).not.toHaveBeenCalled();
  expect(p.onUpload).not.toHaveBeenCalled();
});

it("hands the assistant prompt to the editor without sending it", async () => {
  const p = fixture();
  const input = await screen.findByLabelText(/对最近的图说出想改的地方/);
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "隐藏网格线" }));
  fireEvent.click(screen.getByRole("button", { name: "在编辑器中打开助手" }));
  expect(p.onAssistant).toHaveBeenCalledWith(1, "隐藏网格线");
});

it("marks a chart with an unsaved local draft", async () => {
  localStorage.setItem(
    "labflow-draft-v1:30:1",
    JSON.stringify({ at: new Date().toISOString() }),
  );
  fixture();
  expect(await screen.findByText(/有未保存修改/)).toBeVisible();
  localStorage.clear();
});
