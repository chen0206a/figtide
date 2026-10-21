import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelConnectionDialog } from "./ModelConnectionDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const initial = {
  revision: 1,
  available: true,
  base_url: "https://fixture.example/v1",
  model: "fixture-model",
  has_key: true,
  source: "environment",
  verified_at: "",
};
function setup(testOk = true) {
  let current = { ...initial };
  const calls: { url: string; method: string; body: any; headers: any }[] = [];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      const body = options?.body ? JSON.parse(options.body as string) : null;
      calls.push({ url, method, body, headers: options?.headers });
      let result: unknown = current;
      if (url.endsWith("/test"))
        result = testOk
          ? {
              ok: true,
              code: "verified",
              test_id: "test-proof",
              message: "对话与工具调用均正常",
              latency_ms: 400,
              tokens: 60,
            }
          : {
              ok: false,
              code: "authentication",
              message: "鉴权失败（HTTP 401），请检查 API Key 与权限",
              latency_ms: 100,
              tokens: 0,
            };
      else if (method === "PUT") {
        current = {
          ...current,
          revision: current.revision + 1,
          model: body.model,
          base_url: body.base_url,
          has_key: true,
          source: "session",
          verified_at: body.test_id ? "2026-10-22T00:00:00Z" : "",
        };
        result = current;
      } else if (url.endsWith("/disconnect")) {
        current = {
          ...current,
          revision: current.revision + 1,
          available: false,
          has_key: false,
          model: "",
          verified_at: "",
        };
        result = current;
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ModelConnectionDialog onClose={onClose} />
    </QueryClientProvider>,
  );
  return { calls, client, onClose };
}
it("keeps secrets blank, requires consent to test, and applies only the exact verified candidate", async () => {
  const { calls, client } = setup();
  await screen.findByDisplayValue(initial.base_url);
  expect(screen.getByLabelText("API Key")).toHaveValue("");
  expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password");
  expect(screen.getByRole("button", { name: "测试连接" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("API Key"), {
    target: { value: "fixture.new-secret.123" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
  await screen.findByText("对话与工具调用均正常");
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  const sent = calls.find((c) => c.url.endsWith("/test"))!;
  expect(sent.body.keep_key).toBe(false);
  expect(sent.headers["X-LabFlow-Connection"]).toBe("1");
  fireEvent.click(screen.getByRole("button", { name: "应用连接" }));
  await screen.findByText("连接已应用");
  expect(calls.find((c) => c.method === "PUT")?.body.test_id).toBe(
    "test-proof",
  );
  expect(screen.getByLabelText("API Key")).toHaveValue("");
  expect(
    JSON.stringify(client.getQueryData(["agent-connection"])),
  ).not.toContain("fixture.new-secret");
});
it("clears test proof when settings change and refuses to reuse a key at another address", async () => {
  const { calls } = setup();
  await screen.findByDisplayValue(initial.base_url);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
  await screen.findByText("对话与工具调用均正常");
  fireEvent.change(screen.getByLabelText("接口地址"), {
    target: { value: "https://other.example/v1" },
  });
  expect(screen.queryByText("对话与工具调用均正常")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "应用连接" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("API Key"), {
    target: { value: "fixture.other-key" },
  });
  fireEvent.click(screen.getByRole("button", { name: "应用连接" }));
  await screen.findByText("连接已应用");
  const sent = calls.find((c) => c.method === "PUT")!;
  expect(sent.body.keep_key).toBe(false);
  expect(sent.body.test_id).toBeUndefined();
});
it("shows real authentication errors without changing the active connection and supports disconnect", async () => {
  const { calls } = setup(false);
  await screen.findByDisplayValue(initial.base_url);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
  await screen.findByText(/鉴权失败/);
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "断开" }));
  await screen.findByText("已断开连接");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "断开" })).toBeDisabled(),
  );
});
