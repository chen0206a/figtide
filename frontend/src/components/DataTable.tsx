import { memo, useDeferredValue, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type Row,
} from "@tanstack/react-table";
import type { Dataset } from "../lib/api";
import { Button } from "./ui/button";
export const DataTable = memo(function DataTable({ data }: { data: Dataset }) {
  const [search, setSearch] = useState("");
  const filter = useDeferredValue(search);
  const [missingOnly, setMissingOnly] = useState(false);
  const viewed = useMemo(
    () =>
      missingOnly
        ? data.rows.filter((r) => data.fields.some((f) => r[f.name] === null))
        : data.rows,
    [data, missingOnly],
  );
  const columns = useMemo(
    () =>
      data.fields.map((f) => ({
        id: f.name,
        accessorFn: (row: Record<string, string | number | null>) =>
          row[f.name],
        size: 160,
        minSize: 90,
        maxSize: 500,
        header: () => (
          <>
            <span className="field-type">
              {f.type === "number" ? "#" : "Aa"}
            </span>{" "}
            {f.name}
          </>
        ),
        meta: { numeric: f.type === "number" },
        cell: (info: any) =>
          info.getValue() ?? <span className="null-cell" aria-label="空值">空</span>,
      })),
    [data.fields],
  );
  const table = useReactTable({
    data: viewed,
    state: { globalFilter: filter },
    onGlobalFilterChange: setSearch,
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row, column, value) =>
      String(row.getValue(column) ?? "")
        .toLowerCase()
        .includes(String(value).toLowerCase()),
    columnResizeMode: "onChange",
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
  });
  return (
    <div className="data-table">
      <div className="table-tools">
        <input
          aria-label="搜索数据"
          placeholder="搜索当前数据集…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(e) => setMissingOnly(e.target.checked)}
          />
          仅看缺失行
        </label>
        <details>
          <summary>显示字段</summary>
          <div className="column-options">
            {table.getAllLeafColumns().map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={c.getIsVisible()}
                  disabled={
                    c.getIsVisible() &&
                    table.getVisibleLeafColumns().length === 1
                  }
                  onChange={c.getToggleVisibilityHandler()}
                />
                {c.id}
              </label>
            ))}
          </div>
        </details>
        <span>仅影响表格查看，不改变图表或原数据</span>
      </div>
      <div className="table-scroll" aria-busy={filter !== search}>
        <table className="lf-table lf-table">
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                <th className="row-number">行</th>
                {g.headers.map((h) => (
                  <th
                    key={h.id}
                    className={data.fields.find(f => f.name === h.id)?.type === "number" ? "num" : ""}
                    style={{
                      width: h.getSize(),
                      minWidth: h.getSize(),
                      position: "relative",
                    }}
                    aria-sort={
                      h.column.getIsSorted() === "asc"
                        ? "ascending"
                        : h.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                    }
                  >
                    <button onClick={h.column.getToggleSortingHandler()}>
                      {flexRender(h.column.columnDef.header, h.getContext())}{" "}
                      {h.column.getIsSorted() === "asc"
                        ? "↑"
                        : h.column.getIsSorted() === "desc"
                          ? "↓"
                          : "↕"}
                    </button>
                    <span
                      className="column-resize"
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                      onDoubleClick={() => h.column.resetSize()}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <TableRows
            rows={table.getRowModel().rows}
            visibility={table
              .getVisibleLeafColumns()
              .map((c) => c.id)
              .join("\0")}
          />
        </table>
      </div>
      <div className="table-footer">
        <span>
          {filter !== search ? "正在筛选… · " : ""}
          查看 {table.getFilteredRowModel().rows.length} / {data.row_count} 行 ·{" "}
          {data.fields.length} 个字段 · 原始数据只读 · 空值保留为空，不当作 0
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
});
const TableRows = memo(function TableRows({
  rows,
}: {
  rows: Row<Record<string, string | number | null>>[];
  visibility: string;
}) {
  return (
    <tbody>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="row-number">{r.index + 1}</td>
          {r.getVisibleCells().map((c) => (
            <td
              key={c.id}
              className={`${(c.column.columnDef.meta as { numeric?: boolean })?.numeric ? "num" : ""} ${c.getValue() == null ? "missing-cell" : ""}`}
            >
              {flexRender(c.column.columnDef.cell, c.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
});
