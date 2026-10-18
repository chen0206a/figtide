import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical,
  Database,
  ChartNoAxesCombined,
  Plus,
  ArrowUpRight,
  ArrowRight,
  FolderOpen,
  Upload,
  FileSpreadsheet,
  Activity,
  Layers,
  Check,
  AlertCircle,
  BookOpen,
  Palette,
  History,
  FileDown,
} from "lucide-react";
import { api, send, type Project, type Dataset } from "./lib/api";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { DataTable } from "./components/DataTable";
import { PLATES } from "./components/Plates";
const Editor = lazy(() => import("./editor/Editor"));
type Page = "home" | "experiments" | "data" | "editor";
const FEATURES = [
  {
    icon: <FlaskConical size={20} />,
    title: "实验记录",
    desc: "参数、指标与观察写在同一处，随时回到任何一次探索。",
    tag: "NOTEBOOK",
  },
  {
    icon: <Database size={20} />,
    title: "不可变数据版本",
    desc: "原始文件只读归档并记录 SHA-256，新版本追加而非覆盖。",
    tag: "IMMUTABLE",
  },
  {
    icon: <ChartNoAxesCombined size={20} />,
    title: "论文级绘图",
    desc: "折线、柱状、散点与热力图，字段映射后即时预览。",
    tag: "FIGURE",
  },
  {
    icon: <Palette size={20} />,
    title: "样式与预设",
    desc: "字体、配色、坐标轴、误差棒与注释，一次调整全局生效。",
    tag: "STYLE",
  },
  {
    icon: <History size={20} />,
    title: "版本回溯",
    desc: "每次保存都是完整快照，历史版本可对比、可恢复。",
    tag: "SNAPSHOT",
  },
  {
    icon: <FileDown size={20} />,
    title: "矢量导出",
    desc: "SVG 矢量与 2× 高清 PNG，文本仍是文本，可直接投稿。",
    tag: "EXPORT",
  },
] as const;
export default function App() {
  const qc = useQueryClient();
  const [page, setPage] = useState<Page>("home"),
    [project, setProject] = useState(
      Number(localStorage.getItem("labflow-project")) || 0,
    ),
    [chart, setChart] = useState<number | null>(null),
    [dataset, setDataset] = useState(0),
    [modal, setModal] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [uploadVersion, setUploadVersion] = useState<number | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
  });
  const datasets = useQuery({
    queryKey: ["datasets", project],
    queryFn: () => api<Dataset[]>(`/projects/${project}/datasets`),
    enabled: !!project,
  });
  const charts = useQuery({
    queryKey: ["charts", project],
    queryFn: () => api<any[]>(`/projects/${project}/charts`),
    enabled: !!project,
  });
  useEffect(() => {
    if (!project && projects.data?.length) setProject(projects.data[0].id);
  }, [projects.data, project]);
  useEffect(() => {
    localStorage.setItem("labflow-project", String(project));
  }, [project]);
  const current = projects.data?.find((p) => p.id === project);
  const navigate = (p: Page, id?: number) => {
    if (
      dirty.current &&
      !window.confirm("当前图表尚未保存，离开将丢弃这些修改。继续？")
    )
      return;
    dirty.current = false;
    setPage(p);
    if (id !== undefined) setChart(id);
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["datasets", project] });
    qc.invalidateQueries({ queryKey: ["charts", project] });
  };
  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api<Project>(
        "/projects",
        send("POST", { name, description }),
      );
      setProject(p.id);
      setModal(false);
      setName("");
      setDescription("");
      refresh();
      setMessage("项目已创建，可以上传实验数据了");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    if (!project) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const d = await api<Dataset>(
        `/projects/${project}/datasets${uploadVersion ? `/${uploadVersion}/versions` : ""}`,
        { method: "POST", body: form },
      );
      setDataset(d.id);
      refresh();
      navigate("data");
      setMessage(`已导入 ${d.row_count} 行，原始文件已归档`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setUploadVersion(null);
      if (upload.current) upload.current.value = "";
    }
  }
  const chooseUpload = (id: number | null = null) => {
    setUploadVersion(id);
    upload.current?.click();
  };
  return (
    <div className="app-shell">
      <div className="main-shell">
        <header className="masthead">
          <div className="masthead-bar">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate("home");
              }}
              title="LabFlow 首页"
            >
              <FlaskConical size={17} />
              <span>LabFlow</span>
            </a>
            <span className="masthead-meta">Research workspace · Vol. 01</span>
            <div className="global-right">
              <span className="local-badge">
                <span /> 本地工作区
              </span>
              <select
                aria-label="当前项目"
                value={project}
                onChange={(e) => {
                  if (
                    dirty.current &&
                    !window.confirm("切换项目将丢弃未保存修改，继续？")
                  )
                    return;
                  dirty.current = false;
                  setProject(Number(e.target.value));
                  setChart(null);
                  setDataset(0);
                  setPage("home");
                }}
              >
                <option value={0} disabled>
                  选择项目
                </option>
                {projects.data?.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                title="新建项目"
                onClick={() => setModal(true)}
              >
                <Plus size={15} />
              </Button>
            </div>
          </div>
          <nav className="site-nav" aria-label="主导航">
            {(
              [
                ["home", "项目概览", "01"],
                ["experiments", "实验记录", "02"],
                ["data", "数据管理", "03"],
                ["editor", "科研绘图", "04"],
              ] as const
            ).map(([id, label, index]) => (
              <button
                key={id}
                className={page === id ? "nav-link active" : "nav-link"}
                aria-label={label}
                title={label}
                onClick={() => navigate(id)}
              >
                <span className="nav-index">{index}</span>
                {label}
              </button>
            ))}
            <span className="nav-spacer" />
            <span className="nav-note">Local · single user</span>
          </nav>
        </header>
        {message && (
          <div className="toast" role="status">
            <Check size={16} />
            {message}
            <button aria-label="关闭消息" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}
        <input
          ref={upload}
          data-testid="file-upload"
          type="file"
          accept=".csv,.xlsx"
          hidden
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
        {projects.isPending ? (
          <div className="empty-state">
            <span className="spinner" />
            正在连接本地工作区…
          </div>
        ) : projects.isError ? (
          <div className="empty-state">
            <AlertCircle />
            <h2>无法连接 Java 服务</h2>
            <p>{projects.error.message}</p>
            <Button onClick={() => projects.refetch()}>重新连接</Button>
          </div>
        ) : page === "editor" && project ? (
          <Suspense
            fallback={<div className="empty-state">正在加载绘图引擎…</div>}
          >
            <Editor
              key={`${project}-${chart}`}
              project={project}
              projectName={current?.name || ""}
              datasets={datasets.data || []}
              chartId={chart}
              initialDataset={dataset}
              onSaved={(id) => {
                setChart(id);
                refresh();
              }}
              onUpload={() => chooseUpload()}
              onDirty={(v) => {
                dirty.current = v;
              }}
              notify={setMessage}
            />
          </Suspense>
        ) : (
          <main className="page-content">
            {page === "home" || !project ? (
              <>
                <section className="hero">
                  <div className="hero-grid">
                    <div className="hero-main">
                      <p className="kicker">Research workspace — Issue 01</p>
                      <h1>
                        让每一次实验，
                        <br />
                        <em>都有迹可循</em>。
                      </h1>
                      <p className="lede">
                        从原始数据到论文图版，LabFlow
                        把实验记录、不可变数据版本与绘图配置留在同一条可复现的链路上。
                      </p>
                      <div className="hero-actions">
                        <Button onClick={() => setModal(true)}>
                          新建项目 <ArrowRight size={15} />
                        </Button>
                        <button
                          className="link-arrow"
                          disabled={!project || busy}
                          onClick={() => chooseUpload()}
                        >
                          上传第一份数据 <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </div>
                    <aside className="hero-side">
                      <p className="kicker">Contents</p>
                      <ol className="hero-toc">
                        {(
                          [
                            ["Overview", "研究项目与最近图版", "home"],
                            ["Notebook", "参数、指标与实验备注", "experiments"],
                            ["Data library", "不可变版本与字段预览", "data"],
                            ["Figure editor", "论文级图版编辑与导出", "editor"],
                          ] as const
                        ).map(([title, desc, target], i) => (
                          <li key={title}>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(target);
                              }}
                            >
                              <span className="toc-no">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span>
                                <b>{title}</b>
                                <small>{desc}</small>
                              </span>
                              <ArrowUpRight size={14} />
                            </a>
                          </li>
                        ))}
                      </ol>
                    </aside>
                  </div>
                  <dl className="hero-meta">
                    <div>
                      <dt>Stack</dt>
                      <dd>Java 21 · Spring Boot 3 · MySQL 8</dd>
                    </div>
                    <div>
                      <dt>Figures</dt>
                      <dd>SVG 矢量 · 2× PNG</dd>
                    </div>
                    <div>
                      <dt>Dependencies</dt>
                      <dd>无代码 · 无 API Key</dd>
                    </div>
                  </dl>
                </section>
                <div className="stat-strip">
                  <Stat
                    icon={<FolderOpen />}
                    label="研究项目"
                    value={projects.data?.length || 0}
                  />
                  <Stat
                    icon={<FlaskConical />}
                    label="实验记录"
                    value={
                      projects.data?.reduce(
                        (s, p) => s + p.experiment_count,
                        0,
                      ) || 0
                    }
                  />
                  <Stat
                    icon={<ChartNoAxesCombined />}
                    label="科研图表"
                    value={
                      projects.data?.reduce((s, p) => s + p.chart_count, 0) || 0
                    }
                  />
                  <Stat
                    icon={<Database />}
                    label="数据集"
                    value={
                      projects.data?.reduce((s, p) => s + p.dataset_count, 0) ||
                      0
                    }
                  />
                </div>
                <section className="section plates-section" aria-label="图版示例">
                  <div className="section-head">
                    <div>
                      <p className="kicker">Plates</p>
                      <h2>按期刊规范渲染的图版</h2>
                    </div>
                    <p className="section-note">
                      单栏 89 mm、5–7 pt 字号、a–d 面板字母、Okabe–Ito
                      色盲安全配色；图版由 LabFlow 用合成数据渲染，可直接作为绘图模板。
                    </p>
                  </div>
                  <div className="plate-grid">
                    {PLATES.map((plate) => (
                      <figure className="plate" key={plate.no}>
                        <div className="plate-canvas">{plate.svg}</div>
                        <figcaption className="plate-caption">
                          <div className="plate-head">
                            <span className="plate-no">Fig. {plate.no}</span>
                            <span className="plate-spec">{plate.spec}</span>
                          </div>
                          <h3>{plate.title}</h3>
                          <p>{plate.note}</p>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
                <section className="section" aria-label="主要功能">
                  <div className="section-head">
                    <div>
                      <p className="kicker">Capabilities</p>
                      <h2>从记录到成图，六个环节</h2>
                    </div>
                    <p className="section-note">
                      每一环都写入本地 MySQL，不依赖任何外部服务。
                    </p>
                  </div>
                  <ol className="cap-list">
                    {FEATURES.map((f, i) => (
                      <li className="cap-item" key={f.tag}>
                        <span className="cap-no">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <h3>{f.title}</h3>
                          <p>{f.desc}</p>
                        </div>
                        <span className="cap-tag">{f.tag}</span>
                      </li>
                    ))}
                  </ol>
                </section>
                <div className="home-columns">
                  <section>
                    <div className="section-heading">
                      <h2>
                        研究项目 <span>{projects.data?.length || 0}</span>
                      </h2>
                      <span className="muted">最近创建</span>
                    </div>
                    <div className="project-grid">
                      {projects.data?.map((p, i) => (
                        <button
                          className={`project-card ${p.id === project ? "selected" : ""}`}
                          key={p.id}
                          onClick={() => {
                            setProject(p.id);
                            setDataset(0);
                            setChart(null);
                          }}
                        >
                          <div className="project-card-top">
                            <div className={`project-icon p${i % 3}`}>
                              <FolderOpen size={21} />
                            </div>
                            <ArrowUpRight size={17} />
                          </div>
                          <h3>{p.name}</h3>
                          <p>
                            {p.description ||
                              "一个新的研究探索，从第一份数据开始。"}
                          </p>
                          <div className="project-meta">
                            <span>{p.experiment_count} 个实验</span>
                            <span>{p.chart_count} 张图表</span>
                            {p.id === project && (
                              <span className="selected-label">当前项目</span>
                            )}
                          </div>
                        </button>
                      ))}
                      <button
                        className="new-project-card"
                        onClick={() => setModal(true)}
                      >
                        <Plus size={24} />
                        <span>开始一项新研究</span>
                        <small>独立管理实验、数据和图表</small>
                      </button>
                    </div>
                    <div className="section-heading spaced">
                      <h2>最近图表</h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!project}
                        onClick={() => {
                          setChart(null);
                          navigate("editor");
                        }}
                      >
                        新建图表 <Plus size={14} />
                      </Button>
                    </div>
                    {charts.data?.length ? (
                      <div className="chart-list">
                        {charts.data.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => navigate("editor", c.id)}
                          >
                            <span className="mini-chart">
                              <ChartNoAxesCombined size={24} />
                            </span>
                            <span>
                              <strong>{c.name}</strong>
                              <small>
                                {current?.name} · 版本 {c.revision}
                              </small>
                            </span>
                            <span className="muted">
                              {new Date(c.updated_at).toLocaleDateString()}
                            </span>
                            <ArrowRight size={16} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-inline">
                        <ChartNoAxesCombined size={25} />
                        <p>第一张图表，从你的实验数据开始。</p>
                        <Button
                          variant="outline"
                          disabled={!project}
                          onClick={() => navigate("editor")}
                        >
                          打开绘图工作台
                        </Button>
                      </div>
                    )}
                  </section>
                  <aside className="home-guide">
                    <div className="guide-icon">
                      <Activity size={23} />
                    </div>
                    <span className="page-eyebrow">FROM DATA TO DISCOVERY</span>
                    <h2>
                      数据有依据，
                      <br />
                      图表可复现。
                    </h2>
                    <p>
                      让研究过程和最终图表保持连接。每一次保存，都记录数据版本与完整绘图配置。
                    </p>
                    <div className="guide-step">
                      <span>01</span>
                      <div>
                        <b>导入实验数据</b>
                        <small>CSV / XLSX · 不可变版本</small>
                      </div>
                    </div>
                    <div className="guide-step">
                      <span>02</span>
                      <div>
                        <b>构建你的图表</b>
                        <small>字段映射 · 即时样式调整</small>
                      </div>
                    </div>
                    <div className="guide-step">
                      <span>03</span>
                      <div>
                        <b>将成果带入论文</b>
                        <small>SVG 矢量 / 高清 PNG</small>
                      </div>
                    </div>
                    <Button
                      disabled={!project || busy}
                      onClick={() => chooseUpload()}
                    >
                      <Upload size={15} />
                      {busy ? "正在导入…" : "上传第一份数据"}
                    </Button>
                    <div className="guide-note">
                      <BookOpen size={15} />
                      无需代码，无需 AI API
                    </div>
                  </aside>
                </div>
                <footer className="page-footer">
                  <span>LabFlow / v0.1 · 为研究过程而设计</span>
                  <span>本地模式 · 请勿直接公开部署</span>
                </footer>
              </>
            ) : page === "data" ? (
              <DataPage
                project={project}
                selected={dataset}
                onSelect={setDataset}
                datasets={datasets.data || []}
                loading={datasets.isPending}
                error={datasets.error?.message}
                onRetry={() => datasets.refetch()}
                onUpload={chooseUpload}
                busy={busy}
                onPlot={() => {
                  setChart(null);
                  navigate("editor");
                }}
              />
            ) : page === "experiments" ? (
              <Experiments
                project={project}
                notify={setMessage}
                onData={() => navigate("data")}
              />
            ) : null}
          </main>
        )}
      </div>
      <Dialog
        open={modal}
        onOpenChange={setModal}
        title="新建研究项目"
        description="为你的实验、数据和图表创建一个独立空间。"
      >
        <form onSubmit={createProject}>
          <label>
            项目名称
            <input
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：视觉模型消融研究"
            />
          </label>
          <label>
            研究简介
            <textarea
              maxLength={10000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="记录研究目标与方向…"
            />
          </label>
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModal(false)}
            >
              取消
            </Button>
            <Button disabled={busy || !name.trim()}>
              {busy ? "创建中…" : "创建项目"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{String(value).padStart(2, "0")}</strong>
      </div>
    </div>
  );
}
function DataPage({
  project,
  selected,
  onSelect,
  datasets,
  loading,
  error,
  onRetry,
  onUpload,
  busy,
  onPlot,
}: {
  project: number;
  selected: number;
  onSelect: (id: number) => void;
  datasets: Dataset[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onUpload: (id?: number | null) => void;
  busy: boolean;
  onPlot: () => void;
}) {
  const id = selected || datasets[0]?.id;
  const detail = useQuery({
    queryKey: ["data", project, id],
    queryFn: () => api<Dataset>(`/projects/${project}/data/${id}`),
    enabled: !!id,
  });
  useEffect(() => {
    if (!selected && id) onSelect(id);
  }, [id, selected, onSelect]);
  return (
    <>
      <div className="page-eyebrow">DATA LIBRARY</div>
      <div className="page-heading">
        <div>
          <h1>每一份数据，都有来源。</h1>
          <p>原始文件只读保存，使用独立版本追踪变化。</p>
        </div>
        <Button disabled={busy} onClick={() => onUpload()}>
          <Upload size={16} />
          {busy ? "解析中…" : "上传 CSV / XLSX"}
        </Button>
      </div>
      {loading ? (
        <p>正在加载数据…</p>
      ) : error ? (
        <div className="empty-inline">
          {error}
          <Button onClick={onRetry}>重试</Button>
        </div>
      ) : datasets.length ? (
        <div className="data-layout">
          <aside className="dataset-list">
            <h3>
              数据版本 <span>{datasets.length}</span>
            </h3>
            {datasets.map((d) => (
              <button
                key={d.id}
                className={id === d.id ? "active" : ""}
                onClick={() => onSelect(d.id)}
              >
                <FileSpreadsheet size={18} />
                <span>
                  <b>{d.filename}</b>
                  <small>
                    v{d.version} · {d.row_count} 行
                  </small>
                </span>
              </button>
            ))}
          </aside>
          <section className="data-detail">
            {detail.isPending ? (
              <p>正在读取数据…</p>
            ) : detail.isError ? (
              <div className="empty-inline">
                {detail.error.message}
                <Button onClick={() => detail.refetch()}>重试</Button>
              </div>
            ) : (
              detail.data && (
                <>
                  <div className="data-title">
                    <div>
                      <h2>{detail.data.filename}</h2>
                      <span className="muted">
                        版本 {detail.data.version} · SHA-256{" "}
                        {detail.data.sha256.slice(0, 12)}…
                      </span>
                    </div>
                    <div className="button-row">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onUpload(detail.data.dataset_id)}
                      >
                        <Layers size={14} />
                        新版本
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/projects/${project}/data/${id}/original`}
                        >
                          原始文件
                        </a>
                      </Button>
                      <Button size="sm" onClick={onPlot}>
                        用于绘图 <ArrowUpRight size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="field-pills">
                    {detail.data.fields.map((f) => (
                      <span key={f.name}>
                        <b>{f.type === "number" ? "#" : "Aa"}</b>
                        {f.name}
                        <small>
                          {f.type}
                          {f.missing ? ` · ${f.missing} 缺失` : ""}
                        </small>
                      </span>
                    ))}
                  </div>
                  {detail.data.warnings.map((w) => (
                    <div className="warning" key={w}>
                      {w}
                    </div>
                  ))}
                  <DataTable key={id} data={detail.data} />
                </>
              )
            )}
          </section>
        </div>
      ) : (
        <div className="empty-state bordered">
          <Database size={40} />
          <h2>将实验结果带入工作区</h2>
          <p>支持 UTF-8 CSV 和无宏 XLSX · 最多 10 MB / 20,000 行</p>
          <Button disabled={busy} onClick={() => onUpload()}>
            <Upload size={16} />
            选择数据文件
          </Button>
        </div>
      )}
    </>
  );
}
function Experiments({
  project,
  notify,
  onData,
}: {
  project: number;
  notify: (s: string) => void;
  onData: () => void;
}) {
  const qc = useQueryClient(),
    query = useQuery({
      queryKey: ["experiments", project],
      queryFn: () => api<any[]>(`/projects/${project}/experiments`),
    });
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<any>({
      name: "",
      parameters: "{}",
      metrics: "{}",
      notes: "",
    });
  function start(e?: any) {
    setEdit(
      e
        ? {
            ...e,
            parameters: JSON.stringify(e.parameters, null, 2),
            metrics: JSON.stringify(e.metrics, null, 2),
          }
        : { name: "", parameters: "{}", metrics: "{}", notes: "" },
    );
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        `/projects/${project}/experiments${edit.id ? "/" + edit.id : ""}`,
        send(edit.id ? "PUT" : "POST", {
          ...edit,
          parameters: JSON.parse(edit.parameters),
          metrics: JSON.parse(edit.metrics),
        }),
      );
      qc.invalidateQueries({ queryKey: ["experiments", project] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      notify("实验记录已保存");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-eyebrow">EXPERIMENT NOTEBOOK</div>
      <div className="page-heading">
        <div>
          <h1>把探索，沉淀为记录。</h1>
          <p>将参数、评估指标和观察留在同一处。</p>
        </div>
        <div className="button-row">
          <Button variant="outline" onClick={onData}>
            项目数据文件
          </Button>
          <Button onClick={() => start()}>
            <Plus size={16} />
            记录实验
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <p>加载中…</p>
      ) : query.isError ? (
        <div className="empty-inline">
          {query.error.message}
          <Button onClick={() => query.refetch()}>重试</Button>
        </div>
      ) : query.data?.length ? (
        <div className="experiment-list">
          {query.data.map((e) => (
            <button key={e.id} onClick={() => start(e)}>
              <span className="experiment-icon">
                <FlaskConical />
              </span>
              <div>
                <h3>{e.name}</h3>
                <p>{e.notes || "暂无实验备注"}</p>
                <div className="metric-pills">
                  {Object.entries(e.metrics).map(([k, v]) => (
                    <span key={k}>
                      {k} <b>{String(v)}</b>
                    </span>
                  ))}
                </div>
              </div>
              <ArrowUpRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state bordered">
          <FlaskConical size={40} />
          <h2>开始记录你的第一个实验</h2>
          <p>保存参数、指标和研究笔记，随时回来继续。</p>
          <Button onClick={() => start()}>创建实验记录</Button>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={edit.id ? "编辑实验记录" : "新建实验记录"}
        description="参数和指标使用 JSON 对象保存，支持任意实验配置。"
      >
        <form onSubmit={save}>
          {(["name", "parameters", "metrics", "notes"] as const).map((k) => (
            <label key={k}>
              {
                {
                  name: "实验名称",
                  parameters: "参数（JSON）",
                  metrics: "指标（JSON）",
                  notes: "备注",
                }[k]
              }
              {k === "name" ? (
                <input
                  required
                  maxLength={120}
                  value={edit[k]}
                  onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                />
              ) : (
                <textarea
                  aria-label={
                    {
                      parameters: "参数（JSON）",
                      metrics: "指标（JSON）",
                      notes: "备注",
                    }[k as "parameters" | "metrics" | "notes"]
                  }
                  className={k !== "notes" ? "code-input" : ""}
                  value={edit[k]}
                  onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                />
              )}
            </label>
          ))}
          <div className="dialog-actions">
            <Button disabled={busy || !edit.name.trim()}>
              {busy ? "保存中…" : "保存记录"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
