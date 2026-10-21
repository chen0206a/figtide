import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReuseDialog } from "./ReuseDialog";
import { defaults, defaultBand } from "./model";
import { applyPreset, stylePresets, styleProfile } from "./stylePresets";
import type { Dataset } from "../lib/api";
vi.mock("./StylePreview", () => ({
  StylePreview: ({ config }: { config: any }) => (
    <div aria-label="当前数据样式预览">{config.style.fontSize}</div>
  ),
}));
const data: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "demo.csv",
  sha256: "demo",
  row_count: 2,
  fields: [
    { name: "x", type: "number", missing: 0 },
    { name: "y", type: "number", missing: 0 },
  ],
  rows: [
    { x: 1, y: 2 },
    { x: 2, y: 3 },
  ],
  warnings: [],
};
const config = defaults(data);
const templates = Array.from({ length: 13 }, (_, i) => ({
  id: i + 1,
  project_id: i === 12 ? 2 : 1,
  project_name: i === 12 ? "Other project" : "My project",
  name: `Template ${i + 1}`,
  profile: styleProfile(applyPreset(config, "Modern Research")),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(initialTab: "builtin" | "style" = "style") {
  let list = structuredClone(templates);
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    const id = Number(url.split("/").at(-1));
    if (options?.method === "PATCH")
      list = list.map((t) =>
        t.id === id ? { ...t, name: JSON.parse(String(options.body)).name } : t,
      );
    if (options?.method === "DELETE") list = list.filter((t) => t.id !== id);
    return new Response(JSON.stringify(options?.method ? { id } : list), {
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const apply = vi.fn(),
    close = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReuseDialog
        project={1}
        name="Figure"
        config={config}
        datasets={[data]}
        initialTab={initialTab}
        onClose={close}
        onApply={apply}
        onReused={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { apply, close, fetcher };
}
describe("style library", () => {
  it("previews builtins without editing the chart, then applies once", () => {
    const { apply, close } = setup("builtin");
    fireEvent.click(
      screen.getByRole("button", { name: "预览内置样式 Modern Research" }),
    );
    expect(screen.getByLabelText("当前数据样式预览")).toHaveTextContent("16");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "应用内置样式 Modern Research" }),
    );
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0].datasetVersionId).toBe(1);
    expect(close).toHaveBeenCalledOnce();
  });
  it("defaults to current project, paginates, and searches across projects explicitly", async () => {
    const { apply } = setup();
    await screen.findByRole("button", { name: "预览模板 Template 1" });
    expect(
      screen.queryByRole("button", { name: "预览模板 Template 13" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^预览模板/ })).toHaveLength(
      9,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "显示更多模板（剩余 3）" }),
    );
    expect(screen.getAllByRole("button", { name: /^预览模板/ })).toHaveLength(
      12,
    );
    fireEvent.change(screen.getByLabelText("模板项目范围"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("搜索样式模板"), {
      target: { value: "Other project" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "预览模板 Template 13" }),
    );
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "应用样式 Template 13" }),
    );
    expect(apply.mock.calls[0][0].style.fontSize).toBe(16);
  });
  it("renames through the API and requires a second action for deletion", async () => {
    const { fetcher } = setup();
    await screen.findByRole("button", { name: "重命名 Template 1" });
    fireEvent.click(screen.getByRole("button", { name: "重命名 Template 1" }));
    fireEvent.change(screen.getByLabelText("新模板名称"), {
      target: { value: "  My paper  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));
    await screen.findByRole("button", { name: "预览模板 My paper" });
    expect(
      fetcher.mock.calls.some(
        ([url, o]) =>
          url === "/api/style-templates/1" &&
          o?.method === "PATCH" &&
          JSON.parse(String(o.body)).name === "My paper",
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "删除 My paper" }));
    expect(fetcher.mock.calls.some(([, o]) => o?.method === "DELETE")).toBe(
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "保留模板" }));
    fireEvent.click(screen.getByRole("button", { name: "删除 My paper" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除模板" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "预览模板 My paper" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("已有图表保持原样");
  });
  it("shows API failures and retains the template for retry", async () => {
    const { fetcher } = setup();
    await screen.findByRole("button", { name: "删除 Template 1" });
    fireEvent.click(screen.getByRole("button", { name: "删除 Template 1" }));
    fetcher.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ message: "写入失败" }), { status: 500 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "确认删除模板" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("写入失败");
    expect(
      screen.getByRole("button", { name: "预览模板 Template 1" }),
    ).toBeInTheDocument();
  });
  it("all presets retain data, axis ranges, transforms, errors and statistical semantics", () => {
    const c = structuredClone(config);
    c.series[0].error = "err";
    c.series[0].band = {
      ...defaultBand,
      enabled: true,
      lower: "lower",
      upper: "upper",
    };
    c.axes.y.min = "0.5";
    c.axes.x.log = true;
    c.transforms = [{ op: "filter", field: "x", operator: "gte", value: "1" }];
    const before = JSON.stringify(c);
    for (const preset of stylePresets) {
      const styled = applyPreset(c, preset.key);
      expect(styled.axes.y.min).toBe("0.5");
      expect(styled.axes.x.log).toBe(true);
      expect(styled.style.title).toBe(c.style.title);
      expect(styled.style.width).toBe(c.style.width);
      expect(styled.series[0].band).toEqual(c.series[0].band);
      expect(styled.series[0].error).toBe("err");
      expect(styled.series[0].y).toBe(c.series[0].y);
      expect(styled.transforms).toEqual(c.transforms);
      expect(styled.datasetVersionId).toBe(c.datasetVersionId);
      expect(styled.publication).toEqual(c.publication);
      expect(styleProfile(styled).style).not.toHaveProperty("title");
    }
    expect(JSON.stringify(c)).toBe(before);
  });
});
