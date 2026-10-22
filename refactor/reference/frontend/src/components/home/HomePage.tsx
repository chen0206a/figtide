import {
  Suspense,
  lazy,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUp,
  ChartColumn,
  ChartNoAxesCombined,
  ChevronRight,
  FileSpreadsheet,
  FlaskConical,
  Plus,
  Search,
  Sigma,
  Upload,
} from "lucide-react";
import { api, type Dataset, type Experiment, type Project } from "../../lib/api";
import type { Config } from "../../editor/model";
import { statuses } from "../../experiments/ExperimentForm";
import {
  bestIndex,
  dateLabel,
  formatMetric,
  greeting,
  localDraftInfo,
  metricColumns,
  relativeTime,
  type ChartSummary,
} from "./homeData";
import "./home.css";

const FigurePreview = lazy(() => import("../../editor/FigurePreview"));

type ChartDetail = {
  id: number;
  name: string;
  revision: number;
  updated_at: string;
  dataset_version_id: number;
  config: Config;
};
type Provider = { available: boolean; model: string };

export type HomePageProps = {
  projects: Project[];
  currentId: number;
  charts: ChartSummary[];
  chartsLoading: boolean;
  chartsError?: string;
  busy: boolean;
  onCreate: () => void;
  onProject: (id: number) => void;
  onPlot: () => void;
  onUpload: () => void;
  onExperiments: () => void;
  onData: () => void;
  onChart: (id: number) => void;
  onRetry: () => void;
  /** Open the editor for `chartId` with the assistant open and `prompt` prefilled. */
  onAssistant?: (chartId: number, prompt: string) => void;
  onModelConnection?: () => void;
};

