import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentAssistant, type AgentRun } from "./AgentAssistant";
import { defaults } from "./model";
import {
  sameProtectedFigure,
  structuralAllowance,
  type ToolOperation,
} from "./figureTools";
import type { Dataset } from "../lib/api";
import { ApiError } from "../lib/api";
import type {ComponentProps} from 'react';
vi.mock("./StylePreview", () => ({
  StylePreview: ({ config }: any) => (
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
const changed = structuredClone(config);
changed.style.fontSize = 18;
const run: AgentRun = {
  run_id: "run-1",
  status: "proposed",
  model: "fixture",
  steps: 2,
  max_steps: 6,
  tokens: 60,
  latency_ms: 100,
  text: "请确认字号",
  reason: "",
  trace: [],
  catalog_hash: "hash",
  prompt_version: "v1",
  persisted: true,
  outcome: "pending",
  proposal_hash: "proposal-hash",
  proposal: {
    protocol_version: 1,
    config: changed,
    source: { dataset_version_id: 1, sha256: "abc" },
    base_revision: 1,
    operation_count: 1,
    operations: [{ tool: "set_style", arguments: { fontSize: 18 } }],
    changes: [
      { path: "/style/fontSize", before: config.style.fontSize, after: 18 },
    ],
  },
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("permits explicit appearance edits in a structural batch without allowing other series styles to drift", () => {
  const after = structuredClone(config);
  after.series[0].y = "x";
  after.series[0].color = "#0072b2";
  const operations: ToolOperation[] = [
    {
      tool: "map_series",
      arguments: { seriesId: config.series[0].id, y: "x" },
    },
    {
      tool: "set_series",
      arguments: { seriesId: config.series[0].id, color: "#0072b2" },
    },
  ];
  expect(
    sameProtectedFigure(config, after, structuralAllowance(operations)),
  ).toBe(true);
  expect(
    sameProtectedFigure(
      config,
      after,
      structuralAllowance(operations.slice(0, 1)),
    ),
  ).toBe(false);
  after.transforms = [{ field: "y", operator: "gte", value: "0" }] as any;
  expect(
    sameProtectedFigure(config, after, structuralAllowance(operations)),
  ).toBe(false);
});
function setup(
  mock?: (url: string, init?: RequestInit) => unknown,
  docked = false,
  initialPrompt = "",
) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const body =
      mock?.(url, init) ??
      (url.endsWith("/provider")
        ? { available: true, model: "fixture", endpoint: "http://127.0.0.1" }
        : url.endsWith("/decision")
          ? { ...run, outcome: JSON.parse(init!.body as string).outcome }
          : url.endsWith("/lint")
            ? { ok: true }
            : run);
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal("fetch", fetcher);
  const onApply = vi.fn(() => true),
    onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const props = {
    project: 1,
    chartId: 1,
    revision: 1,
    config,
    data,
    token: "snapshot-1",
    onApply,
    onClose,
    docked,
    initialPrompt,
    open: true,
  };
  const ui = (values:ComponentProps<typeof AgentAssistant> = props) => (
    <QueryClientProvider client={client}>
      <AgentAssistant {...values} />
    </QueryClientProvider>
  );
  const view = render(ui());
  return { fetcher, onApply, onClose, ...view, ui, props };
}
it('explicit input handoff starts once and only exposes a proposal while the apply guard is enabled',async()=>{
 const s=setup(undefined,true),onPreview=vi.fn();
 s.rerender(s.ui({...s.props,initialPrompt:'字号改为18',initialConsent:true,autoStart:true,onPreview}));
 await waitFor(()=>expect(onPreview.mock.calls.at(-1)?.[0]?.preview.config.style.fontSize).toBe(18));
 const posts=()=>s.fetcher.mock.calls.filter(([url,init])=>url.endsWith('/runs')&&init?.method==='POST');expect(posts()).toHaveLength(1);expect(JSON.parse(posts()[0][1]!.body as string).share_metadata).toBe(true);
 expect(screen.getByRole('button',{name:'应用这组调整'})).toBeEnabled();
 s.rerender(s.ui({...s.props,initialPrompt:'字号改为18',initialConsent:true,autoStart:true,onPreview,token:'manual-edit'}));
 await waitFor(()=>expect(onPreview).toHaveBeenLastCalledWith(null));expect(screen.getByRole('button',{name:'应用这组调整'})).toBeDisabled();expect(posts()).toHaveLength(1);expect(s.onApply).not.toHaveBeenCalled();
});
it("prefills a home prompt without starting a model run", async () => {
  const s = setup(undefined, true, "把图例放到右侧");
  expect(await screen.findByRole("textbox", { name: "希望怎样调整？" })).toHaveValue("把图例放到右侧");
  await waitFor(() => expect(s.fetcher).toHaveBeenCalled());
  expect(s.fetcher.mock.calls.some(([url, init]) => /\/agent\/runs$/.test(url) && init?.method === "POST")).toBe(false);
});
it("keeps a docked proposal and conversation visible after applying, and hides without losing context", async () => {
  const s = setup(undefined, true);
  await start();
  await screen.findByText("提案已就绪");
  expect(screen.getByRole("complementary", { name: "绘图助手" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
  await waitFor(() => expect(s.onApply).toHaveBeenCalled());
  expect(s.onClose).not.toHaveBeenCalled();
  expect(
    screen.queryByText("提案来源或配置不一致，请重新生成。"),
  ).not.toBeInTheDocument();
  s.rerender(s.ui({ ...s.props, open: false }));
  expect(
    screen.queryByRole("complementary", { name: "绘图助手" }),
  ).not.toBeInTheDocument();
  s.rerender(s.ui({ ...s.props, open: true }));
  expect(screen.getByRole("log", { name: "本次绘图对话" })).toHaveTextContent(
    "字号改为18",
  );
});
it("sends the assistant question with the next answer and can start a fresh conversation", async () => {
  const answered = {
    ...run,
    status: "answered",
    outcome: "answered",
    text: "请问 X 轴还是 Y 轴？",
    proposal: undefined,
  };
  const s = setup(
    (url) => (url.endsWith("/runs") ? answered : undefined),
    true,
  );
  await start();
  await screen.findByText("请问 X 轴还是 Y 轴？");
  fireEvent.change(screen.getByRole("textbox", { name: "希望怎样调整？" }), {
    target: { value: "Y 轴" },
  });
  fireEvent.click(screen.getByRole("button", { name: "生成调整提案" }));
  await waitFor(() =>
    expect(
      s.fetcher.mock.calls.filter(
        ([url, init]) => url.endsWith("/runs") && init?.method === "POST",
      ),
    ).toHaveLength(2),
  );
  const sent = s.fetcher.mock.calls
    .filter(([url, init]) => url.endsWith("/runs") && init?.method === "POST")
    .at(-1)!;
  expect(JSON.parse(sent[1]!.body as string).prompt).toContain(
    "请问 X 轴还是 Y 轴？",
  );
  expect(JSON.parse(sent[1]!.body as string).prompt).toContain(
    "本轮需求：\nY 轴",
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "开始新对话" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "开始新对话" }));
  expect(
    screen.getByRole("log", { name: "本次绘图对话" }),
  ).not.toHaveTextContent("请问 X 轴还是 Y 轴？");
});
async function start() {
  await screen.findByText("fixture");
  fireEvent.change(screen.getByRole("textbox", { name: "希望怎样调整？" }), {
    target: { value: "字号改为18" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "生成调整提案" }));
}
it("requires metadata consent and explicit confirmation, then uses the shared diff", async () => {
  const s = setup();
  await screen.findByText("fixture");
  expect(screen.getByRole("button", { name: "生成调整提案" })).toBeDisabled();
  await start();
  await screen.findByText("提案已就绪");
  expect(s.onApply).not.toHaveBeenCalled();
  expect(screen.getByLabelText("修改明细")).toHaveTextContent("18");
  fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
  await waitFor(() =>
    expect(s.onApply).toHaveBeenCalledWith("snapshot-1", changed, 1),
  );
  const sent = s.fetcher.mock.calls.find(
    ([url, init]) => url.endsWith("/runs") && init?.method === "POST",
  );
  expect(JSON.parse(sent![1]!.body as string).share_metadata).toBe(true);
});
it("blocks stale canvas and forged data sources", async () => {
  const s = setup();
  await start();
  await screen.findByText("提案已就绪");
  s.rerender(s.ui({ ...s.props, token: "new-snapshot" }));
  expect(screen.getByRole("button", { name: "应用这组调整" })).toBeDisabled();
  expect(s.onApply).not.toHaveBeenCalled();
});
it("a source mismatch never enables apply", async () => {
  const forged = structuredClone(run);
  forged.proposal!.source.sha256 = "forged";
  const s = setup((url) => (url.endsWith("/runs") ? forged : undefined));
  await start();
  await screen.findByText("提案来源或配置不一致，请重新生成。");
  expect(screen.getByRole("button", { name: "应用这组调整" })).toBeDisabled();
  expect(s.onApply).not.toHaveBeenCalled();
});
it("rechecks the latest editor callback if the canvas changes during the final network check", async () => {
  let release!: (value: unknown) => void;
  const lint = new Promise((resolve) => {
    release = resolve;
  });
  const s = setup((url) => (url.endsWith("/lint") ? lint : undefined));
  await start();
  await screen.findByText("提案已就绪");
  fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
  await waitFor(() =>
    expect(s.fetcher.mock.calls.some(([url]) => url.endsWith("/lint"))).toBe(
      true,
    ),
  );
  expect(screen.getByRole("button", { name: "应用这组调整" })).toBeDisabled();
  const latestApply = vi.fn(() => false);
  s.rerender(s.ui({ ...s.props, token: "new-draft", onApply: latestApply }));
  release({ ok: true });
  await screen.findByText("画布已变化，请重新生成提案");
  expect(latestApply).not.toHaveBeenCalled();
  expect(s.onApply).not.toHaveBeenCalled();
});
it("cancels the owned run and keeps the original canvas", async () => {
  const s = setup((url) =>
    url.endsWith("/runs")
      ? { ...run, status: "running", proposal: undefined }
      : url.endsWith("/cancel")
        ? { ...run, status: "cancelled", proposal: undefined }
        : undefined,
  );
  await start();
  fireEvent.click(await screen.findByRole("button", { name: "取消运行" }));
  await screen.findByText("已取消");
  expect(s.onApply).not.toHaveBeenCalled();
  expect(screen.getByLabelText("预览字号")).toHaveTextContent(
    String(config.style.fontSize),
  );
});
it("shows honest setup guidance when no provider is configured", async () => {
  setup(() => ({
    available: false,
    model: "",
    endpoint: "https://api.deepseek.com",
    reason: "请设置模型",
  }));
  await screen.findByText("连接模型后即可通过对话调整图表。");
  expect(screen.getByRole("button", { name: "生成调整提案" })).toBeDisabled();
  expect(
    within(screen.getByText("连接模型后即可通过对话调整图表。").closest(".agent-setup")!).getByRole(
      "button",
      { name: "模型设置" },
    ),
  ).toBeVisible();
  expect(screen.queryByText(/LABFLOW_AGENT_MODEL/)).not.toBeInTheDocument();
});
it("does not apply a draft if persisting the acceptance decision fails", async () => {
  const s = setup((url) => {
    if (url.endsWith("/decision")) throw new Error("审计库不可用");
  });
  await start();
  await screen.findByText("提案已就绪");
  fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
  await screen.findByText("审计库不可用");
  expect(s.onApply).not.toHaveBeenCalled();
  expect(s.onClose).not.toHaveBeenCalled();
});
it("refreshes a decision made elsewhere before attempting to apply a stale preview", async () => {
  const s = setup((url) =>
    url.endsWith("/run-1")
      ? { ...run, outcome: "rejected", proposal: undefined }
      : undefined,
  );
  await start();
  await screen.findByText("提案已就绪");
  fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
  await screen.findByText("提案已失效，请重新生成");
  await screen.findByText("已拒绝");
  expect(s.onApply).not.toHaveBeenCalled();
  expect(s.fetcher.mock.calls.some(([url]) => url.endsWith("/decision"))).toBe(
    false,
  );
});
it("persists explicit rejection without changing the canvas", async () => {
  const s = setup();
  await start();
  await screen.findByText("提案已就绪");
  fireEvent.click(screen.getByRole("button", { name: "填写原因" }));
  fireEvent.change(screen.getByRole("textbox", { name: "拒绝原因（可选）" }), {
    target: { value: "字号过大" },
  });
  fireEvent.click(screen.getByRole("button", { name: "拒绝提案" }));
  await screen.findByText("已拒绝");
  expect(s.onApply).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "应用这组调整" })).toBeNull();
  const sent = s.fetcher.mock.calls.find(([url]) => url.endsWith("/decision"));
  expect(JSON.parse(sent![1]!.body as string)).toEqual({
    outcome: "rejected",
    reason: "字号过大",
    proposal_hash: "proposal-hash",
  });
});
it("records confirmation without overwriting a draft changed while the decision request was pending", async () => {
  let release!: (value: unknown) => void;
  const decision = new Promise((resolve) => {
    release = resolve;
  });
  const s = setup((url) => (url.endsWith("/decision") ? decision : undefined));
  await start();
  await screen.findByText("提案已就绪");
  fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
  await waitFor(() =>
    expect(
      s.fetcher.mock.calls.some(([url]) => url.endsWith("/decision")),
    ).toBe(true),
  );
  s.rerender(s.ui({ ...s.props, token: "changed-during-confirmation" }));
  release({ ...run, outcome: "accepted" });
  await screen.findByText(
    "确认已记录，但画布已变化，本次未应用。请重新生成提案。",
  );
  expect(s.onApply).not.toHaveBeenCalled();
  expect(s.onClose).not.toHaveBeenCalled();
});

it("refines an unapplied proposal against the latest manual draft and applies the whole batch once", async () => {
  let calls = 0;
  const manual = structuredClone(config);
  manual.axes.x.title = "Manual label";
  const merged = structuredClone(changed);
  merged.axes.x.title = "Manual label";
  merged.legend.position = "right";
  const second: AgentRun = {
    ...run,
    run_id: "run-2",
    parent_run_id: "run-1",
    proposal_hash: "second-hash",
    proposal: {
      ...run.proposal!,
      config: merged,
      operation_count: 2,
      operations: [
        ...run.proposal!.operations,
        { tool: "set_legend", arguments: { position: "right" } },
      ],
      changes: [
        ...run.proposal!.changes,
        {
          path: "/legend/position",
          before: config.legend.position,
          after: "right",
        },
      ],
    },
  };
  const s = setup(
    (url) =>
      url.endsWith("/runs")
        ? ++calls === 1
          ? run
          : second
        : url.endsWith("/run-2")
          ? second
          : undefined,
    true,
  );
  await start();
  await screen.findByRole("button", { name: "继续修改" });
  fireEvent.click(screen.getByRole("button", { name: "继续修改" }));
  s.rerender(s.ui({ ...s.props, config: manual, token: "manual-draft" }));
  expect(screen.getByRole("button", { name: "应用这组调整" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "希望怎样调整？" }), {
    target: { value: "图例放右侧，其他保留" },
  });
  fireEvent.click(screen.getByRole("button", { name: "继续修改提案" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "应用这组调整" })).toBeEnabled(),
  );
  await waitFor(() =>
    expect(screen.getByRole("log")).toHaveTextContent("已由续改替代"),
  );
  const sent = s.fetcher.mock.calls
    .filter(([url, init]) => url.endsWith("/runs") && init?.method === "POST")
    .at(-1)!;
  expect(JSON.parse(sent[1]!.body as string)).toMatchObject({
    parent_run_id: "run-1",
    config: manual,
  });
  expect(s.onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
  await waitFor(() => expect(s.onApply).toHaveBeenCalledOnce());
  expect(s.onApply).toHaveBeenCalledWith("manual-draft", merged, 2);
});

it.each(["failed", "answered", "cancelled"] as const)(
  "keeps the previous proposal after a %s refinement",
  async (status) => {
    let calls = 0;
    const s = setup(
      (url) =>
        url.endsWith("/runs")
          ? ++calls === 1
            ? run
            : {
                ...run,
                run_id: "run-2",
                parent_run_id: "run-1",
                status,
                outcome: status,
                proposal: undefined,
                text: "本轮没有生成新提案",
              }
          : undefined,
      true,
    );
    await start();
    await screen.findByRole("button", { name: "继续修改" });
  fireEvent.click(screen.getByRole("button", { name: "继续修改" }));
    fireEvent.change(screen.getByRole("textbox", { name: "希望怎样调整？" }), {
      target: { value: "继续调整" },
    });
    fireEvent.click(screen.getByRole("button", { name: "继续修改提案" }));
    await screen.findByText("本轮没有生成新提案");
    expect(screen.getByRole("button", { name: "应用这组调整" })).toBeEnabled();
    expect(screen.getByLabelText("修改明细")).toHaveTextContent("18");
    fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
    await waitFor(() =>
      expect(s.onApply).toHaveBeenCalledWith("snapshot-1", changed, 1),
    );
  },
);

it("retires the previous proposal when the server validates a complete withdrawal", async () => {
  let calls = 0;
  setup(
    (url) =>
      url.endsWith("/runs")
        ? ++calls === 1
          ? run
          : {
              ...run,
              run_id: "run-2",
              parent_run_id: "run-1",
              replaces_parent: true,
              status: "answered",
              outcome: "answered",
              proposal: undefined,
              text: "累计调整已撤回",
            }
        : undefined,
    true,
  );
  await start();
  await screen.findByRole("button", { name: "继续修改" });
  fireEvent.click(screen.getByRole("button", { name: "继续修改" }));
  fireEvent.change(screen.getByRole("textbox", { name: "希望怎样调整？" }), {
    target: { value: "撤回全部调整" },
  });
  fireEvent.click(screen.getByRole("button", { name: "继续修改提案" }));
  await screen.findByText("累计调整已撤回");
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "应用这组调整" }),
    ).toBeNull(),
  );
  expect(screen.getByRole("log")).toHaveTextContent("已由续改替代");
  expect(screen.getByRole("button", { name: "开始新对话" })).toBeEnabled();
});

