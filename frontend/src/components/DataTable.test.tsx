import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect } from "vitest";
import { DataTable } from "./DataTable";
it("paginates real rows and displays missing cells explicitly", () => {
  render(
    <DataTable
      data={{
        id: 1,
        dataset_id: 1,
        version: 1,
        filename: "a",
        sha256: "x",
        row_count: 14,
        fields: [{ name: "score", type: "number", missing: 1 }],
        rows: Array.from({ length: 14 }, (_, i) => ({
          score: i === 0 ? null : i + 100,
        })),
        warnings: [],
      }}
    />,
  );
  expect(screen.getByLabelText("空值")).toHaveTextContent("空");
  expect(screen.queryByText("100", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText("101", { exact: true }).closest("td")).toHaveClass("num");
  expect(screen.queryByText("113")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(screen.getByText("113")).toBeVisible();
  expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
});

it("searches columns whose first value is missing without modifying original data", () => {
  const rows = [{ score: null }, { score: 95 }, { score: 92 }];
  render(
    <DataTable
      data={{
        id: 2,
        dataset_id: 2,
        version: 1,
        filename: "demo",
        sha256: "x",
        row_count: 3,
        fields: [{ name: "score", type: "number", missing: 1 }],
        rows,
        warnings: [],
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText("搜索数据"), {
    target: { value: "95" },
  });
  expect(screen.getByText("95", { exact: true })).toBeVisible();
  expect(screen.queryByText("92", { exact: true })).not.toBeInTheDocument();
  expect(rows).toEqual([{ score: null }, { score: 95 }, { score: 92 }]);
});
