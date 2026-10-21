import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickActions } from "./QuickActions";
import { defaults } from "./model";
import {
  makeToolOperation,
  operationValues,
  sameProtectedFigure,
  displayToolValue,
  toolFieldAvailable,
  type ToolSpec,
} from "./figureTools";
import type { Dataset } from "../lib/api";
vi.mock("./StylePreview", () => ({
  StylePreview: ({ config }: { config: any }) => (
    <div aria-label="预览字号">{config.style.fontSize}</div>
  ),
}));
const data: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "synthetic.csv",
  sha256: "abc",
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
const style: ToolSpec = {
  name: "set_style",
  label: "文字与字体",
  input_schema: {
    required: [],
    minProperties: 1,
    properties: {
      fontSize: { type: "number", minimum: 8, maximum: 40 },
      fontPt: { type: "number", minimum: 4, maximum: 24 },
    },
  },
};
const axis: ToolSpec = {
  name: "set_axis",
  label: "坐标轴",
  input_schema: {
    required: ["axis"],
    minProperties: 2,
    properties: {
      axis: { type: "string", enum: ["x", "y"] },
      min: { type: ["number", "null"] },
      grid: { type: "boolean" },
    },
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup({ stale = false, physical = false, fail = false } = {}) {
  const active = structuredClone(config);
  if (physical) active.publication!.enabled = true;
  const apply = vi.fn(() => !stale),
    close = vi.fn();
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("catalog")
            ? {
                protocol_version: 1,
                config_schema_version: 1,
                execution: "preview-only",
                tools: [style, axis],
              }
            : fail
              ? { message: "版本冲突" }
              : {
                  protocol_version: 1,
                  config: {
                    ...active,
                    style: { ...active.style, fontSize: 18 },
                  },
                  changes: [
                    {
                      path: "/style/fontSize",
                      before: active.style.fontSize,
                      after: 18,
                    },
                  ],
                  operation_count: 1,
                  base_revision: 1,
                  source: { dataset_version_id: 1, sha256: "abc" },
                },
        ),
        { status: !url.endsWith("catalog") && fail ? 409 : 200 },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <QuickActions
        project={1}
        chartId={2}
        revision={1}
        config={active}
        data={data}
        token="snapshot"
        onClose={close}
        onApply={apply}
      />
    </QueryClientProvider>,
  );
  return { apply, close, fetcher };
}
describe("figure tool preparation", () => {
  it("keeps literal text and exposes only effective properties for specialized chart types", () => {
    expect(displayToolValue("right", "title")).toBe("right");
    expect(displayToolValue("right", "position")).toBe("右侧");
    expect(displayToolValue("", "min")).toBe("自动");
    expect(displayToolValue("", "title")).toBe("留空");
    const c = structuredClone(config);
    c.type = "roc";
    expect(toolFieldAvailable("set_axis", "min", c)).toBe(false);
    expect(toolFieldAvailable("set_axis", "title", c)).toBe(true);
    c.type = "heatmap";
    expect(toolFieldAvailable("set_legend", "", c)).toBe(false);
    expect(toolFieldAvailable("set_axis", "grid", c)).toBe(false);
    c.type = "violin";
    expect(toolFieldAvailable("set_axis", "log", c, "x")).toBe(false);
    expect(toolFieldAvailable("set_axis", "log", c, "y")).toBe(true);
    c.type = "bar";
    expect(toolFieldAvailable("set_series", "symbol", c)).toBe(false);
  });
  it("rejects a preview that changes bindings, statistics, source, or unknown future fields", () => {
    const safe = structuredClone(config);
    safe.style.fontSize = 18;
    expect(sameProtectedFigure(config, safe)).toBe(true);
    for (const mutate of [
      (c: any) => (c.series[0].y = "wrong"),
      (c: any) => (c.datasetVersionId = 99),
      (c: any) =>
        (c.transforms = [
          { op: "filter", field: "x", operator: "gte", value: "100" },
        ]),
      (c: any) => (c.future = { changed: true }),
      (c: any) => (c.series[0].band = { enabled: true }),
    ]) {
      const bad = structuredClone(config);
      mutate(bad);
      expect(sameProtectedFigure(config, bad)).toBe(false);
    }
  });
  it("uses JSON numbers, nullable auto ranges and explicit targets", () => {
    expect(makeToolOperation(style, { fontSize: "18" }, ["fontSize"])).toEqual({
      tool: "set_style",
      arguments: { fontSize: 18 },
    });
    expect(makeToolOperation(axis, { axis: "y", min: "" }, ["min"])).toEqual({
      tool: "set_axis",
      arguments: { axis: "y", min: null },
    });
    expect(() =>
      makeToolOperation(style, { fontSize: "1e999" }, ["fontSize"]),
    ).toThrow("有效");
    expect(() => makeToolOperation(axis, { axis: "y" }, [])).toThrow("至少");
    expect(operationValues("set_axis", config, "x").axis).toBe("x");
    expect(operationValues("set_series", config).seriesId).toBe(
      config.series[0].id,
    );
  });
  it("queues, previews without applying, then applies the checked snapshot once", async () => {
    const { apply, close, fetcher } = setup();
    const size = await screen.findByRole("spinbutton", {
      name: "字号（px）",
    });
    fireEvent.change(size, { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "加入调整清单" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "验证并预览" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "应用这组调整" }),
      ).toBeEnabled(),
    );
    expect(apply).not.toHaveBeenCalled();
    const call = fetcher.mock.calls.find(([url]) =>
      url.endsWith("preview"),
    )! as unknown as [string, RequestInit];
    // Read from the mock's recorded full invocation, including the request body.
    const body = JSON.parse(String(call[1].body));
    expect(body).toMatchObject({
      protocol_version: 1,
      chart_id: 2,
      base_revision: 1,
      operations: [{ tool: "set_style", arguments: { fontSize: 18 } }],
    });
    expect(body.config).toEqual(config);
    fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
    expect(apply).toHaveBeenCalledWith(
      "snapshot",
      expect.objectContaining({
        style: expect.objectContaining({ fontSize: 18 }),
      }),
      1,
    );
    expect(close).toHaveBeenCalledOnce();
  });
  it("stale local snapshots and server conflicts retain edits for re-preview", async () => {
    const { apply, close } = setup({ stale: true });
    await screen.findByRole("spinbutton", { name: "字号（px）" });
    fireEvent.click(screen.getByRole("button", { name: "加入调整清单" }));
    fireEvent.click(screen.getByRole("button", { name: "验证并预览" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "应用这组调整" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
    expect(apply).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("画布已变化");
    expect(screen.getByRole("button", { name: "验证并预览" })).toBeEnabled();
  });
  it("server failure cannot apply and removing the last operation disables retry", async () => {
    setup({ fail: true });
    await screen.findByRole("spinbutton", { name: "字号（px）" });
    fireEvent.click(screen.getByRole("button", { name: "加入调整清单" }));
    fireEvent.click(screen.getByRole("button", { name: "验证并预览" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("版本冲突");
    expect(screen.getByRole("button", { name: "应用这组调整" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "移除第 1 项调整" }));
    expect(screen.getByRole("button", { name: "验证并预览" })).toBeDisabled();
  });
  it("exposes physical pt instead of an ineffective pixel input", async () => {
    setup({ physical: true });
    expect(
      await screen.findByRole("spinbutton", {
        name: "成品字号（pt）",
      }),
    ).toHaveValue(8);
    expect(
      screen.queryByRole("spinbutton", { name: "字号（px）" }),
    ).not.toBeInTheDocument();
  });
});
