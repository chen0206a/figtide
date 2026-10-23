import { useMemo, useState } from "react";
import { MoreHorizontal, SlidersHorizontal } from "lucide-react";
import type { Experiment } from "../lib/api";
import { bestIndex } from "../lib/metrics";
import { formatDate, formatDateTime } from "../lib/format";
import { display } from "./compare";
const cellValue = (value: Parameters<typeof display>[0]) =>
  typeof value === "number" && Number.isFinite(value)
    ? String(Number(value.toPrecision(6)))
    : display(value);
import { statuses } from "./ExperimentForm";
import {
  defaultColumns,
  defaultSort,
  inferColumns,
  readColumns,
  sortRows,
  writeColumns,
  type Columns,
  type Sort,
} from "./tableModel";

export function ExperimentsTable({
  project,
  allRows,
  rows,
  selected,
  onToggle,
  onEdit,
  onCopy,
  onData,
}: {
  project: number;
  allRows: Experiment[];
  rows: Experiment[];
  selected: number[];
  onToggle: (row: Experiment, checked: boolean) => void;
  onEdit: (row: Experiment) => void;
  onCopy: (row: Experiment) => void;
  onData: (id: number) => void;
}) {
  const all = useMemo(() => inferColumns(allRows), [allRows]);
  const [stored, setStored] = useState(() => readColumns(project));
  const columns = stored
    ? {
        parameters: stored.parameters.filter((k) => all.parameters.includes(k)),
        metrics: stored.metrics.filter((k) => all.metrics.includes(k)),
      }
    : defaultColumns(all);
  const [sort, setSort] = useState<Sort | null>(null);
  const order = sort || defaultSort(columns);
  const sorted = sortRows(rows, order);
  const best = Object.fromEntries(
    columns.metrics.map((key) => [key, bestIndex(allRows, key)]),
  );
  const [settings, setSettings] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  function toggleColumn(kind: keyof Columns, key: string, checked: boolean) {
    const next = {
      ...columns,
      [kind]: checked
        ? [...columns[kind], key]
        : columns[kind].filter((k) => k !== key),
    };
    setStored(next);
    writeColumns(project, next);
  }
  function heading(
    label: string,
    kind: Sort["kind"],
    key = "",
    numeric = false,
  ) {
    const active = order.kind === kind && order.key === key;
    return (
      <th
        key={kind + key}
        scope="col"
        className={numeric ? "num" : ""}
        aria-sort={
          active
            ? order.direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <button
          onClick={() =>
            setSort({
              kind,
              key,
              direction: active && order.direction === "desc" ? "asc" : "desc",
            })
          }
        >
          {label} {active ? (order.direction === "asc" ? "↑" : "↓") : ""}
        </button>
      </th>
    );
  }
  return (
    <section className="experiments-table-card" aria-label="实验表格">
      <div className="experiments-table-scroll">
        <table className="lf-table experiments-table">
          <thead>
            <tr className="experiment-column-groups">
              <th colSpan={3} />
              {!!columns.parameters.length && (
                <th scope="colgroup" colSpan={columns.parameters.length}>
                  参数
                </th>
              )}
              {!!columns.metrics.length && (
                <th scope="colgroup" colSpan={columns.metrics.length}>
                  指标
                </th>
              )}
              <th colSpan={3} />
            </tr>
            <tr>
              <th scope="col">
                <span className="sr-only">选择</span>
              </th>
              {heading("实验", "name")}
              {heading("状态", "status")}
              {columns.parameters.map((k) => heading(k, "parameters", k, true))}
              {columns.metrics.map((k) => heading(k, "metrics", k, true))}
              <th scope="col">版本</th>
              {heading("更新", "updated_at")}
              <th scope="col">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.id}
                className={selected.includes(row.id) ? "is-selected" : ""}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`选择实验 ${row.name}`}
                    checked={selected.includes(row.id)}
                    disabled={
                      !selected.includes(row.id) && selected.length >= 8
                    }
                    onChange={(e) => onToggle(row, e.target.checked)}
                  />
                </td>
                <td className="experiment-name-cell">
                  <button
                    className="experiment-name"
                    onClick={() => onEdit(row)}
                  >
                    <span className="lf-mono experiment-id">
                      EXP-{String(row.id).padStart(3, "0")}
                    </span>{" "}
                    <strong>{row.name}</strong>
                  </button>
                  {selected[0] === row.id && (
                    <span className="lf-chip" data-tone="neutral">
                      基线
                    </span>
                  )}
                  {!!row.tags.length && (
                    <div className="experiment-table-tags">
                      {row.tags.join(" · ")}
                    </div>
                  )}
                </td>
                <td>
                  <span
                    className="lf-chip"
                    data-tone={
                      {
                        planned: "neutral",
                        running: "info",
                        completed: "success",
                        failed: "danger",
                      }[row.status]
                    }
                  >
                    {statuses[row.status]}
                  </span>
                </td>
                {columns.parameters.map((k) => (
                  <td
                    key={k}
                    className="num"
                    title={display(row.parameters[k])}
                  >
                    {row.parameters[k] == null ? (
                      <span className="muted">—</span>
                    ) : (
                      cellValue(row.parameters[k])
                    )}
                  </td>
                ))}
                {columns.metrics.map((k) => (
                  <td
                    key={k}
                    title={display(row.metrics[k])}
                    className={`num ${allRows[best[k]]?.id === row.id ? "is-best" : ""}`}
                  >
                    {row.metrics[k] == null ? (
                      <span className="muted">—</span>
                    ) : (
                      cellValue(row.metrics[k])
                    )}
                  </td>
                ))}
                <td>
                  {row.datasets.length ? (
                    row.datasets.map((d) => (
                      <button
                        key={d.dataset_version_id}
                        className="experiment-data-link lf-mono"
                        onClick={() => onData(d.dataset_version_id)}
                      >
                        {d.filename} · v{d.version}
                      </button>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="lf-mono experiment-date">
                  <time
                    dateTime={row.updated_at}
                    title={formatDateTime(row.updated_at)}
                  >
                    {formatDate(row.updated_at)}
                  </time>
                </td>
                <td>
                  <div
                    className="experiment-row-menu"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setMenu(null);
                    }}
                  >
                    <button
                      aria-label={`实验操作 ${row.name}`}
                      aria-expanded={menu === row.id}
                      aria-haspopup="menu"
                      onClick={() => setMenu(menu === row.id ? null : row.id)}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menu === row.id && (
                      <div role="menu">
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMenu(null);
                            onEdit(row);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          role="menuitem"
                          aria-label={`复制配置 ${row.name}`}
                          onClick={() => {
                            setMenu(null);
                            onCopy(row);
                          }}
                        >
                          复制配置
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="home-muted">没有匹配的实验，请调整筛选条件。</p>
      )}
      <footer className="experiment-table-footer">
        <span>点击列名排序 · 仅突出方向明确的指标最优值</span>
        <button
          className="experiment-data-link"
          aria-expanded={settings}
          aria-controls="experiment-column-settings"
          onClick={() => setSettings(!settings)}
        >
          <SlidersHorizontal size={14} /> 列设置
        </button>
        {settings && (
          <div
            id="experiment-column-settings"
            className="experiment-column-settings"
          >
            {(["parameters", "metrics"] as const).map((kind) => (
              <fieldset key={kind}>
                <legend>{kind === "parameters" ? "参数" : "指标"}</legend>
                {all[kind].map((k) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      aria-label={`${kind === "parameters" ? "参数" : "指标"}列 ${k}`}
                      checked={columns[kind].includes(k)}
                      onChange={(e) => toggleColumn(kind, k, e.target.checked)}
                    />
                    {k}
                  </label>
                ))}
                {!all[kind].length && <span>尚无字段</span>}
              </fieldset>
            ))}
          </div>
        )}
      </footer>
    </section>
  );
}
