import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical,
  Database,
  ChartNoAxesCombined,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  Layers,
  Check,
  AlertCircle,
} from "lucide-react";
import { api, send, type Project, type Dataset } from "./lib/api";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { DataTable } from "./components/DataTable";
import { HomePage } from "./components/HomePage";
import { LabFlowMark } from "./components/LabFlowMark";
import { UploadDialog } from "./components/UploadDialog";
import { ProjectManager } from "./components/ProjectManager";
import { useConfirm } from "./components/useConfirm";
import "./components/refinements.css";
const Editor = lazy(() => import("./editor/Editor"));
type Page = "home" | "experiments" | "data" | "editor";
export default function App() {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [manage, setManage] = useState(false);
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
    if (
      projects.data &&
      !projects.data.some((p) => p.id === project && !p.archived)
    ) {
      setProject(projects.data.find((p) => !p.archived)?.id || 0);
      setChart(null);
      setDataset(0);
    }
  }, [projects.data, project]);
  useEffect(() => {
    localStorage.setItem("labflow-project", String(project));
  }, [project]);
  const current = projects.data?.find((p) => p.id === project);
  const navigate = async (p: Page, id?: number) => {
    if (
      dirty.current &&
      !(await confirm("当前图表尚未正式保存，离开后可从本机草稿恢复。继续？"))
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
  function importFile(file: File) {
    if (project) setPendingFile(file);
  }
  function imported(d: Dataset) {
    setPendingFile(null);
    setUploadVersion(null);
    setDataset(d.id);
    refresh();
    void navigate("data");
    setMessage(`已导入 ${d.row_count} 行，原始文件与解析规则已归档`);
    if (upload.current) upload.current.value = "";
  }
  const chooseUpload = (id: number | null = null) => {
    setUploadVersion(id);
    upload.current?.click();
  };
  return (
    <div className="app-shell home-shell refined-shell">
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
              <LabFlowMark size={29} />
              <span>LabFlow</span>
            </a>
            <span className="masthead-meta">Research data · Figure plates</span>
            <div className="global-right">
              <span className="local-badge">
                <span /> 本地工作区
              </span>
              <select
                aria-label="当前项目"
                value={project}
                onChange={async (e) => {
                  const nextProject = Number(e.target.value);
                  if (
                    dirty.current &&
                    !(await confirm(
                      "切换项目后，未正式保存的图表可从本机草稿恢复。继续？",
                    ))
                  )
                    return;
                  dirty.current = false;
                  setProject(nextProject);
                  setChart(null);
                  setDataset(0);
                  setPage("home");
                }}
              >
                <option value={0} disabled>
                  选择项目
                </option>
                {projects.data
                  ?.filter((p) => !p.archived)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <Button variant="ghost" onClick={() => setManage(true)}>
                管理项目
              </Button>
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
            <span className="nav-note">本地运行 · 数据不外传</span>
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
          <main
            className={`page-content ${page === "home" || !project ? "home-page" : ""}`}
          >
            {page === "home" || !project ? (
              <HomePage
                projects={projects.data?.filter((p) => !p.archived) || []}
                currentId={project}
                charts={charts.data || []}
                chartsLoading={charts.isPending}
                chartsError={charts.error?.message}
                busy={busy}
                onCreate={() => setModal(true)}
                onProject={(id) => {
                  setProject(id);
                  setDataset(0);
                  setChart(null);
                }}
                onPlot={() => {
                  setChart(null);
                  navigate("editor");
                }}
                onUpload={() => chooseUpload()}
                onExperiments={() => navigate("experiments")}
                onData={() => navigate("data")}
                onChart={(id) => navigate("editor", id)}
                onRetry={() => charts.refetch()}
              />
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
      {confirmDialog}
      {manage && (
        <ProjectManager
          projects={projects.data || []}
          onClose={() => setManage(false)}
          onUpdated={refresh}
        />
      )}
      {pendingFile && (
        <UploadDialog
          file={pendingFile}
          project={project}
          version={uploadVersion}
          onImported={imported}
          onClose={() => {
            setPendingFile(null);
            setUploadVersion(null);
            if (upload.current) upload.current.value = "";
          }}
        />
      )}
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
                        版本 {detail.data.version} · 内容指纹{" "}
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
                          {f.type === "number" ? "数值" : "文本"}
                          {f.missing ? ` · ${f.missing} 个空值` : ""}
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