it("retains the old proposal when refinement fails before a run is created", async () => {
  let calls = 0;
  const s = setup((url) => {
    if (url.endsWith("/runs") && ++calls > 1)
      throw new Error("手动修改与原提案冲突");
  }, true);
  await start();
  await screen.findByRole("button", { name: "继续修改" });
  fireEvent.click(screen.getByRole("button", { name: "继续修改" }));
  fireEvent.change(screen.getByRole("textbox", { name: "希望怎样调整？" }), {
    target: { value: "继续" },
  });
  fireEvent.click(screen.getByRole("button", { name: "继续修改提案" }));
  await screen.findByText("手动修改与原提案冲突");
  expect(screen.getByLabelText("修改明细")).toHaveTextContent("18");
  expect(s.onApply).not.toHaveBeenCalled();
});

it("restores a pending proposal using a server baseline without resubmitting or restoring consent", async () => {
  const id = "d550105c-893b-4f7b-b02b-8a1e2daa32a1";
  sessionStorage.setItem("labflow:assistant:v1:1:1:1", id);
  const baseline = { chart_id: 1, base_revision: 1, config };
  const s = setup(
    (url) =>
      url.endsWith("/resume")
        ? {
            run,
            baseline,
            candidate: { run, baseline },
            turns: [
              {
                id: run.run_id,
                prompt: "恢复前的需求",
                text: run.text,
                outcome: "pending",
              },
            ],
          }
        : undefined,
    true,
  );
  await screen.findByText("已恢复本次对话；尚未应用的提案仍需确认。");
  expect(screen.getByRole("log")).toHaveTextContent("恢复前的需求");
  fireEvent.click(screen.getByRole("button", { name: "继续修改" }));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(
    s.fetcher.mock.calls.some(
      ([url, init]) => url.endsWith("/runs") && init?.method === "POST",
    ),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "应用这组调整" }));
  await waitFor(() =>
    expect(s.onApply).toHaveBeenCalledWith("snapshot-1", changed, 1),
  );
});

