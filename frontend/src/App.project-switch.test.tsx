import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it("commits the project route before the project-change event finishes", async () => {
  localStorage.setItem("labflow-intro-seen", "1");
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["projects"], [1, 2].map(id => ({ id, name: `Project ${id}`, archived: false })));
  for (const id of [1, 2]) {
    client.setQueryData(["datasets", id], []);
    client.setQueryData(["charts", id], []);
    client.setQueryData(["experiments", id], [{ id, name: `Experiment ${id}`, parameters: {}, metrics: {}, tags: [], notes: "", status: "completed", dataset_version_ids: [], datasets: [], updated_at: "2026-10-24T00:00:00Z" }]);
  }
  const router = createMemoryRouter([{ path: "*", element: <App /> }], { initialEntries: ["/projects/2/experiments"] });
  render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
  expect(await screen.findByText(/Experiment 2/)).toBeVisible();
  const seen: string[] = [];
  const observe = () => seen.push(document.querySelector(".experiments-table")?.textContent || "");
  document.addEventListener("change", observe);
  try { fireEvent.change(screen.getByLabelText("当前项目"), { target: { value: "1" } }); }
  finally { document.removeEventListener("change", observe); }
  expect(seen).toHaveLength(1);
  expect(seen[0]).not.toContain("Experiment 2");
  expect(await screen.findByText(/Experiment 1/)).toBeVisible();
  router.dispose(); client.clear();
});
