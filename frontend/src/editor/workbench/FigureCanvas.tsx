import {
  AlertTriangle,
  ChartCandlestick,
  ChartNoAxesCombined,
  Check,
  History,
  Layers,
  Maximize2,
  MousePointer2,
  Table2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { RefObject } from "react";
import { DataTable } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { type Dataset } from "../../lib/api";
import { ClassificationResults } from "../ClassificationResults";
import { EvaluationResults } from "../EvaluationResults";
import { type Config } from "../model";
import "../styles-library.css";
import { fittedZoom } from "./fitZoom";
import { usePlotRenderer } from "./usePlotRenderer";

type FigureCanvasProps = {
  c: Config;
  setAutoFit: React.Dispatch<React.SetStateAction<boolean>>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  zoom: number;
  stage: React.RefObject<HTMLDivElement | null>;
  plotPending: boolean;
  data: Dataset;
  rendered: { config: Config; data: Dataset } | null;
  id: number | null;
  setPanel: React.Dispatch<React.SetStateAction<string>>;
  graph: RefObject<HTMLDivElement | null>;
  plotError: string;
  plot: ReturnType<typeof usePlotRenderer>["plot"];
  evaluation: boolean;
  bottom: string;
  setBottom: React.Dispatch<React.SetStateAction<string>>;
  empirical: boolean;
  renderConfig: Config;
  project: number;
  logs: string[];
};
export function FigureCanvas({
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
}: FigureCanvasProps) {
  return (
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
              c.datasetVersionId === data.id && rendered?.data.id === data.id
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
                const cls = (e.target as Element).getAttribute("class") || "";
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
              <EvaluationResults metrics={plot.metrics} config={renderConfig} />
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
  );
}