it("restoring against a different local draft never makes the old proposal applicable", async () => {
  const id = "d550105c-893b-4f7b-b02b-8a1e2daa32a1";
  sessionStorage.setItem("labflow:assistant:v1:1:1:1", id);
  let release!: (value: unknown) => void;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const s = setup(
    (url) => (url.endsWith("/resume") ? waiting : undefined),
    true,
  );
  const manual = structuredClone(config);
  manual.axes.x.title = "Manual";
  s.rerender(s.ui({ ...s.props, config: manual, token: "manual-draft" }));
  const baseline = { chart_id: 1, base_revision: 1, config };
  release({ run, baseline, candidate: { run, baseline }, turns: [] });
  await screen.findByText("已恢复本次对话；尚未应用的提案仍需确认。");
  expect(screen.getByRole("button", { name: "应用这组调整" })).toBeDisabled();
  expect(s.onApply).not.toHaveBeenCalled();
});

it("a lost start response reconnects by the preassigned identifier and never posts a second request", async () => {
  const baseline = { chart_id: 1, base_revision: 1, config };
  const s = setup((url) => {
    if (url.endsWith("/runs")) throw new Error("network interrupted");
    if (url.endsWith("/resume"))
      return { run, baseline, candidate: { run, baseline }, turns: [] };
  }, true);
  await start();
  fireEvent.click(await screen.findByRole("button", { name: "重新连接" }));
  await screen.findByText("已恢复本次对话；尚未应用的提案仍需确认。");
  expect(
    s.fetcher.mock.calls.filter(
      ([url, init]) => url.endsWith("/runs") && init?.method === "POST",
    ),
  ).toHaveLength(1);
  expect(screen.getByRole("button", { name: "应用这组调整" })).toBeEnabled();
});

it("keeps the reconnect entry when the start failure is an offline ApiError", async () => {
  const baseline = { chart_id: 1, base_revision: 1, config };
  const s = setup((url) => {
    if (url.endsWith("/runs")) throw new ApiError("本地服务没有响应", 0, "offline");
    if (url.endsWith("/resume"))
      return { run, baseline, candidate: { run, baseline }, turns: [] };
  }, true);
  await start();
  fireEvent.click(await screen.findByRole("button", { name: "重新连接" }));
  await screen.findByText("已恢复本次对话；尚未应用的提案仍需确认。");
  expect(
    s.fetcher.mock.calls.filter(
      ([url, init]) => url.endsWith("/runs") && init?.method === "POST",
    ),
  ).toHaveLength(1);
  expect(screen.getByRole("button", { name: "应用这组调整" })).toBeEnabled();
});
