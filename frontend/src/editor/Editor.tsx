import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  AudioLines,
  ChartCandlestick,
  ChartColumn,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  Filter,
  Grid2X2,
  History,
  Layers,
  Maximize2,
  MousePointer2,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  ScatterChart,
  SlidersHorizontal,
  Table2,
  Trash2,
  Type,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Plotly from "plotly.js-cartesian-dist-min";
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/useConfirm";
import { WorkbenchSkeleton } from "../components/WorkbenchSkeleton";
import { SourceProvenance } from "../experiments/SourceProvenance";
import { ApiError, api, send, type Dataset } from "../lib/api";
import {
  chartDraftKey,
  readChartDraft,
  sameDraftContent,
} from "../lib/chartDraft";
import { downloadBlob } from "../lib/download";
import { DraftWriter } from "../lib/draftWriter";
import { AgentAssistant } from "./AgentAssistant";
import { ClassificationResults } from "./ClassificationResults";
import { BandPanel } from "./EvaluationPanel";
import { EvaluationResults } from "./EvaluationResults";
import { layoutPatch } from "./layoutPatch";
import {
  defaultClassification,
  defaultEmpirical,
  defaultEvaluation,
  defaults,
  historyReducer,
  makeSeries,
  type Config,
  type Series,
} from "./model";
import { buildPlot } from "./plot";
import { ProfessionalPanel } from "./ProfessionalPanel";
import { physicalSvg, pngDensity, publicationMetrics } from "./publication";
import { QuickActions } from "./QuickActions";
import { ReuseDialog } from "./ReuseDialog";
import { presetThumbnail, stylePresets } from "./stylePresets";
import "./styles-library.css";
import { StyleThumbnail } from "./StyleThumbnail";
import {
  NumberInput,
  Section,
  Select,
  Text,
  Toggle,
} from "./workbench/controls";
import { ConflictDialog } from "./workbench/dialogs/ConflictDialog";
import { ExportDialog } from "./workbench/dialogs/ExportDialog";
import { RecoveryDialog } from "./workbench/dialogs/RecoveryDialog";
import { VersionHistoryDialog } from "./workbench/dialogs/VersionHistoryDialog";