export function HomePage(p: HomePageProps) {
  const current = p.projects.find((project) => project.id === p.currentId);
  const latest = p.charts[0];
  const act = (callback: () => void) => (current ? callback() : p.onCreate());
  const now = new Date();
  return (
    <div className="home">
      <section className="home-intro" aria-label="欢迎">
        <div className="home-intro-text">
          <span className="lf-kicker">
            {dateLabel(now)} · 本地工作区
          </span>
          <h1>
            {greeting(now)}，
            {latest ? "接着上次的图继续。" : "从一份数据开始。"}
          </h1>
        </div>
        <div className="home-intro-actions">
          <button
            type="button"
            className="home-btn"
            disabled={p.busy}
            onClick={() => act(p.onUpload)}
          >
            <Upload size={16} aria-hidden="true" />
            {p.busy ? "正在导入…" : "导入数据"}
          </button>
          <button
            type="button"
            className="home-btn home-btn-primary"
            onClick={() => act(p.onPlot)}
          >
            <Plus size={16} aria-hidden="true" />
            {current ? "新建图表" : "创建第一个项目"}
          </button>
        </div>
      </section>

      <div className="home-top">
        {!current ? (
          <section className="home-card home-continue home-empty-hero">
            <FileSpreadsheet size={32} aria-hidden="true" />
            <h2>给下一项研究，一个自己的空间。</h2>
            <p>项目会把实验、数据版本和图表放在一起。数据只保存在本机。</p>
            <button
              type="button"
              className="home-btn home-btn-primary"
              onClick={p.onCreate}
            >
              创建研究项目 <ArrowRight size={16} aria-hidden="true" />
            </button>
          </section>
        ) : p.chartsLoading ? (
          <section
            className="home-card home-continue home-skeleton"
            role="status"
            aria-label="正在加载最近图表"
          />
        ) : p.chartsError ? (
          <section className="home-card home-continue home-empty-hero">
            <h2>最近图表暂时无法读取</h2>
            <p>{p.chartsError}</p>
            <button type="button" className="home-btn" onClick={p.onRetry}>
              重新加载
            </button>
          </section>
        ) : latest ? (
          <ContinueCard
            project={p.currentId}
            projectName={current.name}
            chart={latest}
            onOpen={() => p.onChart(latest.id)}
          />
        ) : (
          <section className="home-card home-continue home-empty-hero">
            <ChartNoAxesCombined size={32} aria-hidden="true" />
            <h2>你的第一张图表，从真实数据开始。</h2>
            <p>导入 CSV / XLSX / JSON，确认字段后直接进入绘图工作台。</p>
            <div className="home-row">
              <button type="button" className="home-btn" onClick={p.onUpload}>
                <Upload size={16} aria-hidden="true" /> 导入数据
              </button>
              <button
                type="button"
                className="home-btn home-btn-primary"
                onClick={p.onPlot}
              >
                打开绘图工作台 <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        <div className="home-side">
          <RecentCharts
            charts={p.charts.slice(1)}
            total={p.charts.length}
            enabled={!!current && !p.chartsLoading && !p.chartsError}
            onChart={p.onChart}
          />
          <AssistantCard
            chartId={latest?.id}
            onAssistant={p.onAssistant}
            onModelConnection={p.onModelConnection}
          />
        </div>
      </div>

      <section className="home-section" aria-label="快速开始">
        <h2 className="home-section-title">快速开始</h2>
        <div className="home-quick">
          <QuickTile
            icon={<Upload size={20} aria-hidden="true" />}
            title="导入数据"
            text="CSV / TSV / XLSX / JSON，自动识别字段类型与缺失值"
            disabled={p.busy}
            onClick={() => act(p.onUpload)}
          />
          <QuickTile
            icon={<ChartNoAxesCombined size={20} aria-hidden="true" />}
            title="新建图表"
            text="11 类科研图，字段映射后即时预览"
            onClick={() => act(p.onPlot)}
          />
          <QuickTile
            icon={<ChartColumn size={20} aria-hidden="true" />}
            title="对比实验"
            text="选 2–8 个实验，生成参数与指标对比"
            onClick={() => act(p.onExperiments)}
          />
          <QuickTile
            icon={<Sigma size={20} aria-hidden="true" />}
            title="处理与汇总"
            text="过滤、分组，输出 mean ± SD / SEM"
            onClick={() => act(p.onData)}
          />
        </div>
      </section>

      <div className="home-bottom">
        <ProjectsPanel
          projects={p.projects}
          currentId={p.currentId}
          onProject={p.onProject}
          onCreate={p.onCreate}
        />
        <ExperimentsPanel
          project={current}
          onExperiments={() => act(p.onExperiments)}
        />
      </div>

      <footer className="home-footer lf-mono">
        <span>数据保存在本机 · 原始文件只读</span>
        <span>LabFlow · 本地单用户模式</span>
      </footer>
    </div>
  );
}

function ContinueCard({
  project,
  projectName,
  chart,
  onOpen,
}: {
  project: number;
  projectName: string;
  chart: ChartSummary;
  onOpen: () => void;
}) {
  // Same query keys as the editor, so opening the chart reuses this cache.
  const detail = useQuery({
    queryKey: ["chart", project, chart.id],
    queryFn: () => api<ChartDetail>(`/projects/${project}/charts/${chart.id}`),
  });
  const versionId =
    detail.data?.config.datasetVersionId || detail.data?.dataset_version_id;
  const data = useQuery({
    queryKey: ["data", project, versionId],
    queryFn: () => api<Dataset>(`/projects/${project}/data/${versionId}`),
    enabled: !!versionId,
  });
  const [draft, setDraft] = useState(() =>
    localDraftInfo(localStorage, project, chart.id),
  );
  useEffect(() => {
    setDraft(localDraftInfo(localStorage, project, chart.id));
  }, [project, chart.id, chart.revision]);
  const c = detail.data?.config;
  const spec = c
    ? `FIGURE ${String(chart.id).padStart(2, "0")} · ${c.type.toUpperCase()} · ${c.style.preset.toUpperCase()}`
    : `FIGURE ${String(chart.id).padStart(2, "0")}`;
  return (
    <article className="home-card home-continue" aria-label="继续上次的图表">
      <header className="home-continue-head">
        <span className="lf-kicker">{spec}</span>
        {draft ? (
          <span className="lf-chip" data-tone="warning">
            <span className="lf-dot is-warning" />
            本机草稿 · 有未保存修改
          </span>
        ) : (
          <span className="lf-chip" data-tone="success">
            已保存 v{chart.revision}
          </span>
        )}
      </header>
      <div className="home-continue-figure">
        {detail.isError || data.isError ? (
          <div className="home-figure-message" role="alert">
            预览暂时无法生成：{(detail.error || data.error)?.message}
          </div>
        ) : c && data.data ? (
          <Suspense fallback={<div className="home-figure-skeleton" />}>
            <FigurePreview
              config={c}
              data={data.data}
              maxHeight={340}
              label={`${chart.name} 的预览`}
            />
          </Suspense>
        ) : (
          <div className="home-figure-skeleton" role="status" aria-label="正在载入预览" />
        )}
      </div>
      <footer className="home-continue-foot">
        <div className="home-continue-meta">
          <h2 title={chart.name}>{chart.name}</h2>
          <p>
            {projectName}
            {data.data && (
              <>
                {" · "}
                <span className="lf-mono">
                  {data.data.filename} v{data.data.version}
                </span>
              </>
            )}
            {" · "}
            {relativeTime(draft?.at || chart.updated_at)}
            {draft ? "编辑" : "保存"}
          </p>
        </div>
        <button
          type="button"
          className="home-btn home-btn-primary"
          onClick={onOpen}
        >
          继续编辑 <ArrowRight size={16} aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}

function RecentCharts({
  charts,
  total,
  enabled,
  onChart,
}: {
  charts: ChartSummary[];
  total: number;
  enabled: boolean;
  onChart: (id: number) => void;
}) {
  const [limit, setLimit] = useState(4);
  return (
    <section className="home-card home-recents" aria-labelledby="home-recents-title">
      <div className="home-card-head">
        <h2 id="home-recents-title">最近图表</h2>
        {total > 0 && <span className="home-meta">共 {total} 张</span>}
      </div>
      {!enabled ? (
        <p className="home-muted">创建项目并保存图表后显示在这里。</p>
      ) : charts.length ? (
        <ul className="home-list">
          {charts.slice(0, limit).map((chart) => (
            <li key={chart.id}>
              <button
                type="button"
                className="home-list-item"
                onClick={() => onChart(chart.id)}
              >
                <span className="home-list-icon" aria-hidden="true">
                  <ChartNoAxesCombined size={18} />
                </span>
                <span className="home-list-text">
                  <strong title={chart.name}>{chart.name}</strong>
                  <small>
                    v{chart.revision} · {relativeTime(chart.updated_at)}
                  </small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-muted">
          {total === 1 ? "目前只有左侧这一张图表。" : "还没有保存的图表。"}
        </p>
      )}
      {charts.length > limit && (
        <button
          type="button"
          className="home-more"
          onClick={() => setLimit((n) => n + 8)}
        >
          显示更多图表（剩余 {charts.length - limit}）
        </button>
      )}
    </section>
  );
}

function AssistantCard({
  chartId,
  onAssistant,
  onModelConnection,
}: {
  chartId?: number;
  onAssistant?: (chartId: number, prompt: string) => void;
  onModelConnection?: () => void;
}) {
  const provider = useQuery({
    queryKey: ["agent-provider"],
    queryFn: () => api<Provider>("/agent/provider"),
  });
  const [prompt, setPrompt] = useState("");
  const ready = !!provider.data?.available && !!chartId && !!onAssistant;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && prompt.trim()) onAssistant!(chartId!, prompt.trim());
  };
  return (
    <section className="home-assistant" aria-labelledby="home-assistant-title">
      <div className="home-card-head">
        <h2 id="home-assistant-title">绘图助手</h2>
        <span className="home-assistant-model lf-mono">
          <span
            className={`lf-dot ${provider.data?.available ? "is-live" : "is-off"}`}
          />
          {provider.data?.available ? provider.data.model : "未连接模型"}
        </span>
      </div>
      {provider.data?.available ? (
        <form onSubmit={submit} className="home-assistant-form">
          <label htmlFor="home-assistant-input">
            {chartId
              ? "对最近的图说出想改的地方，会在编辑器中先预览，确认后才应用。"
              : "保存第一张图表后，就可以在这里描述修改。"}
          </label>
          <div className="home-assistant-field">
            <input
              id="home-assistant-input"
              type="text"
              value={prompt}
              maxLength={2000}
              disabled={!ready}
              placeholder="把图例放到右侧，字号改为 16"
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              type="submit"
              aria-label="在编辑器中打开助手"
              disabled={!ready || !prompt.trim()}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="home-assistant-chips">
            {["图例放到右侧", "隐藏网格线", "整体字号改为 18"].map((text) => (
              <button
                key={text}
                type="button"
                disabled={!ready}
                onClick={() => setPrompt(text)}
              >
                {text}
              </button>
            ))}
          </div>
        </form>
      ) : (
        <div className="home-assistant-form">
          <p>连接任意兼容 Chat Completions 的模型后，可以用一句话调整图表。</p>
          {onModelConnection && (
            <button
              type="button"
              className="home-btn home-btn-inverse"
              onClick={onModelConnection}
            >
              配置模型连接
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function QuickTile({
  icon,
  title,
  text,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="home-quick-tile"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="home-quick-icon">{icon}</span>
      <span className="home-quick-title">{title}</span>
      <span className="home-quick-text">{text}</span>
    </button>
  );
}

function ProjectsPanel({
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
        .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId)),
    [projects, currentId, deferred],
  );
  useEffect(() => {
    setLimit(4);
  }, [deferred]);
  return (
    <section className="home-card home-table-card" aria-labelledby="home-projects-title">
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
            aria-label="搜索工作区项目"
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
          <button type="button" className="home-link" onClick={() => setSearch("")}>
            清除搜索
          </button>
        </div>
      ) : (
        <div className="home-grid-table" role="list">
          <div className="home-grid-row home-grid-head" aria-hidden="true">
            <span>项目</span>
            <span>实验</span>
            <span>数据</span>
            <span>图表</span>
          </div>
          {filtered.slice(0, limit).map((project) => (
            <div role="listitem" key={project.id}>
              <button
                type="button"
                className={`home-grid-row home-project ${project.id === currentId ? "is-current" : ""}`}
                aria-pressed={project.id === currentId}
                onClick={() => onProject(project.id)}
              >
                <span className="home-project-name" title={project.name}>
                  {project.id === currentId && <span className="lf-dot" />}
                  {project.name}
                </span>
                <span className="lf-mono">{project.experiment_count}</span>
                <span className="lf-mono">{project.dataset_count}</span>
                <span className="lf-mono">{project.chart_count}</span>
              </button>
            </div>
          ))}
        </div>
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

function ExperimentsPanel({
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
    <section className="home-card home-table-card" aria-labelledby="home-experiments-title">
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
        <p className="home-muted" role="status">正在读取实验…</p>
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
        <div className="home-table-scroll">
          <table className="home-table">
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
