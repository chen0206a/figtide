import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartNoAxesCombined, Upload } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/useConfirm";
import { WorkbenchSkeleton } from "../components/WorkbenchSkeleton";
import { SourceProvenance } from "../experiments/SourceProvenance";
import { api, type Dataset } from "../lib/api";
import {
  chartDraftKey,
  readChartDraft,
  sameDraftContent,
} from "../lib/chartDraft";
import { DraftWriter } from "../lib/draftWriter";
import { AgentAssistant } from "./AgentAssistant";
import { defaults, historyReducer, type Config, type Series } from "./model";
import { publicationMetrics } from "./publication";
import { QuickActions } from "./QuickActions";
import { ReuseDialog } from "./ReuseDialog";
import "./styles-library.css";
import { DataLayersPanel } from "./workbench/DataLayersPanel";
import { ConflictDialog } from "./workbench/dialogs/ConflictDialog";
import { ExportDialog } from "./workbench/dialogs/ExportDialog";
import { RecoveryDialog } from "./workbench/dialogs/RecoveryDialog";
import { VersionHistoryDialog } from "./workbench/dialogs/VersionHistoryDialog";
import { EditorStatusBar } from "./workbench/EditorStatusBar";
import { EditorToolbar } from "./workbench/EditorToolbar";
import { FigureCanvas } from "./workbench/FigureCanvas";
import { fittedZoom } from "./workbench/fitZoom";
import { Inspector } from "./workbench/Inspector";
import { useChartSave } from "./workbench/useChartSave";
import { useEditorShortcuts } from "./workbench/useEditorShortcuts";
import { useFigureExport } from "./workbench/useFigureExport";
import { usePanelLayout } from "./workbench/usePanelLayout";
import { usePlotRenderer } from "./workbench/usePlotRenderer";

