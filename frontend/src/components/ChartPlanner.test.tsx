import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ChartPlanner from "./ChartPlanner";
import type { Dataset } from "../lib/api";
vi.mock("../editor/StylePreview", () => ({
  StylePreview: ({ config }: any) => (
    <div aria-label="实际映射">
      {config.type}:{config.series.map((s: any) => s.y).join(",")}
    </div>
  ),
}));
const data: Dataset = {
  id: 4,
  dataset_id: 2,
  version: 1,
  filename: "synthetic.jsonl",
  sha256: "abc",
  row_count: 2,
  warnings: [],
  fields: [
    { name: "epoch", type: "number", missing: 0 },
    { name: "accuracy", type: "number", missing: 0 },
  ],
  rows: [
    { epoch: 1, accuracy: 0.8 },
    { epoch: 2, accuracy: 0.9 },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(lintOk = true, active = false, loseStartResponse = false) {
  const calls: { url: string; body: any }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const body = options?.body ? JSON.parse(options.body as string) : null;
      calls.push({ url, body });
      if (
        loseStartResponse &&
        url.endsWith("/runs") &&
        options?.method === "POST"
      )
        throw new TypeError("Network response lost");
      const result = url.endsWith("/provider")
        ? { available: true, model: "fixture" }
        : url.endsWith("/lint")
          ? { ok: lintOk, issues: lintOk ? [] : [{ message: "字段不合法" }] }
          : url.endsWith("/charts")
            ? { id: 17 }
            : {
                run_id: "owned-run",
                status: active ? "running" : "answered",
                persisted: true,
                steps: 1,
                tokens: 100,
                text: "请选择方案",
                recommendations: [
                  {
                    id: "plan-1",
                    type: "scatter",
                    x: "epoch",
                    ys: ["accuracy"],
                    group: "",
                    heatY: "",
                    heatZ: "",
                    title: "实验观测",
                    reason: "观察真实点",
                    caveat: "不拟合",
                  },
                ],
              };
      return new Response(JSON.stringify(result), { status: 200 });
    }),
  );
  const onCreated = vi.fn();
  const rendered = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ChartPlanner
        project={7}
        data={data}
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
  return { calls, onCreated, ...rendered };
}
it("requires consent, recommends only, and creates the chosen mapping after lint", async () => {
  const { calls, onCreated } = setup();
  expect(screen.getByRole("button", { name: "分析并推荐" })).toBeDisabled();
  expect(calls.some((c) => c.url.endsWith("/runs"))).toBe(false);
  fireEvent.click(screen.getByRole("checkbox", { name: /同意将字段摘要/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "分析并推荐" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "分析并推荐" }));
  fireEvent.click(await screen.findByRole("button", { name: "选择散点图" }));
  expect(screen.getByLabelText("实际映射")).toHaveTextContent(
    "scatter:accuracy",
  );
  expect(calls.some((c) => c.url.endsWith("/charts"))).toBe(false);
  const payload = calls.find((c) => c.url.endsWith("/runs"))!.body;
  expect(payload.mode).toBe("recommend");
  expect(payload).not.toHaveProperty("rows");
  fireEvent.click(screen.getByRole("button", { name: "创建图表并编辑" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(17));
  const mutation = calls.filter((c) => /\/(lint|charts)$/.test(c.url));
  expect(mutation.map((c) => c.url.split("/").at(-1))).toEqual([
    "lint",
    "charts",
  ]);
  expect(mutation[1].body.config.series[0].y).toBe("accuracy");
});
it("blocks creation when lint fails and reports the error", async () => {
  const { calls, onCreated } = setup(false);
  fireEvent.click(screen.getByRole("button", { name: "创建图表并编辑" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("字段不合法");
  expect(onCreated).not.toHaveBeenCalled();
  expect(calls.some((c) => c.url.endsWith("/charts"))).toBe(false);
});
it("recovers a lost start response by reading its ID without a second model request", async () => {
  const { calls } = setup(true, false, true);
  fireEvent.click(screen.getByRole("checkbox", { name: /同意将字段摘要/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "分析并推荐" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "分析并推荐" }));
  fireEvent.click(await screen.findByRole("button", { name: "恢复分析状态" }));
  await screen.findByRole("button", { name: "选择散点图" });
  const starts = calls.filter((c) => c.url.endsWith("/runs"));
  expect(starts).toHaveLength(1);
  expect(
    calls.some((c) => c.url.endsWith(`/runs/${starts[0].body.request_id}`)),
  ).toBe(true);
});
it("cancels its owned run on unmount without starting a replacement", async () => {
  const { calls, unmount } = setup(true, true);
  fireEvent.click(screen.getByRole("checkbox", { name: /同意将字段摘要/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "分析并推荐" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "分析并推荐" }));
  await screen.findByRole("button", { name: "停止分析" });
  unmount();
  expect(calls.filter((c) => c.url.endsWith("/cancel"))).toHaveLength(1);
  expect(calls.filter((c) => c.url.endsWith("/runs"))).toHaveLength(1);
});
