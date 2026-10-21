import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, FlaskConical, Copy, ArrowUpRight } from "lucide-react";
import { api, type Experiment, type Dataset } from "../lib/api";
import { Button } from "../components/ui/button";
import {
  ExperimentForm,
  statuses,
  type ExperimentDraft,
} from "./ExperimentForm";
import { Comparison } from "./Comparison";
import { display } from "./compare";
import "./experiments.css";
export function Experiments({
  project,
  datasets,
  notify,
  onData,
  onGenerated,
}: {
  project: number;
  datasets: Dataset[];
  notify: (s: string) => void;
  onData: (version?: number) => void;
  onGenerated: (data: Dataset) => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["experiments", project],
    queryFn: () => api<Experiment[]>(`/projects/${project}/experiments`),
  });
  const [edit, setEdit] = useState<ExperimentDraft | null>(null);
  const [filters] = useState(() => {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(`labflow-experiment-filters:${project}`) || "{}",
      );
      return {
        search: typeof value.search === "string" ? value.search : "",
        status: typeof value.status === "string" ? value.status : "",
        tag: typeof value.tag === "string" ? value.tag : "",
      };
    } catch {
      return { search: "", status: "", tag: "" };
    }
  });
  const [search, setSearch] = useState(filters.search);
  const [status, setStatus] = useState(filters.status);
  const [tag, setTag] = useState(filters.tag);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `labflow-experiment-filters:${project}`,
        JSON.stringify({ search, status, tag }),
      );
    } catch {}
  }, [project, search, status, tag]);
  const [selected, setSelected] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);
  const rows = query.data || [];
  const chosen = selected
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is Experiment => !!r);
  function create() {
    setEdit({
      name: "",
      parameters: {},
      metrics: {},
      notes: "",
      status: "planned",
      tags: [],
      dataset_version_ids: [],
    });
  }
  function copy(r: Experiment) {
    setEdit({
      name: `${r.name.slice(0, 112)} · 副本`,
      parameters: structuredClone(r.parameters),
      metrics: {},
      notes: "",
      status: "planned",
      tags: [...r.tags],
      dataset_version_ids: [],
    });
  }
  const filtered = rows.filter(
    (r) =>
      (!status || r.status === status) &&
      (!tag || r.tags.includes(tag)) &&
      `${r.name} ${r.notes} ${r.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      {comparing && chosen.length >= 2 ? (
        <Comparison
          project={project}
          records={chosen}
          onClose={() => setComparing(false)}
          onRefresh={() => query.refetch()}
          onGenerated={onGenerated}
        />
      ) : (
        <>
          <div className="page-eyebrow">实验工作区</div>
          <div className="page-heading">
            <div>
              <h1>把探索，沉淀为记录。</h1>
              <p>把参数、指标和数据版本连在一起，从记录走向可追溯的对比。</p>
            </div>
            <div className="button-row">
              <Button variant="outline" onClick={() => onData()}>
                项目数据文件
              </Button>
              <Button onClick={create}>
                <Plus size={16} />
                记录实验
              </Button>
            </div>
          </div>
          <div className="experiment-filters">
            <input
              aria-label="搜索实验"
              placeholder="搜索名称、标签或备注…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="筛选实验状态"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">全部状态</option>
              {Object.entries(statuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="筛选实验标签"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">全部标签</option>
              {[...new Set(rows.flatMap((r) => r.tags))].sort().map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <span>
              {filtered.length} / {rows.length} 条记录
            </span>
          </div>
          {query.isPending ? (
            <div className="empty-state">正在读取实验记录…</div>
          ) : query.isError ? (
            <div className="inline-error" role="alert">
              {query.error.message}
              <Button onClick={() => query.refetch()}>重试</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state bordered">
              <FlaskConical size={36} />
              <h2>开始记录你的第一个实验</h2>
              <p>保存参数、指标和研究笔记，随时回来继续。</p>
              <Button onClick={create}>创建实验记录</Button>
            </div>
          ) : (
            <div className="experiment-records">
              {filtered.map((r) => (
                <article
                  key={r.id}
                  className={
                    selected.includes(r.id)
                      ? "experiment-record selected"
                      : "experiment-record"
                  }
                >
                  <div className="record-heading">
                    <input
                      type="checkbox"
                      aria-label={`选择实验 ${r.name}`}
                      checked={selected.includes(r.id)}
                      disabled={
                        !selected.includes(r.id) && selected.length >= 8
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, r.id]
                            : selected.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <button className="record-title" onClick={() => setEdit(r)}>
                      <h3>{r.name}</h3>
                      <span>
                        {new Date(r.updated_at).toLocaleString()} · 修订{" "}
                        {r.revision}
                      </span>
                    </button>
                    <span className={`experiment-status status-${r.status}`}>
                      {statuses[r.status]}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`复制配置 ${r.name}`}
                      onClick={() => copy(r)}
                    >
                      <Copy size={14} />
                      复制配置
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`编辑 ${r.name}`}
                      onClick={() => setEdit(r)}
                    >
                      编辑
                    </Button>
                  </div>
                  {!!r.tags.length && (
                    <div className="experiment-tags">
                      {r.tags.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="record-values">
                    <div>
                      <small>参数</small>
                      <p>
                        {Object.entries(r.parameters)
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <span key={k}>
                              {k}
                              <b>{display(v)}</b>
                            </span>
                          ))}
                        {Object.keys(r.parameters).length > 4 && (
                          <span>
                            另 {Object.keys(r.parameters).length - 4} 项
                          </span>
                        )}
                        {!Object.keys(r.parameters).length && "尚未记录"}
                      </p>
                    </div>
                    <div>
                      <small>指标</small>
                      <p>
                        {Object.entries(r.metrics)
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <span key={k}>
                              {k}
                              <b>{display(v)}</b>
                            </span>
                          ))}
                        {!Object.keys(r.metrics).length && "尚未记录"}
                      </p>
                    </div>
                  </div>
                  <div className="record-foot">
                    <p>{r.notes || "暂无实验备注"}</p>
                    <div>
                      {r.datasets.map((d) => (
                        <button
                          key={d.dataset_version_id}
                          onClick={() => onData(d.dataset_version_id)}
                        >
                          {d.filename} · v{d.version}
                          <ArrowUpRight size={12} />
                        </button>
                      ))}
                      {!r.datasets.length && <small>尚未关联数据版本</small>}
                    </div>
                  </div>
                </article>
              ))}
              {!filtered.length && (
                <div className="empty-state bordered">
                  没有匹配的实验，请调整筛选条件。
                </div>
              )}
            </div>
          )}
          <div className="comparison-selection">
            <span>
              已选 {selected.length} / 8 个实验
              {selected.some((id) => !filtered.some((r) => r.id === id))
                ? "（含筛选外记录）"
                : ""}
            </span>
            <Button
              variant="ghost"
              disabled={!selected.length}
              onClick={() => setSelected([])}
            >
              清空选择
            </Button>
            <Button
              disabled={chosen.length < 2}
              onClick={() => setComparing(true)}
            >
              对比所选实验
            </Button>
          </div>
        </>
      )}
      {edit && (
        <ExperimentForm
          key={`${edit.id || "new"}-${edit.revision || 0}`}
          project={project}
          initial={edit}
          datasets={datasets}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            qc.invalidateQueries({ queryKey: ["experiments", project] });
            qc.invalidateQueries({ queryKey: ["projects"] });
            notify("实验记录已保存");
          }}
        />
      )}
    </>
  );
}