const fittedZoom = (stage: HTMLElement, width: number, height: number) =>
  Math.max(
    5,
    Math.min(
      100,
      Math.floor(
        Math.min(
          (stage.clientWidth - 64) / width,
          (stage.clientHeight - 88) / height,
        ) * 100,
      ),
    ),
  );
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
  const [widths, setWidths] = useState(() => {
    try {
      const w = JSON.parse(
        localStorage.getItem("labflow-panel-widths") || "{}",
      );
      return {
        left: Math.min(340, Math.max(180, Number(w.left) || 236)),
        right: Math.min(420, Math.max(240, Number(w.right) || 292)),
      };
    } catch {
      return { left: 236, right: 292 };
    }
  });
  const stage = useRef<HTMLDivElement>(null);
  const [autoFit, setAutoFit] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("labflow-panel-widths", JSON.stringify(widths));
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [widths]);
  function resizer(side: "left" | "right") {
    return (
      <div
        className={`panel-resize resize-${side}`}
        role="separator"
        aria-label={side === "left" ? "调整数据栏宽度" : "调整属性栏宽度"}
        aria-orientation="vertical"
        aria-valuenow={widths[side]}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const step = e.key === "ArrowRight" ? 10 : -10;
            setWidths((w) => ({
              ...w,
              [side]: Math.min(
                side === "left" ? 340 : 420,
                Math.max(side === "left" ? 180 : 240, w[side] + step),
              ),
            }));
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.dataset.x = String(e.clientX);
          e.currentTarget.dataset.width = String(widths[side]);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            const delta = e.clientX - Number(e.currentTarget.dataset.x);
            const width =
              Number(e.currentTarget.dataset.width) +
              (side === "left" ? delta : -delta);
            setWidths((w) => ({
              ...w,
              [side]: Math.min(
                side === "left" ? 340 : 420,
                Math.max(side === "left" ? 180 : 240, width),
              ),
            }));
          }
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      />
    );
  }
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
  const [panels, setPanels] = useState<{ left: boolean; right: boolean }>(
    () => {
      try {
        return (
          JSON.parse(localStorage.getItem("labflow-panels") || "null") || {
            left: true,
            right: true,
          }
        );
      } catch {
        return { left: true, right: true };
      }
    },
  );
  function togglePanel(side: "left" | "right") {
    const next = { ...panels, [side]: !panels[side] };
    setPanels(next);
    try {
      localStorage.setItem("labflow-panels", JSON.stringify(next));
    } catch {}
  }
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
  const graph = useRef<any>(null);
  const drawn = useRef<{
    signature: string;
    layout: Record<string, any>;
    data: Dataset;
  } | null>(null);
  const [rendered, setRendered] = useState<{
    config: Config;
    data: Dataset;
  } | null>(null);
  const [plotError, setPlotError] = useState("");
  const [reuseOpen, setReuseOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(!!assistantPrompt);
  const [reuseTab, setReuseTab] = useState<"builtin" | "style">("style");
  const [previewPreset, setPreviewPreset] = useState("");
  const plotReady = useRef<Promise<any>>(Promise.resolve());
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
  const deferred = useDeferredValue(c);
  const renderConfig = deferred.datasetVersionId === data.id ? deferred : c;
  const plot = useMemo(
    () => buildPlot(renderConfig, data),
    [renderConfig, data],
  );
  const plotPending =
    renderConfig !== c ||
    rendered?.config !== renderConfig ||
    rendered?.data !== data;
  useEffect(() => {
    if (c.datasetVersionId !== data.id) onDataset(c.datasetVersionId);
  }, [c.datasetVersionId, data.id]);
  useEffect(() => {
    const el = graph.current;
    if (!el) return;
    let active = true;
    plotReady.current = plotReady.current
      .catch(() => {})
      .then(async () => {
        if (!active) return;
        if (renderConfig.style.font === "Noto Sans SC")
          await document.fonts.load(
            `${renderConfig.style.bold ? 700 : 400} ${renderConfig.style.fontSize}px "Noto Sans SC"`,
          );
        if (!active) return;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (!active) return;
        const signature = JSON.stringify(plot.traces),
          snapshot = structuredClone(plot.layout);
        const previous = drawn.current;
        const update =
          previous?.data === data && previous.signature === signature
            ? (() => {
                const changes = layoutPatch(previous.layout, snapshot);
                return Object.keys(changes).length
                  ? Plotly.relayout(el, changes)
                  : Promise.resolve(el);
              })()
            : Plotly.react(el, plot.traces, plot.layout, {
                displayModeBar: false,
                responsive: false,
                editable: false,
                scrollZoom: false,
                doubleClick: false,
              });
        return update.then(() => {
          drawn.current = { signature, layout: snapshot, data: data };
          if (!active) return;
          setRendered({ config: renderConfig, data: data });
          setPlotError("");
          el.removeAllListeners?.("plotly_click");
          el.removeAllListeners?.("plotly_legendclick");
          el.on("plotly_legendclick", (ev: any) => {
            const sid = ev.data?.[ev.curveNumber]?.customdata?.[0];
            if (sid) {
              setSeriesId(sid);
              setPanel("series");
            }
            return false;
          });
          el.on("plotly_click", (ev: any) => {
            const sid = ev.points?.[0]?.customdata;
            if (sid) {
              setSeriesId(sid);
              setPanel("series");
            }
          });
        });
      })
      .catch((e: Error) => {
        if (active) setPlotError(e.message);
      });
    return () => {
      active = false;
    };
  }, [plot, renderConfig, data]);
  useEffect(
    () => () => {
      if (graph.current) Plotly.purge(graph.current);
    },
    [],
  );
  async function save(asCopy = false) {
    if (saving || c.datasetVersionId !== data.id) return;
    setSaving(true);
    const snapshot = c,
      saveName = asCopy ? `${name.slice(0, 115)} · 副本` : name;
    const saveId = asCopy ? null : id;
    try {
      const result = await api(
        `/projects/${project}/charts${saveId ? "/" + saveId : ""}`,
        send(saveId ? "PUT" : "POST", {
          name: saveName,
          revision,
          config: snapshot,
        }),
      );
      queryClient.setQueryData(["chart", project, result.id], result);
      if (!mounted.current) {
        void queryClient.invalidateQueries({ queryKey: ["charts", project] });
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        return;
      }
      if (!asCopy)
        try {
          draftWriter.current?.clear(draftKey);
          if (initialDraft?.storageKey && initialDraft.storageKey !== draftKey)
            localStorage.removeItem(initialDraft.storageKey);
        } catch {}
      try {
        sessionStorage.setItem(
          `labflow-editor-view:${chartDraftKey(project, result.id, originDataset)}`,
          JSON.stringify({ panel, seriesId }),
        );
      } catch {}
      setConflict(false);
      setId(result.id);
      setRevision(result.revision);
      setBaseline(JSON.stringify({ config: snapshot, name: saveName }));
      setLogs((l) => [`已保存版本 v${result.revision}`, ...l].slice(0, 30));
      notify(`图表已保存 · v${result.revision}`);
      onSaved(result.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (
          !saving &&
          !document.querySelector('[role="dialog"]') &&
          c.datasetVersionId === data.id
        )
          setQuickOpen(true);
        return;
      }
      if (quickOpen || (e.target as HTMLElement).closest(".agent-dock")) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")
          e.preventDefault();
        return;
      }
      if (saving) {
        if (
          (e.ctrlKey || e.metaKey) &&
          ["s", "z"].includes(e.key.toLowerCase())
        )
          e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  async function download() {
    if (exporting || plotPending) return;
    setExporting(true);
    try {
      await plotReady.current;
      const metrics = publicationMetrics(c, scale);
      if (
        format === "png" &&
        (metrics.pixelWidth * metrics.pixelHeight > 40000000 ||
          Math.max(metrics.pixelWidth, metrics.pixelHeight) > 12000)
      )
        throw new Error(
          "输出超过 4000 万像素或单边 12000 px，请降低 DPI / 倍率",
        );
      let url = await Plotly.toImage(graph.current, {
        format: format === "pdf" ? "svg" : format,
        width: c.style.width,
        height: c.style.height,
        scale: format === "png" ? metrics.scale : 1,
      });
      if (format === "svg") url = physicalSvg(url, c);
      if (format === "png" && metrics.enabled)
        url = pngDensity(url, metrics.effectiveDpi);
      const filename =
        (name.replace(/[^\p{L}\p{N}_-]/gu, "_") || "figure") + "." + format;
      if (format === "pdf") {
        const { vectorPdf } = await import("./pdf");
        downloadBlob(await vectorPdf(url, c), filename);
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
      }
      setLogs((l) =>
        [
          `导出 ${format.toUpperCase()} · ${c.style.width} × ${c.style.height}`,
          ...l,
        ].slice(0, 30),
      );
      setExportOpen(false);
      notify(`${format.toUpperCase()} 已导出`);
    } catch (e) {
      setExportOpen(true);
      notify("导出失败：" + (e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div
      aria-busy={saving}
      className={`editor ${preview ? "preview-mode" : ""} ${!panels.left ? "hide-left" : ""} ${!panels.right ? "hide-right" : ""} ${agentOpen ? "assistant-open" : ""}`}
    >
      <div className="editor-toolbar">
        <div className="figure-info">
          <span className="figure-icon">
            <ChartNoAxesCombined size={19} />
          </span>
          <div>
            <input
              aria-label="图表名称"
              disabled={saving}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
            <small>
              {projectName}
              <ChevronRight size={10} /> 图版{" "}
              {id ? String(id).padStart(2, "0") : "草稿"}
            </small>
          </div>
          <span className={`save-state ${dirty ? "unsaved" : ""}`}>
            {saving ? (
              "保存中…"
            ) : dirty ? (
              draftStatus || "正在保留草稿…"
            ) : id ? (
              <>
                <Check size={12} /> 已保存 v{revision}
              </>
            ) : (
              "新图表 · 可以直接编辑"
            )}
          </span>
        </div>
        <div className="toolbar-actions">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={panels.left}
            onClick={() => togglePanel("left")}
          >
            数据栏
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={panels.right && !agentOpen}
            onClick={() => {
              if (agentOpen) {
                setAgentOpen(false);
                if (!panels.right) togglePanel("right");
              } else togglePanel("right");
            }}
          >
            属性栏
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="快捷操作 Ctrl+K"
            disabled={saving || c.datasetVersionId !== data.id}
            onClick={() => setQuickOpen(true)}
          >
            快捷操作
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || c.datasetVersionId !== data.id}
            aria-expanded={agentOpen}
            aria-controls="figure-assistant"
            onClick={() => setAgentOpen((value) => !value)}
          >
            绘图助手
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setReuseTab("style");
              setReuseOpen(true);
            }}
            disabled={saving || c.datasetVersionId !== data.id}
          >
            复用
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || !name.trim() || c.datasetVersionId !== data.id}
            onClick={() => save(true)}
          >
            另存副本
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="撤销 Ctrl+Z"
            aria-label="撤销"
            disabled={saving || !history.past.length}
            onClick={() => dispatch({ type: "undo" })}
          >
            <Undo2 size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="重做 Ctrl+Shift+Z"
            aria-label="重做"
            disabled={saving || !history.future.length}
            onClick={() => dispatch({ type: "redo" })}
          >
            <Redo2 size={17} />
          </Button>
          <span className="toolbar-divider" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreview(!preview)}
          >
            <Eye size={15} />
            {preview ? "退出预览" : "预览"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              saving ||
              !name.trim() ||
              (!!id && !dirty) ||
              c.datasetVersionId !== data.id
            }
            onClick={() => save()}
          >
            <Save size={14} />
            保存
          </Button>
          <Button
            size="sm"
            disabled={
              exporting ||
              plotPending ||
              !!plotError ||
              !plot.traces.length ||
              c.datasetVersionId !== data.id
            }
            onClick={() => setExportOpen(true)}
          >
            <Download size={14} />
            {exporting ? "导出中…" : "导出"}
            <ChevronDown size={12} />
          </Button>
        </div>
      </div>
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
        <aside className="editor-left" style={{ width: widths.left }}>
          <div className="panel-title">
            <Database size={14} />
            数据与图层
          </div>
          <section className="left-section">
            <div className="section-label">
              数据集{" "}
              <button aria-label="上传数据" title="上传数据" onClick={onUpload}>
                <Plus size={14} />
              </button>
            </div>
            <select
              aria-label="绘图数据集"
              value={c.datasetVersionId}
              onChange={(e) => {
                const n = Number(e.target.value);
                onDataset(n);
                patch({ datasetVersionId: n });
              }}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename} · v{d.version}
                </option>
              ))}
            </select>
            <div className="dataset-meta">
              <span className="green-dot" />
              {data.row_count} 行 <span>·</span> {data.fields.length} 字段{" "}
              <span className="version-tag">v{data.version}</span>
            </div>
            <details className="field-disclosure">
              <summary>
                查看字段 <span>{data.fields.length}</span>
              </summary>
              <div className="field-list">
                {data.fields.map((f) => (
                  <div key={f.name}>
                    <span
                      className={
                        f.type === "number" ? "number-symbol" : "string-symbol"
                      }
                    >
                      {f.type === "number" ? "#" : "Aa"}
                    </span>
                    <span>{f.name}</span>
                    <small>{f.type === "number" ? "数值" : "文本"}</small>
                  </div>
                ))}
              </div>
            </details>
          </section>
          <details className="left-section chart-picker" open={!original}>
            <summary>
              图表类型{" "}
              <span>
                {
                  {
                    line: "折线图",
                    bar: "柱状图",
                    scatter: "散点图",
                    heatmap: "热力图",
                    box: "箱线图",
                    violin: "小提琴图",
                    histogram: "直方图",
                    ecdf: "ECDF",
                    roc: "ROC",
                    pr: "PR",
                    confusion: "混淆矩阵",
                  }[c.type]
                }
              </span>
              <ChevronDown size={13} />
            </summary>
            <div className="chart-type-grid">
              {(
                [
                  ["line", ChartNoAxesCombined, "折线图"],
                  ["bar", ChartColumn, "柱状图"],
                  ["scatter", ScatterChart, "散点图"],
                  ["heatmap", Grid2X2, "热力图"],
                  ["box", ChartCandlestick, "箱线图"],
                  ["violin", AudioLines, "小提琴图"],
                  ["histogram", ChartColumn, "直方图"],
                  ["ecdf", ChartNoAxesCombined, "ECDF"],
                  ["roc", ChartNoAxesCombined, "ROC"],
                  ["pr", ChartNoAxesCombined, "PR"],
                  ["confusion", Grid2X2, "混淆矩阵"],
                ] as const
              ).map(([type, Icon, label]) => (
                <button
                  key={type}
                  className={c.type === type ? "active" : ""}
                  onClick={() => {
                    patch({
                      type,
                      ...(type === "confusion" && !c.classification
                        ? {
                            classification: {
                              ...defaultClassification,
                              label: c.evaluation?.label || "",
                              positive: c.evaluation?.positive || "1",
                              threshold: c.evaluation?.threshold ?? 0.5,
                            },
                          }
                        : {}),
                    });
                    setPanel(
                      type === "box" ||
                        type === "violin" ||
                        type === "histogram" ||
                        type === "ecdf" ||
                        type === "roc" ||
                        type === "pr" ||
                        type === "confusion"
                        ? "professional"
                        : "chart",
                    );
                  }}
                >
                  <Icon size={22} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </details>
          <section className="left-section">
            <div className="section-label">
              图层 / 序列{" "}
              <button
                aria-label="添加序列"
                title="添加序列"
                disabled={
                  c.series.length >= 20 ||
                  (!nums.length && !classificationLabels)
                }
                onClick={() => {
                  const s = makeSeries(
                    nums.find(
                      (n) => !c.series.some((s) => s.y === n) && n !== c.x,
                    ) ||
                      nums[0] ||
                      "",
                    c.series.length,
                  );
                  patch({ series: [...c.series, s] });
                  setSeriesId(s.id);
                  setPanel("series");
                }}
              >
                <Plus size={14} />
              </button>
            </div>
            <button
              className={`layer-item ${panel === "chart" ? "active" : ""}`}
              onClick={() => setPanel("chart")}
            >
              <ChartNoAxesCombined size={15} />
              <span>图表画布</span>
            </button>
            {c.series.map((s) => (
              <button
                className={`layer-item ${panel === "series" && s.id === seriesId ? "active" : ""}`}
                key={s.id}
                onClick={() => {
                  setSeriesId(s.id);
                  setPanel("series");
                }}
              >
                <span className="series-line" style={{ background: s.color }} />
                <span>{s.name}</span>
                {!s.visible && <small>隐藏</small>}
                <ChevronRight size={12} />
              </button>
            ))}
          </section>
          <details className="left-section presets preset-disclosure">
            <summary>
              <Palette size={13} />
              图表样式
            </summary>
            <div className="sidebar-style-grid">
              {stylePresets.map(({ key, name }) => (
                <button
                  className={
                    c.style.preset === key ? "preset active" : "preset"
                  }
                  aria-label={`预览内置样式 ${key}`}
                  onClick={() => {
                    setPreviewPreset(key);
                    setReuseTab("builtin");
                    setReuseOpen(true);
                  }}
                  key={key}
                >
                  <div>
                    <span>{name}</span>
                    {c.style.preset === key && <Check size={12} />}
                  </div>
                  <StyleThumbnail profile={presetThumbnail(key)} />
                </button>
              ))}
            </div>
            <p className="tiny-note">点击预览，确认后应用。可随时撤销。</p>
            <Button
              variant="outline"
              onClick={() => {
                setReuseTab("style");
                setReuseOpen(true);
              }}
            >
              管理个人模板
            </Button>
          </details>
          <div className="left-foot">
            <span className="green-dot" />
            原始实验数据始终保持不变
          </div>
        </aside>
        {resizer("left")}
        <section className="canvas-column">
          <div className="canvas-toolbar">
            <span>
              <MousePointer2 size={13} />
              选择工具
            </span>
            <div>
              <span>
                {c.style.width} × {c.style.height} px
              </span>
              <span className="toolbar-divider" />
              <Button
                variant="ghost"
                size="icon"
                aria-label="缩小"
                onClick={() => {
                  setAutoFit(false);
                  setZoom(Math.max(5, zoom - 10));
                }}
              >
                <ZoomOut size={14} />
              </Button>
              <button
                className="zoom-value"
                onClick={() => {
                  setAutoFit(false);
                  setZoom(100);
                }}
                title="重置为 100%"
              >
                {zoom}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="放大"
                onClick={() => {
                  setAutoFit(false);
                  setZoom(Math.min(150, zoom + 10));
                }}
              >
                <ZoomIn size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="适合窗口"
                aria-label="适合窗口"
                onClick={() => {
                  setAutoFit(true);
                  const el = stage.current!;
                  setZoom(fittedZoom(el, c.style.width, c.style.height));
                }}
              >
                <Maximize2 size={14} />
              </Button>
            </div>
          </div>
          <div ref={stage} className="canvas-stage" aria-busy={plotPending}>
            <div
              className="paper-group"
              style={{
                visibility:
                  c.datasetVersionId === data.id &&
                  rendered?.data.id === data.id
                    ? "visible"
                    : "hidden",
              }}
            >
              <div className="paper-caption">
                <span>FIGURE {id ? String(id).padStart(2, "0") : "01"}</span>
                <span>
                  {c.style.preset} · {c.type.toUpperCase()}
                </span>
              </div>
              <div
                className="paper-wrap"
                style={{
                  width: (c.style.width * zoom) / 100,
                  height: (c.style.height * zoom) / 100,
                }}
              >
                <div
                  className="paper"
                  style={{
                    width: c.style.width,
                    height: c.style.height,
                    transform: `scale(${zoom / 100})`,
                  }}
                  onClick={(e) => {
                    const cls =
                      (e.target as Element).getAttribute("class") || "";
                    if (/\b[xy]\d*title\b/.test(cls)) setPanel("axes");
                    if (cls.includes("gtitle")) setPanel("chart");
                  }}
                >
                  <div data-testid="plot" ref={graph} />
                </div>
              </div>
              <div className="paper-footnote">
                <span>
                  <Layers size={11} />
                  {c.type === "heatmap"
                    ? 1
                    : c.series.filter((s) => s.visible).length}{" "}
                  个图层
                </span>
                <span>点击曲线选择序列 · 样式即时更新</span>
              </div>
            </div>
            {(c.datasetVersionId !== data.id || !rendered) && !plotError && (
              <div className="canvas-loading">正在读取所选数据版本…</div>
            )}
            {plotError && (
              <div className="canvas-error" role="alert">
                绘图失败：{plotError}
              </div>
            )}
            {!plotError &&
              !plot.traces.length &&
              c.datasetVersionId === data.id && (
                <div className="canvas-empty-plot" role="status">
                  <strong>当前条件下没有可绘制的图形</strong>
                  <p>
                    {plot.warnings.at(-1) ||
                      "请检查字段映射、过滤条件和序列可见性。"}
                  </p>
                </div>
              )}
          </div>
          <div className="bottom-tabs">
            {evaluation && (
              <button
                className={bottom === "evaluation" ? "active" : ""}
                onClick={() =>
                  setBottom(bottom === "evaluation" ? "" : "evaluation")
                }
              >
                <ChartNoAxesCombined size={14} />
                模型评估
                <span>
                  {c.type === "confusion"
                    ? plot.classificationReports.length
                    : plot.metrics.length}
                </span>
              </button>
            )}
            {(c.type === "box" || c.type === "violin" || empirical) && (
              <button
                className={bottom === "samples" ? "active" : ""}
                onClick={() => setBottom(bottom === "samples" ? "" : "samples")}
              >
                <ChartCandlestick size={14} />
                样本检查<span>{plot.summaries.length}</span>
              </button>
            )}
            <button
              className={bottom === "data" ? "active" : ""}
              onClick={() => setBottom(bottom === "data" ? "" : "data")}
            >
              <Table2 size={14} />
              数据预览<span>{plot.shownRows}</span>
            </button>
            <button
              className={bottom === "warnings" ? "active" : ""}
              onClick={() => setBottom(bottom === "warnings" ? "" : "warnings")}
            >
              <AlertTriangle size={14} />
              告警
              <span className={plot.warnings.length ? "warning-count" : ""}>
                {plot.warnings.length}
              </span>
            </button>
            <button
              className={bottom === "log" ? "active" : ""}
              onClick={() => setBottom(bottom === "log" ? "" : "log")}
            >
              <History size={14} />
              操作记录
            </button>
            <span className="bottom-status">
              <span className="green-dot" />
              {plotPending ? "正在更新预览…" : "实时画布"}
            </span>
          </div>
          {bottom && (
            <div
              className="bottom-content"
              aria-busy={plotPending}
              inert={plotPending}
            >
              {bottom === "evaluation" ? (
                c.type === "confusion" ? (
                  <ClassificationResults
                    reports={plot.classificationReports}
                    config={renderConfig}
                    project={project}
                  />
                ) : (
                  <EvaluationResults
                    metrics={plot.metrics}
                    config={renderConfig}
                  />
                )
              ) : bottom === "samples" ? (
                <>
                  <p className="sample-summary-note">
                    按当前过滤、分箱范围与对数轴统计；缺失与排除分开列出，均不作为零。汇总数据不能替代逐次观测。
                  </p>
                  <table className="sample-summary">
                    <thead>
                      <tr>
                        {[
                          "子图",
                          "序列",
                          "类别",
                          "有效 n",
                          "缺失",
                          "排除",
                          "最小值",
                          "最大值",
                        ].map((title) => (
                          <th key={title}>{title}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plot.summaries.map((row, i) => (
                        <tr key={i}>
                          <td>{row.panel || "单图"}</td>
                          <td>{row.series}</td>
                          <td>{row.category}</td>
                          <td>{row.n}</td>
                          <td>{row.missing}</td>
                          <td>{row.excluded}</td>
                          <td>{row.min ?? "—"}</td>
                          <td>{row.max ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : bottom === "data" ? (
                <DataTable data={data} />
              ) : bottom === "warnings" ? (
                plot.warnings.length ? (
                  plot.warnings.map((w) => (
                    <div className="warning" key={w}>
                      {w}
                    </div>
                  ))
                ) : (
                  <p className="subtle">
                    没有数据告警。缺失值按断点展示，不自动插值。
                  </p>
                )
              ) : (
                logs.map((l, i) => (
                  <p className="log-line" key={i}>
                    <Check size={12} />
                    {l}
                  </p>
                ))
              )}
            </div>
          )}
        </section>
        {resizer("right")}
        <aside className="editor-right" style={{ width: widths.right }}>
          <div className="panel-title">
            <SlidersHorizontal size={14} />
            属性
          </div>
          <div className="inspector-tabs">
            {[
              ["chart", "图表"],
              ["appearance", "外观"],
              ["series", "序列"],
              ["axes", "坐标轴"],
              ["annotations", "注释"],
              ["professional", "专业"],
            ].map(([key, label]) => (
              <button
                className={panel === key ? "active" : ""}
                aria-pressed={panel === key}
                key={key}
                onClick={() => setPanel(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inspector-scroll">
            {panel === "professional" && (
              <ProfessionalPanel config={c} data={data} onChange={patch} />
            )}
            {panel === "chart" && (
              <>
                <Section title="字段映射" icon={<Database size={13} />}>
                  {!empirical && !evaluation && (
                    <Select
                      label="X 轴字段"
                      value={c.x}
                      options={fields}
                      onChange={(x) => patch({ x })}
                    />
                  )}
                  {c.type === "heatmap" ? (
                    <>
                      <Select
                        label="Y 分类字段"
                        value={c.heatY}
                        options={fields}
                        onChange={(heatY) => patch({ heatY })}
                      />
                      <Select
                        label="Z 数值字段"
                        value={c.heatZ}
                        options={nums}
                        onChange={(heatZ) => patch({ heatZ })}
                      />
                    </>
                  ) : (
                    <>
                      <Select
                        label={
                          classificationLabels
                            ? "预测标签列 · 当前序列"
                            : evaluation
                              ? "预测分数列 · 当前序列"
                              : "Y 轴字段 · 当前序列"
                        }
                        value={
                          classificationLabels
                            ? series.prediction || ""
                            : series.y
                        }
                        options={classificationLabels ? ["", ...fields] : nums}
                        onChange={(y) =>
                          updateSeries(
                            classificationLabels
                              ? { prediction: y, name: y }
                              : { y, name: y },
                          )
                        }
                      />
                      <Select
                        label="按类别分组"
                        value={c.group}
                        options={["", ...fields]}
                        empty="不分组"
                        onChange={(group) => patch({ group })}
                      />
                    </>
                  )}
                </Section>
              </>
            )}
            {panel === "appearance" && (
              <>
                <Section title="标题与字体" icon={<Type size={13} />}>
                  <Text
                    label="图表标题"
                    value={c.style.title}
                    onChange={(title) => style({ title })}
                  />
                  <Select
                    label="字体"
                    value={c.style.font}
                    options={[
                      "Arial",
                      "Helvetica",
                      "Times New Roman",
                      "Georgia",
                      "Courier New",
                      "Noto Sans SC",
                    ]}
                    onChange={(font) => style({ font })}
                  />
                  <div className="form-grid">
                    <fieldset
                      className="axis-numeric-controls"
                      disabled={!!c.publication?.enabled}
                    >
                      <NumberInput
                        label="字号"
                        value={c.style.fontSize}
                        min={8}
                        max={40}
                        onChange={(fontSize) => style({ fontSize })}
                      />
                    </fieldset>
                    <label>
                      字重
                      <select
                        value={c.style.bold ? "bold" : "normal"}
                        onChange={(e) =>
                          style({ bold: e.target.value === "bold" })
                        }
                      >
                        <option value="normal">Regular</option>
                        <option value="bold">Bold</option>
                      </select>
                    </label>
                  </div>
                </Section>
                <Section title="画布设置" icon={<Maximize2 size={13} />}>
                  <div className="form-grid">
                    <NumberInput
                      label="宽度 / px"
                      value={c.style.width}
                      min={250}
                      max={2400}
                      onChange={(width) => style({ width })}
                    />
                    <NumberInput
                      label="高度 / px"
                      value={c.style.height}
                      min={250}
                      max={2400}
                      onChange={(height) => style({ height })}
                    />
                  </div>
                  <label>
                    画布背景
                    <div className="color-input">
                      <input
                        aria-label="画布背景"
                        type="color"
                        value={c.style.background}
                        onChange={(e) => style({ background: e.target.value })}
                      />
                      <span>{c.style.background.toUpperCase()}</span>
                    </div>
                  </label>
                  <div className="form-grid">
                    {(["top", "bottom", "left", "right"] as const).map((k) => (
                      <NumberInput
                        key={k}
                        label={
                          {
                            top: "上边距",
                            bottom: "下边距",
                            left: "左边距",
                            right: "右边距",
                          }[k]
                        }
                        value={c.style[k]}
                        min={0}
                        max={300}
                        onChange={(v) => style({ [k]: v })}
                      />
                    ))}
                  </div>
                </Section>
                {c.type !== "confusion" && (
                  <Section title="图例">
                    <Toggle
                      label="显示图例"
                      value={c.legend.show}
                      onChange={(show) =>
                        patch({ legend: { ...c.legend, show } })
                      }
                    />
                    <div className="form-grid">
                      <Select
                        label="位置"
                        value={c.legend.position}
                        options={["top", "bottom", "right"]}
                        onChange={(position) =>
                          patch({ legend: { ...c.legend, position } })
                        }
                      />
                      <Select
                        label="方向"
                        value={c.legend.orientation}
                        options={["h", "v"]}
                        onChange={(v) =>
                          patch({
                            legend: {
                              ...c.legend,
                              orientation: v as "h" | "v",
                            },
                          })
                        }
                      />
                    </div>
                  </Section>
                )}
              </>
            )}
            {panel === "chart" && (
              <>
                <Section title="数据过滤 · 可复现" icon={<Filter size={13} />}>
                  <p className="tiny-note">仅影响展示，不覆盖原始数据。</p>
                  {c.transforms.map((t, i) => (
                    <div className="transform" key={i}>
                      <Select
                        label="过滤字段"
                        value={t.field}
                        options={fields}
                        onChange={(field) =>
                          patch({
                            transforms: c.transforms.map((v, j) =>
                              j === i ? { ...v, field } : v,
                            ),
                          })
                        }
                      />
                      <Select
                        label="条件"
                        value={t.operator}
                        options={["eq", "gte", "lte"]}
                        onChange={(operator) =>
                          patch({
                            transforms: c.transforms.map((v, j) =>
                              j === i ? { ...v, operator: operator as any } : v,
                            ),
                          })
                        }
                      />
                      <Text
                        label="过滤值"
                        value={t.value}
                        onChange={(value) =>
                          patch({
                            transforms: c.transforms.map((v, j) =>
                              j === i ? { ...v, value } : v,
                            ),
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patch({
                            transforms: c.transforms.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <Trash2 size={13} />
                        删除条件
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      patch({
                        transforms: [
                          ...c.transforms,
                          {
                            op: "filter",
                            field: c.x,
                            operator: "eq",
                            value: "",
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={13} />
                    添加过滤
                  </Button>
                </Section>
              </>
            )}
            {panel === "series" && series && (
              <>
                <Section title="序列映射">
                  <Select
                    label="当前序列"
                    value={series.id}
                    options={c.series.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                    onChange={setSeriesId}
                  />
                  <Text
                    label="序列名称"
                    value={series.name}
                    onChange={(name) => updateSeries({ name })}
                  />
                  <Select
                    label={
                      classificationLabels
                        ? "预测标签列"
                        : evaluation
                          ? "预测分数列"
                          : "Y 数值字段"
                    }
                    value={
                      classificationLabels ? series.prediction || "" : series.y
                    }
                    options={classificationLabels ? ["", ...fields] : nums}
                    onChange={(y) =>
                      updateSeries(
                        classificationLabels ? { prediction: y } : { y },
                      )
                    }
                  />
                  <Toggle
                    label="显示该序列"
                    value={series.visible}
                    onChange={(visible) => updateSeries({ visible })}
                  />
                </Section>
                {c.type !== "confusion" && (
                  <Section title="外观">
                    <label>
                      序列颜色
                      <div className="color-input">
                        <input
                          aria-label="序列颜色"
                          type="color"
                          value={series.color}
                          onChange={(e) =>
                            updateSeries({ color: e.target.value })
                          }
                        />
                        <span>{series.color.toUpperCase()}</span>
                      </div>
                    </label>
                    <label>
                      透明度{" "}
                      <span className="float-right">
                        {Math.round(series.opacity * 100)}%
                      </span>
                      <input
                        aria-label="透明度"
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={series.opacity}
                        onChange={(e) =>
                          updateSeries({ opacity: Number(e.target.value) })
                        }
                      />
                    </label>
                    <div className="form-grid">
                      <NumberInput
                        label="线宽"
                        value={series.width}
                        min={0.5}
                        max={10}
                        step={0.5}
                        onChange={(width) => updateSeries({ width })}
                      />
                      {c.type !== "box" && c.type !== "violin" && (
                        <Select
                          label="线型"
                          value={series.dash}
                          options={["solid", "dash", "dot", "dashdot"]}
                          onChange={(dash) => updateSeries({ dash })}
                        />
                      )}
                    </div>
                    <Select
                      label="点形状"
                      value={series.symbol}
                      options={[
                        "circle",
                        "square",
                        "diamond",
                        "triangle-up",
                        "cross",
                        "x",
                      ]}
                      onChange={(symbol) => updateSeries({ symbol })}
                    />
                    <NumberInput
                      label="点大小"
                      value={series.size}
                      min={0}
                      max={30}
                      onChange={(size) => updateSeries({ size })}
                    />
                  </Section>
                )}
                {c.type === "line" && (
                  <BandPanel
                    series={series}
                    data={data}
                    onChange={updateSeries}
                  />
                )}
                {!evaluation && c.type !== "box" && c.type !== "violin" && (
                  <Section title="误差棒 · 实际数据">
                    <Select
                      label="误差数值列"
                      value={series.error}
                      options={["", ...nums]}
                      empty="不显示误差棒"
                      onChange={(error) => updateSeries({ error })}
                    />
                    <p className="tiny-note">
                      仅使用文件中的非负误差值，不生成误差或显著性。
                    </p>
                  </Section>
                )}
                <Section title="图层操作">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={c.series.length <= 1}
                    onClick={() => {
                      patch({
                        series: c.series.filter((s) => s.id !== series.id),
                      });
                      setSeriesId(c.series.find((s) => s.id !== series.id)!.id);
                    }}
                  >
                    <Trash2 size={13} />
                    删除该序列
                  </Button>
                </Section>
              </>
            )}
            {panel === "axes" &&
              (["x", "y"] as const).map((axis) => (
                <Section key={axis} title={`${axis.toUpperCase()} 坐标轴`}>
                  <Text
                    label={`${axis.toUpperCase()} 轴名称`}
                    value={
                      c.type === "confusion"
                        ? c.classification?.[
                            axis === "x" ? "xTitle" : "yTitle"
                          ] || ""
                        : evaluation
                          ? c.evaluation?.[
                              c.type === "roc"
                                ? axis === "x"
                                  ? "rocXTitle"
                                  : "rocYTitle"
                                : axis === "x"
                                  ? "prXTitle"
                                  : "prYTitle"
                            ] || ""
                          : empirical
                            ? axis === "x"
                              ? c.empirical?.valueTitle || ""
                              : c.empirical?.resultTitle || ""
                            : c.axes[axis].title
                    }
                    onChange={(title) =>
                      c.type === "confusion"
                        ? patch({
                            classification: {
                              ...(c.classification || defaultClassification),
                              [axis === "x" ? "xTitle" : "yTitle"]: title,
                            },
                          })
                        : evaluation
                          ? patch({
                              evaluation: {
                                ...(c.evaluation || defaultEvaluation),
                                [c.type === "roc"
                                  ? axis === "x"
                                    ? "rocXTitle"
                                    : "rocYTitle"
                                  : axis === "x"
                                    ? "prXTitle"
                                    : "prYTitle"]: title,
                              },
                            })
                          : empirical
                            ? patch({
                                empirical: {
                                  ...(c.empirical || defaultEmpirical),
                                  [axis === "x" ? "valueTitle" : "resultTitle"]:
                                    title,
                                },
                              })
                            : patch({
                                axes: {
                                  ...c.axes,
                                  [axis]: { ...c.axes[axis], title },
                                },
                              })
                    }
                  />
                  <fieldset
                    className="axis-numeric-controls"
                    disabled={
                      evaluation ||
                      (axis === "x" &&
                        (c.type === "box" || c.type === "violin"))
                    }
                  >
                    <div className="form-grid">
                      {(["min", "max"] as const).map((k) => (
                        <Text
                          key={k}
                          label={k === "min" ? "最小值" : "最大值"}
                          value={c.axes[axis][k]}
                          placeholder="自动"
                          onChange={(v) =>
                            patch({
                              axes: {
                                ...c.axes,
                                [axis]: { ...c.axes[axis], [k]: v },
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                    <Text
                      label="刻度间隔（log 轴为指数间隔）"
                      placeholder="自动"
                      value={c.axes[axis].dtick}
                      onChange={(dtick) =>
                        patch({
                          axes: {
                            ...c.axes,
                            [axis]: { ...c.axes[axis], dtick },
                          },
                        })
                      }
                    />
                  </fieldset>
                  {c.type !== "confusion" && (
                    <Toggle
                      label="显示网格线"
                      value={c.axes[axis].grid}
                      onChange={(grid) =>
                        patch({
                          axes: {
                            ...c.axes,
                            [axis]: { ...c.axes[axis], grid },
                          },
                        })
                      }
                    />
                  )}
                  <fieldset
                    className="axis-numeric-controls"
                    disabled={
                      evaluation ||
                      (axis === "x" &&
                        (c.type === "box" || c.type === "violin"))
                    }
                  >
                    <Toggle
                      label="对数坐标"
                      value={c.axes[axis].log}
                      onChange={(log) =>
                        patch({
                          axes: { ...c.axes, [axis]: { ...c.axes[axis], log } },
                        })
                      }
                    />
                  </fieldset>
                  {evaluation && (
                    <p className="tiny-note">
                      {c.type === "confusion"
                        ? "混淆矩阵使用离散类别轴；普通图的范围和对数设置已保留。"
                        : "评估曲线使用线性 0–1 坐标；普通图的范围和对数设置已保留。"}
                    </p>
                  )}
                  {axis === "x" &&
                    (c.type === "box" || c.type === "violin") && (
                      <p className="tiny-note">
                        X
                        为离散类别；数值范围、刻度间隔与对数设置保留供其他图表使用。
                      </p>
                    )}
                </Section>
              ))}
            {panel === "annotations" && (
              <Section title="文本注释">
                <p className="tiny-note">
                  位置采用画布比例坐标：0 为左 / 下，1 为右 / 上。
                </p>
                {c.annotations.map((a, i) => (
                  <div className="annotation-item" key={a.id}>
                    <Text
                      label={`注释 ${i + 1}`}
                      value={a.text}
                      onChange={(text) =>
                        patch({
                          annotations: c.annotations.map((v) =>
                            v.id === a.id ? { ...v, text } : v,
                          ),
                        })
                      }
                    />
                    <div className="form-grid">
                      <NumberInput
                        label="X 位置"
                        value={a.x}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(x) =>
                          patch({
                            annotations: c.annotations.map((v) =>
                              v.id === a.id ? { ...v, x } : v,
                            ),
                          })
                        }
                      />
                      <NumberInput
                        label="Y 位置"
                        value={a.y}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(y) =>
                          patch({
                            annotations: c.annotations.map((v) =>
                              v.id === a.id ? { ...v, y } : v,
                            ),
                          })
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patch({
                          annotations: c.annotations.filter(
                            (v) => v.id !== a.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={13} />
                      删除注释
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({
                      annotations: [
                        ...c.annotations,
                        {
                          id: crypto.randomUUID(),
                          text: "Observation",
                          x: 0.5,
                          y: 0.9,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={13} />
                  添加文本注释
                </Button>
              </Section>
            )}
            <div className="inspector-footer">
              <Button
                variant="ghost"
                size="sm"
                disabled={!id}
                onClick={() => setHistoryOpen(true)}
              >
                <History size={13} />
                版本历史
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (await confirm("恢复默认配置？可通过撤销恢复。"))
                    change(defaults(data));
                }}
              >
                <RotateCcw size={13} />
                恢复默认
              </Button>
            </div>
          </div>
        </aside>
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
      <div className="editor-statusbar">
        <span>
          LabFlow <span className="muted">/</span> 科研绘图工作台
        </span>
        <span>
          {data.filename} · 数据版本 v{data.version}{" "}
          <span className="status-separator">|</span>{" "}
          <span className="green-dot" />
          本地工作区
        </span>
      </div>
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
