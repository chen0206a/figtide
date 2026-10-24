import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FlaskConical, Plus, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { statuses } from "../../experiments/ExperimentForm";
import { api, type Experiment, type Project } from "../../lib/api";
import "./home.css";
import { bestIndex } from "../../lib/metrics";
import { formatMetric, metricColumns } from "./homeData";

export function ProjectsPanel({
  projects,
  currentId,
  onProject,
  onCreate,
}: {
  projects: Project[];
  currentId: number;
  onProject: (id: number) => void;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [limit, setLimit] = useState(4);
  const filtered = useMemo(
    () =>
      projects
        .filter((project) =>
          `${project.name} ${project.description}`
            .toLowerCase()
            .includes(deferred.trim().toLowerCase()),
        )
        .sort(
          (a, b) => Number(b.id === currentId) - Number(a.id === currentId),
        ),
    [projects, currentId, deferred],
  );
  useEffect(() => {
    setLimit(4);
  }, [deferred]);
  return (
    <section
      className="home-card home-table-card"
      aria-labelledby="home-projects-title"
    >
      <div className="home-card-head">
        <h2 id="home-projects-title">
          研究项目 <span className="home-meta">· {projects.length}</span>
        </h2>
        <button type="button" className="home-link" onClick={onCreate}>
          <Plus size={14} aria-hidden="true" /> 新建项目
        </button>
      </div>
      {projects.length > 4 && (
        <div className="home-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="搜索研究项目"
            placeholder="查找研究项目…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {!projects.length ? (
        <p className="home-muted">还没有研究项目。</p>
      ) : !filtered.length ? (
        <div className="home-muted">
          没有匹配的项目{" "}
          <button
            type="button"
            className="home-link"
            onClick={() => setSearch("")}
          >
            清除搜索
          </button>
        </div>
      ) : (
        <div className="home-table-scroll">
        <table className="lf-table home-project-table">
          <thead><tr>
            <th scope="col">项目</th>
            <th scope="col" className="num">实验</th>
            <th scope="col" className="num">数据</th>
            <th scope="col" className="num">图表</th>
          </tr></thead>
          <tbody>
          {filtered.slice(0, limit).map((project) => (
            <tr key={project.id} className={project.id === currentId ? "is-current" : ""}>
              <td>
              <button
                type="button"
                className={`home-project ${project.id === currentId ? "is-current" : ""}`}
                aria-pressed={project.id === currentId}
                onClick={() => onProject(project.id)}
              >
                <span className="home-project-name" title={project.name}>
                  {project.id === currentId && <span className="lf-dot" />}
                  {project.name}
                </span>
              </button>
              </td>
              <td className="num">{project.experiment_count}</td>
              <td className="num">{project.dataset_count}</td>
              <td className="num">{project.chart_count}</td>
            </tr>
          ))}
          </tbody>
        </table></div>
      )}
      {filtered.length > limit && (
        <button
          type="button"
          className="home-more"
          onClick={() => setLimit((n) => n + 8)}
        >
          显示更多项目（剩余 {filtered.length - limit}）
        </button>
      )}
    </section>
  );
}

export function ExperimentsPanel({
  project,
  onExperiments,
}: {
  project?: Project;
  onExperiments: () => void;
}) {
  const experiments = useQuery({
    queryKey: ["experiments", project?.id],
    queryFn: () => api<Experiment[]>(`/projects/${project!.id}/experiments`),
    enabled: !!project,
  });
  const rows = useMemo(
    () =>
      [...(experiments.data || [])]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 5),
    [experiments.data],
  );
  const columns = metricColumns(rows);
  const best = Object.fromEntries(columns.map((k) => [k, bestIndex(rows, k)]));
  return (
    <section
      className="home-card home-table-card"
      aria-labelledby="home-experiments-title"
      data-home-experiments="true"
    >
      <div className="home-card-head">
        <h2 id="home-experiments-title">
          最近实验
          {project && <span className="home-meta"> · {project.name}</span>}
        </h2>
        {project && (
          <button type="button" className="home-link" onClick={onExperiments}>
            全部实验 <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {!project ? (
        <p className="home-muted">选择或创建项目后显示实验记录。</p>
      ) : experiments.isPending ? (
        <p className="home-muted" role="status">
          正在读取实验…
        </p>
      ) : experiments.isError ? (
        <p className="home-muted" role="alert">
          {experiments.error.message}
        </p>
      ) : !rows.length ? (
        <div className="home-muted">
          <FlaskConical size={16} aria-hidden="true" /> 还没有实验记录。
          <button type="button" className="home-link" onClick={onExperiments}>
            记录第一个实验
          </button>
        </div>
      ) : (
        <div className="home-table-scroll home-experiment-scroll" role="region" aria-label="最近实验表格" tabIndex={0}>
          <table className="lf-table home-table">
            <thead>
              <tr>
                <th scope="col">实验</th>
                {columns.map((key) => (
                  <th scope="col" key={key} className="num lf-mono">
                    {key}
                  </th>
                ))}
                <th scope="col" className="num">
                  状态
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.id}>
                  <td title={e.name}>{e.name}</td>
                  {columns.map((key) => (
                    <td
                      key={key}
                      className={`num lf-mono ${best[key] === i ? "is-best" : ""}`}
                    >
                      {formatMetric(e.metrics?.[key])}
                    </td>
                  ))}
                  <td className="num">
                    <span
                      className="lf-chip"
                      data-tone={
                        e.status === "completed"
                          ? "success"
                          : e.status === "failed"
                            ? "danger"
                            : e.status === "running"
                              ? "info"
                              : "neutral"
                      }
                    >
                      {statuses[e.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
