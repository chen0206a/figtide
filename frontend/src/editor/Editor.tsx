import { useState, useEffect, useReducer, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Plotly from "plotly.js-dist-min";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  Undo2,
  Redo2,
  Eye,
  Download,
  Save,
  Check,
  Database,
  Layers,
  SlidersHorizontal,
  Type,
  Grid2X2,
  ChartNoAxesCombined,
  ChartColumn,
  ScatterChart,
  Hash,
  FileSpreadsheet,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Table2,
  History,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Upload,
  Filter,
  Palette,
  MousePointer2,
} from "lucide-react";
import { ApiError, api, send, type Dataset } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { DataTable } from "../components/DataTable";
import {
  defaults,
  makeSeries,
  palettes,
  historyReducer,
  type Config,
  type Series,
} from "./model";
import { useConfirm } from "../components/useConfirm";
import { SourceProvenance } from "../experiments/SourceProvenance";
import { buildPlot } from "./plot";
type Props = {
  project: number;
  projectName: string;
  datasets: Dataset[];
  chartId: number | null;
  initialDataset: number;
  onSaved: (id: number) => void;
  onUpload: () => void;
  onDirty: (v: boolean) => void;
  notify: (s: string) => void;
};
export default function Editor(p: Props) {
  const existing = useQuery({
    queryKey: ["chart", p.project, p.chartId],
    queryFn: () => api(`/projects/${p.project}/charts/${p.chartId}`),
    enabled: !!p.chartId,
  });
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
  if (p.chartId && existing.isPending)
    return <div className="empty-state">正在恢复图表配置…</div>;
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
          导入 CSV / XLSX
        </Button>
        <small>折线 · 分组柱状 · 散点 · 热力图</small>
      </div>
    );
  if (data.isPending)
    return <div className="empty-state">正在读取不可变数据版本…</div>;
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
function Workbench(
  p: Props & { data: Dataset; original: any; onDataset: (id: number) => void },
) {
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
  useEffect(() => {
    try {
      localStorage.setItem("labflow-panel-widths", JSON.stringify(widths));
    } catch {}
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
  const draftKey = `labflow-draft-v1:${p.project}:${p.chartId ?? (p.data.source_meta ? `comparison-${p.data.id}` : "new")}`;
  const [recovery, setRecovery] = useState<{
    config: Config;
    name: string;
    revision: number;
    at: string;
  } | null>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || "null");
      return d?.config?.schema_version === 1 &&
        typeof d.name === "string" &&
        Number.isInteger(d.revision) &&
        p.datasets.some((v) => v.id === d.config.datasetVersionId)
        ? d
        : null;
    } catch {
      return null;
    }
  });
  const [draftStatus, setDraftStatus] = useState("");
  const [conflict, setConflict] = useState(false);
  const [panels, setPanels] = useState(() => {
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
  });
  function togglePanel(side: "left" | "right") {
    const next = { ...panels, [side]: !panels[side] };
    setPanels(next);
    try {
      localStorage.setItem("labflow-panels", JSON.stringify(next));
    } catch {}
  }
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: p.original?.config || defaults(p.data),
    future: [],
  });
  const c = history.present;
  const [name, setName] = useState(
      p.original?.name ||
        (p.data.source_meta
          ? `${p.data.source_meta.metric} · 实验对比`.slice(0, 120)
          : "Untitled figure"),
    ),
    [revision, setRevision] = useState(p.original?.revision || 0),
    [id, setId] = useState<number | null>(p.chartId),
    [baseline, setBaseline] = useState(
      p.original
        ? JSON.stringify({ config: p.original.config, name: p.original.name })
        : "",
    ),
    [saving, setSaving] = useState(false),
    [exporting, setExporting] = useState(false),
    [panel, setPanel] = useState("chart"),
    [seriesId, setSeriesId] = useState(c.series[0]?.id),
    [zoom, setZoom] = useState(85),
    [bottom, setBottom] = useState(""),
    [preview, setPreview] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [logs, setLogs] = useState<string[]>(["工作台已就绪"]);
  const graph = useRef<any>(null);
  const [plotError, setPlotError] = useState("");
  const plotReady = useRef<Promise<any>>(Promise.resolve());
  const [format, setFormat] = useState<"svg" | "png">("svg"),
    [scale, setScale] = useState(2);
  const versions = useQuery({
    queryKey: ["versions", p.project, id, revision],
    queryFn: () => api<any[]>(`/projects/${p.project}/charts/${id}/versions`),
    enabled: !!id && historyOpen,
  });
  const dirty = baseline !== JSON.stringify({ config: c, name });
  useEffect(() => {
    p.onDirty(dirty);
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (recovery) return;
    try {
      if (dirty) {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            config: c,
            name,
            revision,
            at: new Date().toISOString(),
          }),
        );
        setDraftStatus("本机草稿已保存");
      } else {
        localStorage.removeItem(draftKey);
        setDraftStatus("");
      }
    } catch {
      setDraftStatus("本机草稿保存失败，请正式保存图表");
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
  const nums = p.data.fields
    .filter((f) => f.type === "number")
    .map((f) => f.name);
  const fields = p.data.fields.map((f) => f.name);
  const plot = useMemo(() => buildPlot(c, p.data), [c, p.data]);
  useEffect(() => {
    if (c.datasetVersionId !== p.data.id) p.onDataset(c.datasetVersionId);
  }, [c.datasetVersionId, p.data.id]);
  useEffect(() => {
    const el = graph.current;
    if (!el) return;
    let active = true;
    plotReady.current = plotReady.current
      .catch(() => {})
      .then(() => {
        if (!active) return;
        return Plotly.react(el, plot.traces, plot.layout, {
          displayModeBar: false,
          responsive: false,
          editable: false,
          scrollZoom: false,
          doubleClick: false,
        }).then(() => {
          if (!active) return;
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
  }, [plot]);
  useEffect(
    () => () => {
      if (graph.current) Plotly.purge(graph.current);
    },
    [],
  );
  async function save(asCopy = false) {
    if (saving || c.datasetVersionId !== p.data.id) return;
    setSaving(true);
    const snapshot = c,
      saveName = asCopy ? `${name.slice(0, 115)} · 副本` : name;
    const saveId = asCopy ? null : id;
    try {
      const result = await api(
        `/projects/${p.project}/charts${saveId ? "/" + saveId : ""}`,
        send(saveId ? "PUT" : "POST", {
          name: saveName,
          revision,
          config: snapshot,
        }),
      );
      queryClient.setQueryData(["chart", p.project, result.id], result);
      if (!asCopy)
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      setConflict(false);
      setId(result.id);
      setRevision(result.revision);
      setBaseline(JSON.stringify({ config: snapshot, name: saveName }));
      setLogs((l) => [`已保存版本 v${result.revision}`, ...l].slice(0, 30));
      p.notify(`图表已保存 · v${result.revision}`);
      p.onSaved(result.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      p.notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
    setExporting(true);
    try {
      await plotReady.current;
      const url = await Plotly.toImage(graph.current, {
        format,
        width: c.style.width,
        height: c.style.height,
        scale: format === "png" ? scale : 1,
      });
      const link = document.createElement("a");
      link.href = url;
      link.download =
        (name.replace(/[^\p{L}\p{N}_-]/gu, "_") || "figure") + "." + format;
      link.click();
      setLogs((l) =>
        [
          `导出 ${format.toUpperCase()} · ${c.style.width} × ${c.style.height}`,
          ...l,
        ].slice(0, 30),
      );
      setExportOpen(false);
      p.notify(`${format.toUpperCase()} 已导出`);
    } catch (e) {
      p.notify("导出失败：" + (e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const preset = (value: string) => {
    patch({
      style: {
        ...c.style,
        preset: value,
        font:
          value === "Nature-inspired"
            ? "Arial"
            : value === "Modern Research"
              ? "Helvetica"
              : "Arial",
      },
      series: c.series.map((s, i) => ({ ...s, color: palettes[value][i % 5] })),
    });
  };
  return (
    <div
      className={`editor ${preview ? "preview-mode" : ""} ${!panels.left ? "hide-left" : ""} ${!panels.right ? "hide-right" : ""}`}
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
              {p.projectName}
              <ChevronRight size={10} /> 图版{" "}
              {id ? String(id).padStart(2, "0") : "草稿"}
            </small>
          </div>
          <span className={`save-state ${dirty ? "unsaved" : ""}`}>
            {saving ? (
              "保存中…"
            ) : dirty ? (
              draftStatus || "● 未保存"
            ) : (
              <>
                <Check size={12} /> 已保存 v{revision}
              </>
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
            aria-pressed={panels.right}
            onClick={() => togglePanel("right")}
          >
            属性栏
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={
              saving || !name.trim() || c.datasetVersionId !== p.data.id
            }
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
              !dirty ||
              c.datasetVersionId !== p.data.id
            }
            onClick={() => save()}
          >
            <Save size={14} />
            保存
          </Button>
          <Button
            size="sm"
            disabled={
              !!plotError ||
              !plot.traces.length ||
              c.datasetVersionId !== p.data.id
            }
            onClick={() => setExportOpen(true)}
          >
            <Download size={14} />
            导出
            <ChevronDown size={12} />
          </Button>
        </div>
      </div>
      {p.data.source_meta && (
        <div className="provenance-strip">
          <SourceProvenance source={p.data.source_meta} project={p.project} />
          <span>指标来自固定实验快照 · 后续修改实验不会影响此图</span>
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
              <button
                aria-label="上传数据"
                title="上传数据"
                onClick={p.onUpload}
              >
                <Plus size={14} />
              </button>
            </div>
            <select
              aria-label="绘图数据集"
              value={c.datasetVersionId}
              onChange={(e) => {
                const n = Number(e.target.value);
                p.onDataset(n);
                patch({ datasetVersionId: n });
              }}
            >
              {p.datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename} · v{d.version}
                </option>
              ))}
            </select>
            <div className="dataset-meta">
              <span className="green-dot" />
              {p.data.row_count} 行 <span>·</span> {p.data.fields.length} 字段{" "}
              <span className="version-tag">v{p.data.version}</span>
            </div>
            <div className="field-list">
              {p.data.fields.map((f) => (
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
          </section>
          <section className="left-section">
            <div className="section-label">
              图表类型<span className="tiny-label">4 种</span>
            </div>
            <div className="chart-type-grid">
              {(
                [
                  ["line", ChartNoAxesCombined, "折线图"],
                  ["bar", ChartColumn, "柱状图"],
                  ["scatter", ScatterChart, "散点图"],
                  ["heatmap", Grid2X2, "热力图"],
                ] as const
              ).map(([type, Icon, label]) => (
                <button
                  key={type}
                  className={c.type === type ? "active" : ""}
                  onClick={() => {
                    patch({ type });
                    setPanel("chart");
                  }}
                >
                  <Icon size={22} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="left-section">
            <div className="section-label">
              图层 / 序列{" "}
              <button
                aria-label="添加序列"
                title="添加序列"
                disabled={c.series.length >= 20 || !nums.length}
                onClick={() => {
                  const s = makeSeries(
                    nums.find(
                      (n) => !c.series.some((s) => s.y === n) && n !== c.x,
                    ) || nums[0],
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
            <button
              className={`layer-item ${panel === "axes" ? "active" : ""}`}
              onClick={() => setPanel("axes")}
            >
              <Hash size={15} />
              <span>坐标轴</span>
            </button>
            <button
              className={`layer-item ${panel === "annotations" ? "active" : ""}`}
              onClick={() => setPanel("annotations")}
            >
              <Type size={15} />
              <span>文本注释</span>
              <small>{c.annotations.length || ""}</small>
            </button>
          </section>
          <section className="left-section presets">
            <div className="section-label">
              视觉预设 <Palette size={13} />
            </div>
            {Object.entries(palettes).map(([key, colors]) => (
              <button
                className={c.style.preset === key ? "preset active" : "preset"}
                onClick={() => preset(key)}
                key={key}
              >
                <div>
                  <span>{key}</span>
                  {c.style.preset === key && <Check size={12} />}
                </div>
                <div className="swatches">
                  {colors.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </div>
              </button>
            ))}
            <p className="tiny-note">独立设计预设，非期刊官方认证。</p>
          </section>
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
                onClick={() => setZoom(Math.max(30, zoom - 10))}
              >
                <ZoomOut size={14} />
              </Button>
              <button
                className="zoom-value"
                onClick={() => setZoom(85)}
                title="重置缩放"
              >
                {zoom}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="放大"
                onClick={() => setZoom(Math.min(150, zoom + 10))}
              >
                <ZoomIn size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="适合窗口"
                aria-label="适合窗口"
                onClick={() => {
                  const el = document.querySelector(".canvas-stage")!;
                  setZoom(
                    Math.min(
                      100,
                      Math.floor(
                        Math.min(
                          (el.clientWidth - 80) / c.style.width,
                          (el.clientHeight - 100) / c.style.height,
                        ) * 100,
                      ),
                    ),
                  );
                }}
              >
                <Maximize2 size={14} />
              </Button>
            </div>
          </div>
          <div className="canvas-stage">
            <div
              className="paper-group"
              style={{
                visibility:
                  c.datasetVersionId === p.data.id ? "visible" : "hidden",
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
                    if (cls.includes("xtitle") || cls.includes("ytitle"))
                      setPanel("axes");
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
            {c.datasetVersionId !== p.data.id && (
              <div className="canvas-loading">正在读取所选数据版本…</div>
            )}
            {plotError && (
              <div className="canvas-error" role="alert">
                绘图失败：{plotError}
              </div>
            )}
          </div>
          <div className="bottom-tabs">
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
              实时画布
            </span>
          </div>
          {bottom && (
            <div className="bottom-content">
              {bottom === "data" ? (
                <DataTable data={p.data} />
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
              ["series", "序列"],
              ["axes", "坐标轴"],
              ["annotations", "注释"],
            ].map(([key, label]) => (
              <button
                className={panel === key ? "active" : ""}
                key={key}
                onClick={() => setPanel(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inspector-scroll">
            {panel === "chart" && (
              <>
                <Section title="字段映射" icon={<Database size={13} />}>
                  <Select
                    label="X 轴字段"
                    value={c.x}
                    options={fields}
                    onChange={(x) => patch({ x })}
                  />
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
                        label="Y 轴字段 · 当前序列"
                        value={series.y}
                        options={nums}
                        onChange={(y) => updateSeries({ y, name: y })}
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
                    ]}
                    onChange={(font) => style({ font })}
                  />
                  <div className="form-grid">
                    <NumberInput
                      label="字号"
                      value={c.style.fontSize}
                      min={8}
                      max={40}
                      onChange={(fontSize) => style({ fontSize })}
                    />
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
                          legend: { ...c.legend, orientation: v as "h" | "v" },
                        })
                      }
                    />
                  </div>
                </Section>
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
                    label="Y 数值字段"
                    value={series.y}
                    options={nums}
                    onChange={(y) => updateSeries({ y })}
                  />
                  <Toggle
                    label="显示该序列"
                    value={series.visible}
                    onChange={(visible) => updateSeries({ visible })}
                  />
                </Section>
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
                    <Select
                      label="线型"
                      value={series.dash}
                      options={["solid", "dash", "dot", "dashdot"]}
                      onChange={(dash) => updateSeries({ dash })}
                    />
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
                    value={c.axes[axis].title}
                    onChange={(title) =>
                      patch({
                        axes: { ...c.axes, [axis]: { ...c.axes[axis], title } },
                      })
                    }
                  />
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
                        axes: { ...c.axes, [axis]: { ...c.axes[axis], dtick } },
                      })
                    }
                  />
                  <Toggle
                    label="显示网格线"
                    value={c.axes[axis].grid}
                    onChange={(grid) =>
                      patch({
                        axes: { ...c.axes, [axis]: { ...c.axes[axis], grid } },
                      })
                    }
                  />
                  <Toggle
                    label="对数坐标"
                    value={c.axes[axis].log}
                    onChange={(log) =>
                      patch({
                        axes: { ...c.axes, [axis]: { ...c.axes[axis], log } },
                      })
                    }
                  />
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
                    change(defaults(p.data));
                }}
              >
                <RotateCcw size={13} />
                恢复默认
              </Button>
            </div>
          </div>
        </aside>
      </div>
      <div className="editor-statusbar">
        <span>
          LabFlow <span className="muted">/</span> 科研绘图工作台
        </span>
        <span>
          {p.data.filename} · 数据版本 v{p.data.version}{" "}
          <span className="status-separator">|</span>{" "}
          <span className="green-dot" />
          本地工作区
        </span>
      </div>
      {confirmDialog}
      <Dialog
        open={!!recovery}
        onOpenChange={() => {}}
        title="发现未完成的草稿"
        description={`本机保存时间：${recovery?.at ? new Date(recovery.at).toLocaleString() : ""}。恢复后仍需正式保存到图表版本。`}
      >
        <div className="dialog-actions">
          <Button
            variant="outline"
            onClick={() => {
              try {
                localStorage.removeItem(draftKey);
              } catch {}
              setRecovery(null);
            }}
          >
            丢弃草稿
          </Button>
          <Button
            onClick={() => {
              if (recovery) {
                change(recovery.config);
                setName(recovery.name);
                setRevision(recovery.revision);
                setRecovery(null);
              }
            }}
          >
            恢复草稿
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={conflict}
        onOpenChange={setConflict}
        title="图表已有更新版本"
        description="当前修改仍保留在本机草稿中。可以另存为新图表，避免覆盖另一个窗口保存的版本。"
      >
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setConflict(false)}>
            继续编辑
          </Button>
          <Button disabled={saving} onClick={() => save(true)}>
            另存副本
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="导出科研图表"
        description="导出与当前画布使用相同配置，缩放比例不会影响导出尺寸。"
      >
        <Select
          label="文件格式"
          value={format}
          options={["svg", "png"]}
          onChange={(v) => setFormat(v as "svg" | "png")}
        />
        {format === "png" && (
          <NumberInput
            label="像素倍率"
            value={scale}
            min={1}
            max={4}
            onChange={setScale}
          />
        )}
        <div className="export-summary">
          {format === "svg"
            ? "SVG 矢量 · 可编辑文本"
            : `PNG · ${c.style.width * scale} × ${c.style.height * scale} px`}
          <small>
            {format === "svg"
              ? "文字保留为文本，接收设备需安装相同字体。"
              : "建议论文使用 2× 或更高倍率。"}
          </small>
        </div>
        <div className="dialog-actions">
          <Button disabled={exporting} onClick={download}>
            <Download size={15} />
            {exporting ? "正在导出…" : "下载图表"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="图表版本历史"
        description="载入历史快照后保存，会创建新版本，不覆盖已有历史。"
      >
        {versions.isPending ? (
          <p>读取中…</p>
        ) : versions.isError ? (
          <p>{versions.error.message}</p>
        ) : (
          versions.data?.map((v) => (
            <div className="version-row" key={v.version}>
              <span>
                <b>版本 {v.version}</b>
                <small>{new Date(v.created_at).toLocaleString()}</small>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  change(v.config);
                  p.onDataset(v.config.datasetVersionId);
                  setHistoryOpen(false);
                  p.notify(`已载入 v${v.version}，保存可创建新版本`);
                }}
              >
                载入快照
              </Button>
            </div>
          ))
        )}
      </Dialog>
    </div>
  );
}
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="property-section">
      <h3>
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
function Text({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        maxLength={500}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </label>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
  empty = "无",
}: {
  label: string;
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (v: string) => void;
  empty?: string;
}) {
  const opts = options.map((o) =>
    typeof o === "string" ? { value: o, label: o || empty } : o,
  );
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!opts.some((o) => o.value === value) && (
          <option value={value}>⚠ {value || "请选择"}</option>
        )}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-label">
      {label}
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
