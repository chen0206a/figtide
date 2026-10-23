import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Experiments } from "./Experiments";
import type { Experiment } from "../lib/api";
const rows: Experiment[] = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  project_id: 1,
  name: `Run ${i + 1}`,
  metrics: { accuracy: i + 1, throughput: i + 1 },
  parameters: { lr: 0.001, seed: i },
  notes: "",
  status: "completed",
  tags: ["synthetic"],
  revision: 1,
  created_at: "2026-10-23T10:10:00Z",
  updated_at: "2026-10-23T10:10:00Z",
  datasets: [],
  dataset_version_ids: [],
}));
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(["experiments", 1], rows);
  return render(
    <QueryClientProvider client={client}>
      <Experiments
        project={1}
        datasets={[]}
        notify={vi.fn()}
        onData={vi.fn()}
        onGenerated={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());
it("shows a table by default and selection capsule only while selected, max eight", () => {
  mount();
  expect(screen.getByRole("table")).toBeVisible();
  expect(screen.queryByRole("region", { name: "所选实验" })).toBeNull();
  for (let i = 1; i <= 8; i++)
    fireEvent.click(
      screen.getByLabelText(`选择实验 Run ${i}`, { exact: true }),
    );
  expect(
    screen.getByLabelText("选择实验 Run 9", { exact: true }),
  ).toBeDisabled();
  expect(screen.getByRole("region", { name: "所选实验" })).toHaveTextContent(
    "最多 8 个",
  );
  fireEvent.click(screen.getByRole("button", { name: "清空选择" }));
  expect(screen.queryByRole("region", { name: "所选实验" })).toBeNull();
});
it("persists view changes and retains selection across cards and table", () => {
  const s = mount();
  fireEvent.click(screen.getByLabelText("选择实验 Run 1", { exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "卡片" }));
  expect(
    screen.getByLabelText("选择实验 Run 1", { exact: true }),
  ).toBeChecked();
  expect(localStorage.getItem("labflow-experiments-view")).toBe("cards");
  s.unmount();
  mount();
  expect(
    screen.getByRole("button", { name: "卡片" }),
  ).toHaveAttribute("aria-pressed", "true");
});
it("persists explicit column choices and sorts using aria-sort", () => {
  const s = mount();
  fireEvent.click(screen.getByRole("button", { name: "accuracy ↓" }));
  expect(
    screen.getByRole("columnheader", { name: "accuracy ↑" }),
  ).toHaveAttribute("aria-sort", "ascending");
  fireEvent.click(screen.getByRole("button", { name: "列设置" }));
  fireEvent.click(screen.getByLabelText("参数列 seed"));
  expect(screen.queryByRole("columnheader", { name: /^seed/ })).toBeNull();
  s.unmount();
  mount();
  expect(screen.queryByRole("columnheader", { name: /^seed/ })).toBeNull();
  const cells = within(screen.getByRole("table")).getAllByRole("cell");
  expect(cells.some((c) => c.classList.contains("is-best"))).toBe(true);
});
