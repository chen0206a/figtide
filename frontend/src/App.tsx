import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { Experiments } from "./experiments/Experiments";
import { SourceProvenance } from "./experiments/SourceProvenance";
import { ProcessingDialog } from "./processing/ProcessingDialog";
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
    qc.invalidateQueries({ queryKey: ["style-templates"] });
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
                onProcessed={(d, plot) => {
                  qc.setQueryData(["data", project, d.id], d);
                  setDataset(d.id);
                  setChart(null);
                  refresh();
                  setMessage("处理结果已保存为独立数据集，源数据保持不变");
                  if (plot) void navigate("editor");
                }}
              />
            ) : page === "experiments" ? (
              <Experiments
                key={project}
                project={project}
                datasets={datasets.data || []}
                notify={setMessage}
                onData={(id) => {
                  if (id) setDataset(id);
                  void navigate("data");
                }}
                onGenerated={async (d) => {
                  qc.setQueryData(["data", project, d.id], d);
                  await qc.invalidateQueries({
                    queryKey: ["datasets", project],
                  });
                  setDataset(d.id);
                  setChart(null);
                  refresh();
                  void navigate("editor");
                }}
              />
            ) : null}
          </main>
        )}
      </div>
      {confirmDialog}
      {manage && (
        <ProjectManager
          currentProject={project}
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
  onProcessed,
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
  onProcessed: (data: Dataset, plot: boolean) => void;
}) {
  const [processing, setProcessing] = useState<Dataset | null>(null);
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
                        onClick={() => setProcessing(detail.data)}
                      >
                        处理与统计
                      </Button>
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
                          {detail.data.source_meta?.kind === "data_processing"
                            ? "结果 CSV"
                            : "原始文件"}
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
                  <SourceProvenance
                    project={project}
                    source={detail.data.source_meta}
                  />
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
      {processing && (
        <ProcessingDialog
          project={project}
          data={processing}
          onClose={() => setProcessing(null)}
          onSaved={(d, plot) => {
            setProcessing(null);
            onProcessed(d, plot);
          }}
        />
      )}
    </>
  );
}
