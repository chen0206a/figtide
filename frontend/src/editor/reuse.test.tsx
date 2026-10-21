import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  defaults,
  defaultClassification,
  defaultEvaluation,
  defaultBand,
  historyReducer,
} from "./model";
import { applyStyle, bindings, reuseConfig, type StyleProfile } from "./reuse";
import { ReuseDialog } from "./ReuseDialog";
import { ProjectBackup } from "../components/ProjectBackup";
import type { Dataset } from "../lib/api";
vi.mock("./StylePreview", () => ({
  StylePreview: ({ config }: { config: any }) => (
    <div aria-label="当前数据样式预览">
      {config.style.font} · {config.style.fontSize}
    </div>
  ),
}));
const d: Dataset = {
  id: 1,
  dataset_id: 1,
  version: 1,
  filename: "synthetic.csv",
  sha256: "demo",
  row_count: 1,
  fields: ["x", "y", "err", "truth", "pred", "id"].map((name) => ({
    name,
    type: name === "truth" || name === "pred" ? "string" : "number",
    missing: 0,
  })),
  rows: [{ x: 1, y: 0.8, err: 0.1, truth: "A", pred: "A", id: 1 }],
  warnings: [],
};
function profile(): StyleProfile {
  const c = defaults(d);
  return {
    schema_version: 1,
    style: { ...c.style, font: "Noto Sans SC", fontSize: 18 },
    axes: { x: { grid: true }, y: { grid: false } },
    legend: { ...c.legend },
    series: [
      {
        color: "#009988",
        opacity: 0.8,
        width: 3,
        dash: "dash",
        symbol: "square",
        size: 5,
        band: { opacity: 0.3 },
      },
    ],
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("reusable scientific figures", () => {
  it("applies only appearance, cycles series styles and can undo without changing semantic settings", () => {
    const c = defaults(d);
    c.series.push({ ...c.series[0], id: "s2", y: "err" });
    c.series[0].band = {
      ...defaultBand,
      enabled: true,
      lower: "err",
      upper: "y",
      label: "SEM",
    };
    c.axes.y.min = "0.7";
    c.axes.x.log = true;
    c.transforms = [
      { op: "filter", field: "truth", operator: "eq", value: "A" },
    ];
    const result = applyStyle(c, {
      ...profile(),
      datasetVersionId: 999,
      style: { ...profile().style, title: "Injected" },
      axes: { x: { grid: true, title: "Injected" }, y: { grid: false } },
      series: [{ ...profile().series[0], y: "Injected" }],
    } as unknown as StyleProfile);
    expect(result.style.title).toBe(c.style.title);
    expect(result.datasetVersionId).toBe(1);
    expect(result.series.map((s) => s.y)).toEqual(c.series.map((s) => s.y));
    expect(result.axes.x.log).toBe(true);
    expect(result.axes.y.min).toBe("0.7");
    expect(result.transforms).toEqual(c.transforms);
    expect(result.series[0].band).toMatchObject({
      enabled: true,
      lower: "err",
      upper: "y",
      label: "SEM",
      opacity: 0.3,
    });
    expect(result.series[1].color).toBe("#009988");
    const state = historyReducer(
      { past: [], present: c, future: [] },
      { type: "edit", value: result },
    );
    expect(historyReducer(state, { type: "undo" }).present).toEqual(c);
  });
  it("maps every active and dormant field including filters, prediction, bands and identity without mutation", () => {
    const c = defaults(d);
    c.series[0].y = "y";
    c.series[0].error = "err";
    c.series[0].prediction = "pred";
    c.series[0].band = { ...defaultBand, lower: "err", upper: "y" };
    c.evaluation = { ...defaultEvaluation, label: "truth" };
    c.classification = {
      ...defaultClassification,
      label: "truth",
      classes: ["A", "B"],
      groupValue: "A",
    };
    c.sampling = { policy: "intersection", id: "id" };
    c.facet!.field = "truth";
    c.facet!.titles = { A: "Historical" };
    c.transforms = [
      { op: "filter", field: "y", operator: "gte", value: "0.5" },
    ];
    const target = {
      ...d,
      id: 2,
      fields: d.fields.map((f) => ({ ...f, name: `new_${f.name}` })),
    };
    const mapping = Object.fromEntries(
      d.fields.map((f) => [f.name, `new_${f.name}`]),
    );
    const before = JSON.stringify(c);
    const copy = reuseConfig(c, target, mapping);
    expect(
      bindings(copy)
        .map((b) => b.field)
        .sort(),
    ).toEqual(
      bindings(c)
        .map((b) => `new_${b.field}`)
        .sort(),
    );
    expect(copy.series[0].band?.lower).toBe("new_err");
    expect(copy.sampling?.id).toBe("new_id");
    expect(copy.transforms[0]).toMatchObject({ field: "new_y", value: "0.5" });
    expect(copy.evaluation?.positive).toBe(c.evaluation.positive);
    expect(copy.classification?.classes).toEqual(["A", "B"]);
    expect(copy.classification?.groupValue).toBe("");
    expect(copy.facet?.titles).toEqual({});
    expect(JSON.stringify(c)).toBe(before);
  });
  it("requires complete mappings and numeric types rather than silently guessing", () => {
    const c = defaults(d);
    expect(() => reuseConfig(c, { ...d, id: 2 }, {})).toThrow("选择");
    const mapping = Object.fromEntries(d.fields.map((f) => [f.name, f.name]));
    expect(() =>
      reuseConfig(
        c,
        {
          ...d,
          fields: d.fields.map((f) => ({ ...f, type: "string" as const })),
        },
        mapping,
      ),
    ).toThrow("数值");
  });
  it("saves named templates through Java API and applies the retrieved profile", async () => {
    const calls: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        calls.push([url, options]);
        return new Response(
          JSON.stringify(
            options?.method === "POST"
              ? { id: 1 }
              : [
                  {
                    id: 1,
                    project_id: 1,
                    name: "论文样式",
                    project_name: "研究",
                    profile: profile(),
                  },
                ],
          ),
          { status: 200 },
        );
      }),
    );
    const apply = vi.fn();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ReuseDialog
          project={1}
          config={defaults(d)}
          name="Figure"
          datasets={[d]}
          onClose={() => {}}
          onApply={apply}
          onReused={() => {}}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "保存为模板" })[0]);
    fireEvent.change(screen.getByLabelText("模板名称"), {
      target: { value: "新样式" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存当前样式" }));
    await waitFor(() =>
      expect(
        calls.some(
          ([url, o]) =>
            url === "/api/projects/1/style-templates" &&
            JSON.parse(o.body).name === "新样式",
        ),
      ).toBe(true),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "预览模板 论文样式" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "应用样式 论文样式" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "应用样式 论文样式" }));
    expect(apply.mock.calls[0][0].series[0].color).toBe("#009988");
  });
  it("displays backup preview errors without enabling restore", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "内容校验失败" }), {
            status: 400,
          }),
      ),
    );
    render(<ProjectBackup projects={[]} onUpdated={() => {}} />);
    fireEvent.change(screen.getByLabelText("选择项目备份"), {
      target: { files: [new File(["bad"], "bad.zip")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("内容校验失败");
    expect(
      screen.queryByRole("button", { name: "恢复为新项目" }),
    ).not.toBeInTheDocument();
  });
});
