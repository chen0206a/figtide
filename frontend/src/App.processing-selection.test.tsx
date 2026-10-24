import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { Dataset } from "./lib/api";
import App from "./App";

const source: Dataset = {
  id: 1, dataset_id: 1, version: 1, filename: "source.csv", row_count: 2,
  sha256: "source-hash", fields: [{ name: "epoch", type: "number", missing: 0 }],
  rows: [{ epoch: 2 }, { epoch: 1 }], warnings: [],
};
const derived: Dataset = {
  ...source, id: 2, dataset_id: 2, filename: "Sorted epochs.csv",
  sha256: "derived-hash", rows: [{ epoch: 1 }, { epoch: 2 }],
  source_meta: {
    schema_version: 1, kind: "data_processing", algorithm: "group-summary-v1",
    created_at: "2026-10-24T00:00:00Z",
    source: { datasetVersionId: 1, datasetId: 1, version: 1, filename: "source.csv", sha256: "source-hash" },
    rules: { schema_version: 1, mode: "sort", filters: [], sort: [{ field: "epoch", direction: "asc" }], groupBy: [], metrics: [], missingGroup: "include", error: "none", observationUnit: "", replicate: "", x: "epoch", group: "", display: "bars" },
    statistics: [],
    counts: { source_rows: 2, filtered_rows: 2, excluded_rows: 0, output_rows: 2, groups: 0, missing_group_rows: 0 },
  },
};
// Exercise App's real save callback and DataPage's membership guard; only the
// already-tested processing form is replaced with its successful API callback.
vi.mock("./processing/ProcessingDialog", () => ({
  ProcessingDialog: ({ onSaved }: { onSaved: (data: Dataset, plot: boolean) => void }) =>
    <button onClick={() => onSaved(derived, false)}>完成派生数据保存</button>,
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it("keeps the committed derived dataset selected while the dataset-list refresh is pending", async () => {
  localStorage.setItem("labflow-intro-seen", "1");
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const project = { id: 1, name: "Research", archived: false };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/datasets")) {
      await pending;
      return new Response(JSON.stringify([derived, source]));
    }
    return new Response(JSON.stringify(url.endsWith("/projects") ? [project] : []));
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["projects"], [project]);
  client.setQueryData(["datasets", 1], [source]);
  client.setQueryData(["data", 1, 1], source);
  client.setQueryData(["charts", 1], []);
  const before = JSON.stringify(source);
  const router = createMemoryRouter([{ path: "*", element: <App /> }], { initialEntries: ["/projects/1/data?dataset=1"] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  try {
    fireEvent.click(await screen.findByRole("button", { name: "处理与统计" }));
    fireEvent.click(screen.getByRole("button", { name: "完成派生数据保存" }));
    expect(await screen.findByRole("button", { name: "数据处理来源" })).toBeVisible();
    expect(router.state.location.search).toBe("?dataset=2");
    expect(screen.getByRole("heading", { name: "Sorted epochs.csv" })).toBeVisible();
    await act(async () => { release(); });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(router.state.location.search).toBe("?dataset=2");
    expect(screen.getByRole("button", { name: "数据处理来源" })).toBeVisible();
    expect(JSON.stringify(source)).toBe(before);
  } finally { release(); router.dispose(); client.clear(); }
});
