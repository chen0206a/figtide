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
  expect(screen.getByText("null")).toBeVisible();
  expect(screen.queryByText("113")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(screen.getByText("113")).toBeVisible();
  expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
});
