import {
  Layers,
  Maximize2,
  MousePointer2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { RefObject } from "react";
import { Button } from "../../components/ui/button";
import { type Dataset } from "../../lib/api";
import { type Config } from "../model";
import { BottomDrawer } from "./BottomDrawer";
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
      <BottomDrawer
        {...{
          evaluation,
          bottom,
          setBottom,
          c,
          plot,
          empirical,
          plotPending,
          renderConfig,
          project,
          data,
          logs,
        }}
      />
    </section>
  );
}
