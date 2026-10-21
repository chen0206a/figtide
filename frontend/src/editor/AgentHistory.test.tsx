import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentHistory } from "./AgentHistory";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const detail = {
  run_id: "audit-1",
  status: "proposed",
  outcome: "pending",
  model: "fixture-model",
  tokens: 60,
  latency_ms: 100,
  created_at: "2026-10-21T01:00:00Z",
  endpoint: "http://127.0.0.1",
  prompt_version: "figure-assistant-v1",
  catalog_hash: "catalog-hash-1234567890",
  dataset_version_id: 1,
  source_sha256: "source-hash",
  chart_id: 2,
  base_revision: 1,
  usage_complete: true,
  decision_reason: "",
  proposal_hash: "proposal-hash",
  proposal_summary: { operation_count: 1, change_count: 1 },
  trace: [
    {
      step: 1,
      event: "tool_call",
      name: "set_style",
      arguments: {
        fontSize: 18,
        title: { redacted: true, chars: 15, sha256: "hidden-text-hash" },
      },
    },
  ],
  reason: "",
};
function setup(empty = false) {
  let rejected = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => {
      if (url.endsWith("/decision")) {
        rejected = true;
        return { ...detail, outcome: "rejected" };
      }
      if (url.endsWith("/audit"))
        return { ...detail, outcome: rejected ? "rejected" : "pending" };
      return {
        items: empty
          ? []
          : [{ ...detail, outcome: rejected ? "rejected" : "pending" }],
        has_more: !empty && !url.includes("page=1"),
      };
    },
  }));
  vi.stubGlobal("fetch", fetcher);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AgentHistory project={1} chartId={2} />
    </QueryClientProvider>,
  );
  return fetcher;
}
it("loads scoped history, pages it, renders a read-only redacted trace and records rejection", async () => {
  const fetcher = setup();
  await screen.findByText("fixture-model");
  fireEvent.click(screen.getByRole("button", { name: "下一页运行" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => url.includes("page=1"))).toBe(
      true,
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "下一页运行" })).toBeDisabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: /fixture-model/ }));
  await screen.findByRole("heading", { name: "待决定" });
  expect(
    screen.queryByRole("button", { name: "应用这组调整" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("第 1 步 · 文字与字体 · 调用"));
  expect(screen.getByText(/"redacted": true/)).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "拒绝原因（可选）" }), {
    target: { value: "无需调整" },
  });
  fireEvent.click(screen.getByRole("button", { name: "拒绝此提案" }));
  await screen.findByRole("heading", { name: "已拒绝" });
  const sent = fetcher.mock.calls.find(([url]) => url.endsWith("/decision"));
  expect(JSON.parse(sent![1]!.body as string)).toEqual({
    outcome: "rejected",
    reason: "无需调整",
    proposal_hash: "proposal-hash",
  });
  expect(fetcher.mock.calls[0][0]).toContain("chart_id=2");
});
it("has an honest empty state and no enabled next page", async () => {
  setup(true);
  await screen.findByText("还没有符合条件的记录");
  expect(screen.getByRole("button", { name: "上一页运行" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("历史范围"), {
    target: { value: "project" },
  });
  fireEvent.change(screen.getByLabelText("历史结果"), {
    target: { value: "rejected" },
  });
  await screen.findByText("还没有符合条件的记录");
});
