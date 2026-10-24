import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  lazy,
  Suspense,
} from "react";
import { flushSync } from "react-dom";
import { introSeen, markIntroSeen } from "./lib/intro";
import { useReducedMotion } from "./lib/useMotion";
import { loadEditor } from "./lib/loadEditor";
import { Link, useLocation, useNavigate, useBlocker } from "react-router-dom";
import {
  readWorkspaceMemory,
  rememberDataset,
  rememberWorkspace,
  workspaceDataset,
  workspaceTargets,
} from "./lib/workspaceMemory";
import { WorkspaceNav } from "./components/WorkspaceNav";
import {
  readWorkspaceRoute,
  workspaceUrl,
  type WorkspacePage as Page,
} from "./lib/routes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChartNoAxesCombined,
  Plus,
  Check,
  AlertCircle,
  PlugZap,
} from "lucide-react";
import { api, send, type Project, type Dataset } from "./lib/api";
import {
  createSampleProject,
  SAMPLE_PROJECT_NAME,
} from "./lib/sampleProject";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { DataPage } from "./data/DataPage";
import { HomePage } from "./components/home/HomePage";
import { WorkbenchSkeleton } from "./components/WorkbenchSkeleton";
import { LabFlowMark } from "./components/LabFlowMark";
import { UploadDialog } from "./components/UploadDialog";
import { ProjectManager } from "./components/ProjectManager";
import { ModelConnectionDialog } from "./components/ModelConnectionDialog";
import { useConfirm } from "./components/useConfirm";
import { Experiments } from "./experiments/Experiments";
const Editor = lazy(loadEditor);
const ProductIntro = lazy(() => import("./welcome/ProductIntro"));
export default function App() {
  const qc = useQueryClient();
  const location = useLocation();
  const routerGo = useNavigate();
  const go = useCallback(
    (to: string, options: { replace?: boolean; flushSync?: boolean } = {}) => routerGo(to, options),
    [routerGo],
  );
  const [memory, setMemory] = useState(() => {
    try { return readWorkspaceMemory(sessionStorage); } catch { return {}; }
  });
  const route = readWorkspaceRoute(location.pathname, location.search);
  const page = route.page;
  const chart = route.chart;
  const dataset = route.dataset;
  const [seenIntro, setSeenIntro] = useState(introSeen);
  const reducedMotion = useReducedMotion();
  // The intro is address-driven: /welcome always renders it, and a first visit to / is
  // redirected there once (replace) so the back button can return to it later.
  const showIntro = route.valid && page === "welcome";
  const needsIntroRedirect = route.valid && page === "home" && !seenIntro;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [manage, setManage] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [workspaceProject, setProject] = useState(
    () => { try { return Number(localStorage.getItem("labflow-project")) || 0; } catch { return 0; } },
  );
  const project = route.project || workspaceProject;
  const lastDataset = useRef({ project: 0, id: 0 });
  const [modal, setModal] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [sampleBusy, setSampleBusy] = useState(false),
    [message, setMessage] = useState(""),
    [uploadVersion, setUploadVersion] = useState<number | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const editorGuard = useRef<(() => boolean) | null>(null);
  const registerEditorGuard = useCallback((guard: (() => boolean) | null) => {
    editorGuard.current = guard;
  }, []);
  const scrollPositions = useRef(new Map<string, number>());
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (
      currentLocation.pathname === nextLocation.pathname &&
      currentLocation.search === nextLocation.search
    )
      return false;
    scrollPositions.current.set(
      currentLocation.pathname + currentLocation.search,
      window.scrollY,
    );
    return page === "editor" && editorGuard.current?.() === false;
  });
  const confirmingRoute = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || confirmingRoute.current) return;
    confirmingRoute.current = true;
    void confirm(
      "本机草稿暂时无法保存。可以取消并保存图表；继续离开可能丢失本次修改。",
    ).then((leave) => {
      confirmingRoute.current = false;
      if (leave) blocker.proceed?.();
      else blocker.reset?.();
    });
  }, [blocker, confirm]);
  useEffect(() => {
    setMemory((m) => rememberWorkspace(m, location.pathname, location.search));
  }, [location.pathname, location.search]);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "labflow-workspace-tabs-v1",
        JSON.stringify(memory),
      );
    } catch {}
  }, [memory]);
  useEffect(() => {
    if (needsIntroRedirect) void routerGo("/welcome", { replace: true });
  }, [needsIntroRedirect, routerGo]);
  const targets = workspaceTargets(memory, project);
  if (route.valid) targets[page] = location.pathname + location.search;
  const warmModule = (target: Page) => {
    if (target === "editor") void loadEditor().catch(() => {});
    if (!project) return;
    if (target === "data" || target === "editor") {
      void qc.prefetchQuery({
        queryKey: ["datasets", project],
        queryFn: () => api<Dataset[]>(`/projects/${project}/datasets`),
      });
      const remembered = readWorkspaceRoute(
        ...(targets.data.split("?") as [string, string]),
      );
      if (remembered.dataset)
        void qc.prefetchQuery({
          queryKey: ["data", project, remembered.dataset],
          queryFn: () =>
            api<Dataset>(`/projects/${project}/data/${remembered.dataset}`),
        });
    }
    if (target === "experiments")
      void qc.prefetchQuery({
        queryKey: ["experiments", project],
        queryFn: () => api(`/projects/${project}/experiments`),
      });
  };
  const setDataset = (id: number) => {
    lastDataset.current = { project, id };
    setMemory((m) => rememberDataset(m, project, id));
    if (page === "data")
      void go(workspaceUrl("data", project, null, id), { replace: true });
  };
  useEffect(() => {
    if (route.project) setProject(route.project);
  }, [route.project]);
  const routeFocus = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const names = {
      home: "首页",
      experiments: "实验记录",
      data: "数据管理",
      editor: "绘图工作台",
      welcome: "欢迎",
    };
    document.title = `${names[page]} · LabFlow`;
    routeFocus.current?.focus({ preventScroll: true });
    window.scrollTo({
      top:
        scrollPositions.current.get(location.pathname + location.search) || 0,
      behavior: "instant",
    });
  }, [page, project, location.pathname]);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
    enabled: !showIntro,
  });
  const datasets = useQuery({
    queryKey: ["datasets", project],
    queryFn: () => api<Dataset[]>(`/projects/${project}/datasets`),
    enabled: !!project && !showIntro,
  });
  const charts = useQuery({
    queryKey: ["charts", project],
    queryFn: () => api<any[]>(`/projects/${project}/charts`),
    enabled: !!project && !showIntro,
  });
  // 数据集必须确认属于当前项目才写进记忆：从别的项目带过来的 ?dataset=
  // 不能留在地址或记忆里，否则切换项目后会被带到下一个项目。
  useEffect(() => {
    if (page !== "data" || !dataset) return;
    if (!datasets.data?.some((d) => d.id === dataset)) return;
    setMemory((m) => rememberDataset(m, project, dataset));
    if (lastDataset.current.project !== project || lastDataset.current.id !== dataset)
      lastDataset.current = { project, id: dataset };
  }, [page, dataset, project, datasets.data]);
  useEffect(() => {
    if (
      !route.project &&
      projects.data &&
      !projects.data.some((p) => p.id === project && !p.archived)
    ) {
      setProject(projects.data.find((p) => !p.archived)?.id || 0);
    }
  }, [projects.data, project, route.project]);
  useEffect(() => {
    try { localStorage.setItem("labflow-project", String(project)); } catch { /* optional preference */ }
  }, [project]);
  const current = projects.data?.find((p) => p.id === project);
  const navigate = (p: Page, id?: number, dataId?: number) =>
    go(
      workspaceUrl(
        p,
        project,
        p === "editor" ? (id ?? chart) : null,
        dataId ??
          (lastDataset.current.project === project && lastDataset.current.id
            ? lastDataset.current.id
            : workspaceDataset(memory, project)),
      ),
    );
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["style-templates"] }),
    qc.invalidateQueries({ queryKey: ["projects"] }),
    qc.invalidateQueries({ queryKey: ["datasets", project] }),
    qc.invalidateQueries({ queryKey: ["charts", project] }),
  ]);
  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api<Project>(
        "/projects",
        send("POST", { name, description }),
      );
      if (page === "home") setProject(p.id);
      else void go(workspaceUrl("data", p.id));
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
  const sampleProject = projects.data?.find(
    (p) => !p.archived && p.name === SAMPLE_PROJECT_NAME,
  );
  const openChart = (projectId: number, chartId: number) =>
    routerGo(workspaceUrl("editor", projectId, chartId), {
      state: { fromHome: true },
    });
  async function sampleAction() {
    if (sampleBusy) return;
    setSampleBusy(true);
    try {
      if (sampleProject) {
        const charts = await api<{ id: number }[]>(
          `/projects/${sampleProject.id}/charts`,
        );
        setProject(sampleProject.id);
        if (charts[0]) openChart(sampleProject.id, charts[0].id);
        else void go(workspaceUrl("data", sampleProject.id));
        return;
      }
      const { project: created, chart } = await createSampleProject();
      refresh();
      setProject(created.id);
      openChart(created.id, chart.id);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSampleBusy(false);
    }
  }
  function importFile(file: File) {
    if (project) setPendingFile(file);
  }
  async function imported(d: Dataset) {
    // Only announce completion after the committed version and project counts
    // have reached the cache. The upload preview is not a successful import.
    qc.setQueryData(["data", project, d.id], d);
    await refresh();
    setPendingFile(null);
    setUploadVersion(null);
    lastDataset.current = { project, id: d.id };
    void navigate("data", undefined, d.id);
    setMessage(`已导入 ${d.row_count} 行，原始文件与解析规则已归档`);
    if (upload.current) upload.current.value = "";
  }
  const chooseUpload = (id: number | null = null) => {
    setUploadVersion(id);
    upload.current?.click();
  };
  if (needsIntroRedirect)
    return (
      <main aria-label="正在载入LabFlow介绍">正在载入…</main>
    );
  if (showIntro) return <Suspense fallback={<main aria-label="正在载入LabFlow介绍">正在载入…</main>}><ProductIntro seen={seenIntro} onStart={(event) => {
    markIntroSeen();
    const update = () => flushSync(() => {setSeenIntro(true); void routerGo("/");});
    if (reducedMotion || !document.startViewTransition) { update(); return; }
    const root=document.documentElement;
    root.style.setProperty("--lf-vt-x",`${event.clientX || innerWidth/2}px`);
    root.style.setProperty("--lf-vt-y",`${event.clientY || innerHeight/2}px`);
    root.dataset.vt="reveal";
    const transition=document.startViewTransition(update);
    void transition.finished.catch(()=>{}).finally(()=>{delete root.dataset.vt;root.style.removeProperty("--lf-vt-x");root.style.removeProperty("--lf-vt-y");});
  }}/></Suspense>;
  return (
    <div
      className={`app-shell ${page === "home" ? "home-shell" : "workbench-shell"}`}
      data-workspace-page={page}
    >
      <div className="main-shell">
        <header className="masthead">
          <div className="masthead-bar">
            <Link className="brand" to="/" title="LabFlow 首页">
              <LabFlowMark size={29} />
              <span>LabFlow</span>
            </Link>
            <WorkspaceNav
              page={page}
              project={project}
              urls={targets}
              onIntent={warmModule}
            />
            <div className="global-right">
              <span className="local-badge">
                <span /> 本地工作区
              </span>
              <select
                aria-label="当前项目"
                value={project}
                onChange={(e) => {
                  const nextProject = Number(e.target.value);
                  if (nextProject === project) return;
                  if (page === "home") {
                    setProject(nextProject);
                  } else void go(workspaceTargets(memory, nextProject)[page], { flushSync: true });
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
              <Link className="masthead-intro" to="/welcome">
                产品介绍
              </Link>
              <Button variant="ghost" onClick={() => setManage(true)}>
                管理项目
              </Button>
              <Button
                variant="ghost"
                className="model-connection-trigger"
                aria-label="模型设置"
                onClick={() => setConnectionOpen(true)}
              >
                <PlugZap size={15} />
                <span>模型设置</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="新建项目"
                aria-label="新建项目"
                onClick={() => setModal(true)}
              >
                <Plus size={15} />
              </Button>
            </div>
          </div>
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
          accept=".csv,.tsv,.txt,.xlsx,.json,.jsonl"
          hidden
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
        <div
          ref={routeFocus}
          tabIndex={-1}
          className="route-view"
          key={`${page}-${project}`}
          aria-label={page === "home" ? "首页内容" : "工作台内容"}
        >
          {!route.valid ? (
            <div className="empty-state">
              <h1>页面不存在</h1>
              <p>请检查网址，或返回首页选择工作台。</p>
              <Button onClick={() => go("/")}>返回首页</Button>
            </div>
          ) : projects.isPending ? (
            <div className="empty-state">
              <span className="spinner" />
              正在连接本地工作区…
            </div>
          ) : projects.isError ? (
            <div className="empty-state">
              <AlertCircle />
              <h2>无法连接本地服务</h2>
              <p>请确认 LabFlow 已经启动。你的数据保存在本机，没有丢失。</p>
              <Button onClick={() => projects.refetch()}>重新连接</Button>
            </div>
          ) : route.project && (!current || current.archived) ? (
            <div className="empty-state">
              <h1>项目不可用</h1>
              <p>这个项目不存在或已归档，请从首页重新选择。</p>
              <Button onClick={() => go("/")}>返回首页</Button>
            </div>
          ) : page !== "home" && !project ? (
            <div className="empty-state">
              <h1>创建你的第一个研究项目</h1>
              <p>工作台会将实验、数据和图表保存在项目中。</p>
              <Button onClick={() => setModal(true)}>新建项目</Button>
            </div>
          ) : page === "editor" && project ? (
            <Suspense fallback={<WorkbenchSkeleton />}>
              {datasets.isPending ? (
                <WorkbenchSkeleton />
              ) : (
                <Editor
                  key={`${project}-${chart}`}
                  project={project}
                  projectName={current?.name || ""}
                  datasets={datasets.data || []}
                  chartId={chart}
                  initialDataset={dataset}
                  onSaved={(id) => {
                    if (chart !== id) editorGuard.current = null;
                    void go(workspaceUrl("editor", project, id), {
                      replace: true,
                    });
                    refresh();
                  }}
                  onUpload={() => chooseUpload()}
                  onLeaveGuard={registerEditorGuard}
                  notify={setMessage}
                />
              )}
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
                  }}
                  onPlot={() => {
                    void navigate("editor", 0);
                  }}
                  onUpload={() => chooseUpload()}
                  onExperiments={() => navigate("experiments")}
                  onData={() => navigate("data")}
                  onChart={(id) => navigate("editor", id)}
                  onContinue={(id, pdf) => routerGo(workspaceUrl("editor",project,id), {viewTransition: !reducedMotion && !!document.startViewTransition,state:{fromHome:true,exportFormat:pdf?"pdf":undefined}})}
                  onRetry={() => charts.refetch()}
                  onModelConnection={() => setConnectionOpen(true)}
                  onSample={sampleAction}
                  sampleExists={!!sampleProject}
                  sampleBusy={sampleBusy}
                  onAssistant={(chartId, prompt) =>
                    routerGo(workspaceUrl("editor", project, chartId), {
                      state: { assistantPrompt: prompt },
                    })
                  }
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
                  onChartCreated={(id) => {
                    refresh();
                    void navigate("editor", id);
                  }}
                  onPlot={() => {
                    void navigate("editor", 0);
                  }}
                  onProcessed={(d, plot) => {
                    qc.setQueryData(["data", project, d.id], d);
                    setDataset(d.id);
                    refresh();
                    setMessage("处理结果已保存为独立数据集，源数据保持不变");
                    if (plot) void navigate("editor", 0, d.id);
                  }}
                />
              ) : page === "experiments" ? (
                <Experiments
                  key={project}
                  project={project}
                  datasets={datasets.data || []}
                  notify={setMessage}
                  onData={(id) => {
                    void navigate("data", undefined, id || 0);
                  }}
                  onGenerated={async (d) => {
                    qc.setQueryData(["data", project, d.id], d);
                    await qc.invalidateQueries({
                      queryKey: ["datasets", project],
                    });
                    setDataset(d.id);
                    refresh();
                    void navigate("editor", 0, d.id);
                  }}
                />
              ) : null}
            </main>
          )}
        </div>
      </div>
      {confirmDialog}
      {connectionOpen && (
        <ModelConnectionDialog onClose={() => setConnectionOpen(false)} />
      )}
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