export type StoredChart = {
  id: number;
  revision: number;
  name: string;
  config: Config;
};
export type ChartVersion = {
  version: number;
  created_at: string;
  config: Config;
};
type Props = {
  project: number;
  projectName: string;
  datasets: Dataset[];
  chartId: number | null;
  initialDataset: number;
  onSaved: (id: number) => void;
  onUpload: () => void;
  onLeaveGuard: (guard: (() => boolean) | null) => void;
  notify: (s: string) => void;
};
export default function Editor(p: Props) {
  const existing = useQuery<StoredChart>({
    queryKey: ["chart", p.project, p.chartId],
    queryFn: () =>
      api<StoredChart>(`/projects/${p.project}/charts/${p.chartId}`),
    enabled: !!p.chartId,
    staleTime: 0,
  });
  const chartLoaded = useRef(false);
  const [selected, setSelected] = useState(0);
  const dataId =
    selected ||
    existing.data?.config.datasetVersionId ||
    p.initialDataset ||
    p.datasets[0]?.id;
  const data = useQuery({
    queryKey: ["data", p.project, dataId],
    queryFn: () => api<Dataset>(`/projects/${p.project}/data/${dataId}`),
    enabled: !!dataId,
    placeholderData: (previous) => previous,
  });
  if (
    p.chartId &&
    (existing.isPending || (!chartLoaded.current && existing.isFetching))
  )
    return <WorkbenchSkeleton />;
  if (existing.data && !existing.isFetching) chartLoaded.current = true;
  if (existing.isError)
    return (
      <div className="empty-state">
        <p>{existing.error.message}</p>
        <Button onClick={() => existing.refetch()}>重试</Button>
      </div>
    );
  if (!p.datasets.length)
    return (
      <div className="empty-state editor-empty">
        <div className="empty-art">
          <ChartNoAxesCombined size={64} />
        </div>
        <span className="page-eyebrow">从第一份数据开始</span>
        <h1>从数据，走向发现。</h1>
        <p>导入实验结果，开始构建你的第一张科研图表。</p>
        <Button onClick={p.onUpload}>
          <Upload size={16} />
          导入数据文件
        </Button>
        <small>折线 · 分组柱状 · 散点 · 热力图 · 箱线 · 小提琴</small>
      </div>
    );
  if (data.isPending) return <WorkbenchSkeleton />;
  if (data.isError)
    return (
      <div className="empty-state">
        <p>{data.error.message}</p>
        <Button onClick={() => data.refetch()}>重试</Button>
      </div>
    );
  return (
    <Workbench
      {...p}
      data={data.data!}
      original={existing.data}
      onDataset={setSelected}
    />
  );
}
function Workbench({
  project,
  projectName,
  datasets,
  chartId,
  initialDataset,
  onSaved,
  onUpload,
  onLeaveGuard,
  notify,
  data,
  original,
  onDataset,
}: Props & {
  data: Dataset;
  original?: StoredChart;
  onDataset: (id: number) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [assistantPrompt] = useState(
    () =>
      (location.state as { assistantPrompt?: string } | null)
        ?.assistantPrompt || "",
  );
  useEffect(() => {
    if (assistantPrompt)
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
  }, []);
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { widths, stage, autoFit, setAutoFit, resizer, panels, togglePanel } =
    usePanelLayout();
  const originDataset = initialDataset || datasets[0]?.id || data.id;
  const draftKey = chartDraftKey(project, chartId, originDataset);
  const [initialDraft] = useState(() => {
    const d = readChartDraft(
      localStorage,
      draftKey,
      datasets.map((v) => v.id),
      chartId
        ? []
        : [
            `labflow-draft-v1:${project}:new`,
            `labflow-draft-v1:${project}:comparison-${originDataset}`,
          ],
      originDataset,
    );
    return d && original && sameDraftContent(d, original) ? null : d;
  });
  const [recovery, setRecovery] = useState(() =>
    initialDraft && initialDraft.revision !== (original?.revision || 0)
      ? initialDraft
      : null,
  );
  const [seed] = useState(() => ({
    config: original?.config || defaults(data),
    name:
      original?.name ||
      (data.source_meta?.kind === "experiment_comparison"
        ? `${data.source_meta.metric} · 实验对比`.slice(0, 120)
        : data.source_meta?.kind === "data_processing"
          ? `${data.filename.replace(/\.csv$/i, "")} · 图表`.slice(0, 120)
          : "Untitled figure"),
  }));
  const viewKey = `labflow-editor-view:${draftKey}`;
  const [initialView] = useState<{
    panel: string;
    bottom?: string;
    seriesId?: string;
  }>(() => {
    try {
      const view = JSON.parse(sessionStorage.getItem(viewKey) || "{}");
      return {
        panel: [
          "chart",
          "appearance",
          "series",
          "axes",
          "annotations",
          "professional",
        ].includes(view.panel)
          ? view.panel
          : "chart",
        bottom: ["data", "warnings", "log", "samples", "evaluation"].includes(
          view.bottom,
        )
          ? view.bottom
          : "",
        seriesId: typeof view.seriesId === "string" ? view.seriesId : undefined,
      };
    } catch {
      return { panel: "chart", seriesId: undefined };
    }
  });
  const [draftStatus, setDraftStatus] = useState("");
  const [conflict, setConflict] = useState(false);
  const [history, dispatch] = useReducer(historyReducer, {
    past: initialDraft && !recovery ? [seed.config] : [],
    present: initialDraft && !recovery ? initialDraft.config : seed.config,
    future: [],
  });
  const c = history.present;
  const empirical = c.type === "histogram" || c.type === "ecdf";
  const evaluation =
    c.type === "roc" || c.type === "pr" || c.type === "confusion";
  const classificationLabels =
    c.type === "confusion" &&
    (c.classification?.input || "labels") === "labels";
  const output = publicationMetrics(c);
  useEffect(() => {
    const el = stage.current;
    if (!el || !autoFit) return;
    const fit = () => setZoom(fittedZoom(el, c.style.width, c.style.height));
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, [autoFit, c.style.width, c.style.height]);
  const [name, setName] = useState(
      initialDraft && !recovery ? initialDraft.name : seed.name,
    ),
    [revision, setRevision] = useState(original?.revision || 0),
    [id, setId] = useState<number | null>(chartId),
    [baseline, setBaseline] = useState(JSON.stringify(seed)),
    [saving, setSaving] = useState(false),
    [exporting, setExporting] = useState(false),
    [panel, setPanel] = useState(initialView.panel),
    [seriesId, setSeriesId] = useState(initialView.seriesId || c.series[0]?.id),
    [zoom, setZoom] = useState(85),
    [bottom, setBottom] = useState(""),
    [preview, setPreview] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [logs, setLogs] = useState<string[]>(["工作台已就绪"]);
  useEffect(() => {
    try {
      sessionStorage.setItem(viewKey, JSON.stringify({ panel, seriesId }));
    } catch {}
  }, [viewKey, panel, seriesId]);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(!!assistantPrompt);
  const [reuseTab, setReuseTab] = useState<"builtin" | "style">("style");
  const [previewPreset, setPreviewPreset] = useState("");
  const [format, setFormat] = useState<"svg" | "png" | "pdf">("svg"),
    [scale, setScale] = useState(2);
  const versions = useQuery({
    queryKey: ["versions", project, id, revision],
    queryFn: () =>
      api<ChartVersion[]>(`/projects/${project}/charts/${id}/versions`),
    enabled: !!id && historyOpen,
  });
  const serialized = useMemo(
    () => JSON.stringify({ config: c, name }),
    [c, name],
  );
  const dirty = baseline !== serialized;
  const draftWriter = useRef<DraftWriter | null>(null);
  useEffect(() => {
    const writer = new DraftWriter(
      localStorage,
      () => setDraftStatus("本机草稿已保存"),
      () => setDraftStatus("本机草稿保存失败，请正式保存图表"),
    );
    draftWriter.current = writer;
    const flush = () => writer.flush();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      writer.flush();
      draftWriter.current = null;
    };
  }, []);
  const liveDraft = useRef({
    dirty,
    draftKey,
    config: c,
    name,
    revision,
    recovery,
  });
  liveDraft.current = { dirty, draftKey, config: c, name, revision, recovery };
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    const preserve = () => {
      const latest = liveDraft.current;
      if (!latest.dirty || latest.recovery) return true;
      const value = JSON.stringify({
        config: latest.config,
        name: latest.name,
        revision: latest.revision,
        at: new Date().toISOString(),
      });
      if (draftWriter.current)
        return draftWriter.current.writeNow(latest.draftKey, value);
      try {
        localStorage.setItem(latest.draftKey, value);
        return true;
      } catch {
        return false;
      }
    };
    onLeaveGuard(preserve);
    const unloading = (e: BeforeUnloadEvent) => {
      if (!preserve()) e.preventDefault();
    };
    window.addEventListener("beforeunload", unloading);
    return () => {
      preserve();
      mounted.current = false;
      onLeaveGuard(null);
      window.removeEventListener("beforeunload", unloading);
    };
  }, []);
  useEffect(() => {
    if (recovery) return;
    if (dirty) {
      draftWriter.current?.schedule(
        draftKey,
        JSON.stringify({
          config: c,
          name,
          revision,
          at: new Date().toISOString(),
        }),
      );
      setDraftStatus("正在保存本机草稿…");
    } else {
      draftWriter.current?.clear(draftKey);
      setDraftStatus("");
    }
  }, [c, name, revision, dirty, draftKey, recovery]);
  const change = (value: Config) => dispatch({ type: "edit", value });
  const patch = (value: Partial<Config>) => change({ ...c, ...value });
  const style = (value: Partial<Config["style"]>) =>
    patch({ style: { ...c.style, ...value } });
  const series = c.series.find((s) => s.id === seriesId) || c.series[0];
  const updateSeries = (value: Partial<Series>) =>
    patch({
      series: c.series.map((s) =>
        s.id === series.id ? { ...s, ...value } : s,
      ),
    });
  const nums = data.fields
    .filter((f) => f.type === "number")
    .map((f) => f.name);
  const fields = data.fields.map((f) => f.name);
  const {
    plot,
    plotPending,
    plotError,
    graph,
    plotReady,
    rendered,
    renderConfig,
  } = usePlotRenderer({
    c,
    data,
    onDataset,
    setSeriesId,
    setPanel,
  });
  const { save } = useChartSave({
    saving,
    c,
    data,
    setSaving,
    name,
    id,
    project,
    revision,
    queryClient,
    mounted,
    draftWriter,
    draftKey,
    initialDraft,
    originDataset,
    panel,
    seriesId,
    setConflict,
    setId,
    setRevision,
    setBaseline,
    setLogs,
    notify,
    onSaved,
  });
  useEditorShortcuts({
    saving,
    c,
    data,
    setQuickOpen,
    quickOpen,
    save,
    dispatch,
  });

  const { download } = useFigureExport({
    exporting,
    plotPending,
    setExporting,
    plotReady,
    c,
    scale,
    format,
    graph,
    name,
    setLogs,
    setExportOpen,
    notify,
  });

  return (
    <div
      aria-busy={saving}
      className={`editor ${preview ? "preview-mode" : ""} ${!panels.left ? "hide-left" : ""} ${!panels.right ? "hide-right" : ""} ${agentOpen ? "assistant-open" : ""}`}
    >
      <EditorToolbar
        {...{
          saving,
          name,
          setName,
          projectName,
          id,
          dirty,
          draftStatus,
          revision,
          panels,
          togglePanel,
          agentOpen,
          setAgentOpen,
          c,
          data,
          setQuickOpen,
          setReuseTab,
          setReuseOpen,
          save,
          history,
          dispatch,
          setPreview,
          preview,
          exporting,
          plotPending,
          plotError,
          plot,
          setExportOpen,
        }}
      />
      {data.source_meta && (
        <div className="provenance-strip">
          <SourceProvenance source={data.source_meta} project={project} />
          <span>
            {data.source_meta.kind === "data_processing"
              ? "基于固定数据版本和显式处理规则 · 原始数据保持不变"
              : "指标来自固定实验快照 · 后续修改实验不会影响此图"}
          </span>
        </div>
      )}
      <div className="editor-body" inert={saving}>
        <DataLayersPanel
          {...{
            widths,
            onUpload,
            c,
            onDataset,
            patch,
            datasets,
            data,
            original,
            setPanel,
            nums,
            classificationLabels,
            setSeriesId,
            panel,
            seriesId,
            setPreviewPreset,
            setReuseTab,
            setReuseOpen,
          }}
        />
        {resizer("left")}
        <FigureCanvas
          {...{
            c,
            setAutoFit,
            setZoom,
            zoom,
            stage,
            plotPending,
            data,
            rendered,
            id,
            setPanel,
            graph,
            plotError,
            plot,
            evaluation,
            bottom,
            setBottom,
            empirical,
            renderConfig,
            project,
            logs,
          }}
        />
        {resizer("right")}
        <Inspector
          {...{
            widths,
            panel,
            setPanel,
            c,
            data,
            patch,
            empirical,
            evaluation,
            fields,
            nums,
            classificationLabels,
            series,
            updateSeries,
            style,
            setSeriesId,
            id,
            setHistoryOpen,
            confirm,
            change,
          }}
        />
        <AgentAssistant
          key={`${project}:${chartId || "draft"}:${data.id}`}
          docked
          open={agentOpen}
          initialPrompt={assistantPrompt}
          project={project}
          chartId={id}
          revision={revision}
          config={c}
          data={data}
          token={JSON.stringify({ serialized, id, revision })}
          onClose={() => setAgentOpen(false)}
          onApply={(token, config, count) => {
            if (
              token !== JSON.stringify({ serialized, id, revision }) ||
              saving
            )
              return false;
            change(config);
            setLogs((l) => [`已确认助手提案 · ${count} 项`, ...l].slice(0, 30));
            notify(`已应用 ${count} 项调整，可撤销`);
            return true;
          }}
        />
      </div>
      <EditorStatusBar {...{ data }} />
      {confirmDialog}
      <RecoveryDialog
        {...{
          recovery,
          draftKey,
          initialDraft,
          setRecovery,
          change,
          setName,
          setRevision,
        }}
      />
      <ConflictDialog {...{ conflict, setConflict, saving, save }} />
      {quickOpen && (
        <QuickActions
          project={project}
          chartId={id}
          revision={revision}
          config={c}
          data={data}
          token={JSON.stringify({ serialized, id, revision })}
          onClose={() => setQuickOpen(false)}
          onApply={(token, config, count) => {
            if (
              token !== JSON.stringify({ serialized, id, revision }) ||
              saving
            )
              return false;
            change(config);
            setLogs((l) => [`已应用快捷调整 · ${count} 项`, ...l].slice(0, 30));
            notify(`已应用 ${count} 项调整，可撤销`);
            return true;
          }}
        />
      )}
      {reuseOpen && (
        <ReuseDialog
          project={project}
          config={c}
          name={name}
          datasets={datasets}
          data={data}
          initialTab={reuseTab}
          initialPreset={previewPreset || c.style.preset}
          onClose={() => setReuseOpen(false)}
          onApply={change}
          onReused={(result) => {
            queryClient.setQueryData(["chart", project, result.id], result);
            setReuseOpen(false);
            onSaved(result.id);
            notify("已创建复用图表，源图保持不变");
          }}
        />
      )}
      <ExportDialog
        {...{
          exportOpen,
          setExportOpen,
          format,
          setFormat,
          c,
          scale,
          setScale,
          output,
          style,
          exporting,
          plotPending,
          download,
        }}
      />
      <VersionHistoryDialog
        {...{
          historyOpen,
          setHistoryOpen,
          versions,
          change,
          onDataset,
          notify,
        }}
      />
    </div>
  );
}
