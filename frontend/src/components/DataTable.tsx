import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import type { Dataset } from "../lib/api";
import { Button } from "./ui/button";
export function DataTable({ data }: { data: Dataset }) {
  const columns = useMemo(
    () =>
      data.fields.map((f) => ({
        accessorKey: f.name,
        header: () => (
          <>
            <span className="field-type">
              {f.type === "number" ? "#" : "Aa"}
            </span>{" "}
            {f.name}
          </>
        ),
        cell: (info: any) =>
          info.getValue() ?? <span className="null-cell">null</span>,
      })),
    [data.fields],
  );
  const table = useReactTable({
    data: data.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
  });
  return (
    <div className="data-table">
      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                <th className="row-number">行</th>
                {g.headers.map((h) => (
                  <th key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                <td className="row-number">{r.index + 1}</td>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          {data.row_count} 行 · {data.fields.length} 个字段 · 原始数据只读
        </span>
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            上一页
          </Button>
          <span>
            {table.getState().pagination.pageIndex + 1} /{" "}
            {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
