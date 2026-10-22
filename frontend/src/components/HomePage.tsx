import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  ChartNoAxesCombined,
  Upload,
  NotebookPen,
  Database,
  FolderOpen,
  Check,
  Clock3,
  ChevronRight,
  HardDrive,
  Layers,
  Search,
} from "lucide-react";
import type { Project } from "../lib/api";
import { LabFlowMark } from "./LabFlowMark";
import "./home.css";
import { FigureShowcase } from "./FigureShowcase";

type ChartSummary = {
  id: number;
  name: string;
  revision: number;
  updated_at: string;
};
type Props = {
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
};
export function HomePage(p: Props) {
  const [intro] = useState(() => !sessionStorage.getItem("labflow-intro-v2"));
  useEffect(() => {
    sessionStorage.setItem("labflow-intro-v2", "seen");
  }, []);
  const current = p.projects.find((project) => project.id === p.currentId);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [projectLimit, setProjectLimit] = useState(4);
  const [chartLimit, setChartLimit] = useState(4);
  const projects = useMemo(
    () =>
      p.projects
        .filter((project) =>
          `${project.name} ${project.description}`
            .toLowerCase()
            .includes(deferredSearch.trim().toLowerCase()),
        )
        .sort(
          (a, b) => Number(b.id === p.currentId) - Number(a.id === p.currentId),
        ),
    [p.projects, p.currentId, deferredSearch],
  );
  useEffect(() => {
    setProjectLimit(4);
  }, [deferredSearch]);
  useEffect(() => {
    setChartLimit(4);
  }, [p.currentId]);
  const act = (callback: () => void) => (current ? callback() : p.onCreate());
  const actions = [
    {
      title: p.busy ? "正在导入…" : "导入数据",
      desc: "从一份实验结果开始。",
      detail: "表格与 JSON 日志 · 原始文件保留",
      Icon: Upload,
      color: "violet",
      action: "选择数据文件",
      run: () => act(p.onUpload),
    },
    {
      title: "实验笔记",
      desc: "记录每一次尝试与发现。",
      detail: "参数 / 指标 / 研究备注",
      Icon: NotebookPen,
      color: "amber",
      action: "记录新发现",
      run: () => act(p.onExperiments),
    },
    {
      title: "数据资料库",
      desc: "每个版本，都有迹可循。",
      detail: "字段预览 / 版本 / 内容指纹",
      Icon: Database,
      color: "teal",
      action: "浏览数据版本",
      run: () => act(p.onData),
    },
  ];
  return (
    <div className={`launch-home ${intro ? "intro-play" : "intro-seen"}`}>
      <section className="launch-hero" aria-label="欢迎来到 LabFlow">
        <div className="launch-aura" aria-hidden="true" />
        <div className="launch-logo">
          <LabFlowMark size={78} />
        </div>
        <div className="launch-brand">
          <h1>
            LabFlow<span className="brand-period">.</span>
          </h1>
        </div>
        <div className="launch-intro">
          <p className="launch-tagline">专注探索，让研究自然成形。</p>
          <p className="launch-description">
            实验、数据与图表，在一个安静的工作空间里连接。
          </p>
        </div>
        <div className="launch-cta">
          <button className="launch-primary" onClick={() => act(p.onPlot)}>
            {current ? "开始绘图" : "创建第一个项目"}
            <ArrowRight size={16} />
          </button>
          <button className="launch-secondary" onClick={p.onCreate}>
            <Plus size={15} />
            新建项目
          </button>
        </div>
        <div className="launch-local">
          <span />
          本地保存<span className="local-divider">·</span>无需账号
          <span className="local-divider">·</span>随时继续
        </div>
      </section>
      <FigureShowcase />
      <section className="launch-tools" aria-label="功能入口">
        <button
          className="launch-tool tool-blue tool-featured"
          style={{ "--order": 0 } as CSSProperties}
          onClick={() => act(p.onPlot)}
          aria-label="绘图工作台：进入工作台"
        >
          <div className="featured-top">
            <span className="featured-label">
              <ChartNoAxesCombined size={20} />
              绘图工作台
            </span>
            <ArrowUpRight size={21} className="featured-corner" />
          </div>
          <div className="featured-copy">
            <h2>
              让下一次发现，
              <br />
              清晰呈现。
            </h2>
            <p>11 种图表 · 自由编辑 · 论文级导出</p>
          </div>
          <div className="featured-bottom">
            <span className="featured-context" title={current?.name}>
              <span className="featured-dot" />
              <span>{current?.name || "从第一个研究项目开始"}</span>
            </span>
            <span className="tool-action">
              进入工作台
              <ArrowRight size={16} className="tool-arrow" />
            </span>
          </div>
        </button>
        <div className="tool-shortcuts">
          {actions.map(
            ({ title, desc, detail, Icon, color, action, run }, i) => (
              <button
                key={color}
                className={`launch-tool tool-shortcut tool-${color}`}
                style={{ "--order": i + 1 } as CSSProperties}
                onClick={run}
                disabled={color === "violet" && p.busy}
                aria-label={`${title}：${action}`}
                title={detail}
              >
                <span className="tool-icon">
                  <Icon size={22} strokeWidth={1.7} />
                </span>
                <span className="shortcut-copy">
                  <h2>{title}</h2>
                  <p>{desc}</p>
                </span>
                <span className="tool-action">
                  <span>{action}</span>
                  <ArrowUpRight className="tool-arrow" size={18} />
                </span>
              </button>
            ),
          )}
        </div>
      </section>
      <section className="launch-workspace" aria-label="我的工作区">
        <div className="workspace-heading">
          <div>
            <span className="workspace-eyebrow">你的研究空间</span>
            <h2>接着上次的灵感。</h2>
          </div>
          <span className="workspace-summary">
            <HardDrive size={14} />
            {p.projects.length} 个项目 · 数据保存在本机
          </span>
        </div>
        <div className="workspace-columns">
          <section className="workspace-panel projects-panel">
            <div className="workspace-panel-head">
              <h3>
                研究项目 <span>{p.projects.length}</span>
              </h3>
              <button onClick={p.onCreate} aria-label="添加研究项目">
                <Plus size={15} /> 新建
              </button>
            </div>
            {p.projects.length > 4 && (
              <div className="workspace-search">
                <Search size={16} aria-hidden="true" />
                <input
                  aria-label="搜索工作区项目"
                  placeholder="查找你的研究项目…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
            <div className="workspace-projects">
              {p.projects.length ? (
                projects.length ? (
                  projects.slice(0, projectLimit).map((project) => (
                    <button
                      className={`workspace-project ${project.id === p.currentId ? "is-current" : ""}`}
                      key={project.id}
                      onClick={() => p.onProject(project.id)}
                      aria-pressed={project.id === p.currentId}
                    >
                      <span className="workspace-folder">
                        <FolderOpen size={20} />
                      </span>
                      <span className="workspace-project-text">
                        <strong title={project.name}>{project.name}</strong>
                        <small>
                          {project.experiment_count} 个实验<span>·</span>
                          {project.dataset_count} 份数据<span>·</span>
                          {project.chart_count} 张图表
                        </small>
                      </span>
                      {project.id === p.currentId ? (
                        <span className="project-check">
                          <Check size={13} />
                          当前
                        </span>
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="workspace-empty">
                    <p>没有匹配的项目</p>
                    <button onClick={() => setSearch("")}>清除搜索</button>
                  </div>
                )
              ) : (
                <div className="workspace-empty">
                  <FolderOpen size={28} />
                  <p>给下一项研究，一个自己的空间。</p>
                  <button onClick={p.onCreate}>
                    创建研究项目
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            {projects.length > projectLimit && (
              <button
                className="workspace-more"
                onClick={() => setProjectLimit((n) => n + 8)}
              >
                显示更多项目（剩余 {projects.length - projectLimit}）
                <ChevronRight size={14} />
              </button>
            )}
            {current && (
              <div className="workspace-current-note">
                <span className="current-indicator" />
                <span>
                  {current.description ||
                    "一个新的研究探索，从第一份数据开始。"}
                </span>
              </div>
            )}
          </section>
          <section className="workspace-panel recent-panel">
            <div className="workspace-panel-head">
              <h3>最近图表</h3>
              <span>{current ? "当前项目" : "创建项目后开始"}</span>
            </div>
            <div className="workspace-recents">
              {p.chartsLoading && current ? (
                <div
                  className="workspace-skeleton"
                  role="status"
                  aria-label="正在加载最近图表"
                >
                  <i />
                  <i />
                </div>
              ) : p.chartsError ? (
                <div className="workspace-empty">
                  <p>{p.chartsError}</p>
                  <button onClick={p.onRetry}>
                    重新加载
                    <ArrowRight size={14} />
                  </button>
                </div>
              ) : p.charts.length ? (
                p.charts.slice(0, chartLimit).map((chart) => (
                  <button
                    className="workspace-chart"
                    key={chart.id}
                    onClick={() => p.onChart(chart.id)}
                  >
                    <span className="recent-figure-icon">
                      <ChartNoAxesCombined size={21} />
                    </span>
                    <span className="recent-chart-copy">
                      <strong title={chart.name}>{chart.name}</strong>
                      <small>
                        <Clock3 size={11} />
                        {new Date(chart.updated_at).toLocaleDateString("zh-CN")}
                        <span>·</span>版本 {chart.revision}
                      </small>
                    </span>
                    <span className="recent-chart-action">
                      继续编辑
                      <ArrowUpRight size={15} />
                    </span>
                  </button>
                ))
              ) : (
                <div className="workspace-empty">
                  <ChartNoAxesCombined size={28} />
                  <p>你的第一张图表，从真实数据开始。</p>
                  <button onClick={() => act(p.onPlot)}>
                    打开绘图工作台
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            {p.charts.length > chartLimit && (
              <button
                className="workspace-more"
                onClick={() => setChartLimit((n) => n + 8)}
              >
                显示更多图表（剩余 {p.charts.length - chartLimit}）
                <ChevronRight size={14} />
              </button>
            )}
          </section>
        </div>
      </section>
      <footer className="launch-footer">
        <span>
          <LabFlowMark size={19} />
          为每一次认真探索而设计。
        </span>
        <span>
          <Layers size={13} />
          保留原始数据，连接每一版成果。
        </span>
      </footer>
    </div>
  );
}
