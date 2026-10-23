import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useConfirm } from "../../components/useConfirm";
import { api } from "../../lib/api";
import { historyReducer, type Config, type Series } from "../model";
import { publicationMetrics } from "../publication";
import "../styles-library.css";
import { DataLayersPanel } from "./DataLayersPanel";
import { EditorStatusBar } from "./EditorStatusBar";
import { EditorToolbar } from "./EditorToolbar";
import { FigureAssistantDock } from "./FigureAssistantDock";
import { FigureCanvas } from "./FigureCanvas";
import { FigureSourceStrip } from "./FigureSourceStrip";
import { Inspector } from "./Inspector";
import type { ChartVersion, WorkbenchProps } from "./types";
import { useCanvasFit } from "./useCanvasFit";
import { useChartSave } from "./useChartSave";
import { useDraftPersistence, useEditorDraft } from "./useEditorDraft";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useFigureExport } from "./useFigureExport";
import { usePanelLayout } from "./usePanelLayout";
import { usePlotRenderer } from "./usePlotRenderer";
import { WorkbenchOverlays } from "./WorkbenchOverlays";
export function Workbench({
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
}: WorkbenchProps) {
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
  const {
    originDataset,
    draftKey,
    initialDraft,
    recovery,
    setRecovery,
    seed,
    viewKey,
    initialView,
  } = useEditorDraft({
    initialDataset,
    datasets,
    data,
    project,
    chartId,
    original,
  });
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
  useCanvasFit({ stage, autoFit, setZoom, c });
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
  const { draftStatus, draftWriter, mounted } = useDraftPersistence({
    dirty,
    draftKey,
    c,
    name,
    revision,
    recovery,
    onLeaveGuard,
  });
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
      {data.source_meta && <FigureSourceStrip {...{ data, project }} />}
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
            patch,
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
        <FigureAssistantDock
          {...{
            project,
            chartId,
            data,
            agentOpen,
            assistantPrompt,
            id,
            revision,
            c,
            serialized,
            setAgentOpen,
            saving,
            change,
            setLogs,
            notify,
          }}
        />
      </div>
      <EditorStatusBar {...{ data }} />
      {confirmDialog}
      <WorkbenchOverlays
        {...{
          recovery,
          draftKey,
          initialDraft,
          setRecovery,
          change,
          setName,
          setRevision,
          conflict,
          setConflict,
          saving,
          save,
          quickOpen,
          project,
          id,
          revision,
          c,
          data,
          serialized,
          setQuickOpen,
          setLogs,
          notify,
          reuseOpen,
          name,
          datasets,
          reuseTab,
          previewPreset,
          setReuseOpen,
          queryClient,
          onSaved,
          exportOpen,
          setExportOpen,
          format,
          setFormat,
          scale,
          setScale,
          output,
          style,
          exporting,
          plotPending,
          download,
          historyOpen,
          setHistoryOpen,
          versions,
          onDataset,
        }}
      />
    </div>
  );
}
