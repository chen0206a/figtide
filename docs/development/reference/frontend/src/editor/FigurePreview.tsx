import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { buildPlot } from "./plot";

/**
 * Static, scaled render of a real chart config + dataset (no interaction).
 * Shared by the home "continue" card and the style library preview.
 *
 * Kept as a default export so callers outside the editor can lazy-load it and
 * keep Plotly out of the main bundle:
 *   const FigurePreview = lazy(() => import("../editor/FigurePreview"));
 */
export default function FigurePreview({
  config,
  data,
  maxHeight = 220,
  label = "图表预览",
  onWarnings,
}: {
  config: Config;
  data: Dataset;
  maxHeight?: number;
  label?: string;
  onWarnings?: (warnings: string[]) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<HTMLDivElement>(null);
  const queue = useRef(Promise.resolve());
  const [width, setWidth] = useState(0);
  const [state, setState] = useState("正在渲染预览…");
  const result = useMemo(() => {
    try {
      return { plot: buildPlot(config, data), error: "" };
    } catch (e) {
      return { plot: null, error: (e as Error).message };
    }
  }, [config, data]);
  useEffect(() => {
    onWarnings?.(result.plot?.warnings || []);
  }, [result, onWarnings]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = graph.current;
    if (!el || !result.plot) return;
    let active = true;
    setState("正在渲染预览…");
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (!active) return;
        if (config.style.font === "Noto Sans SC")
          await document.fonts.load(
            `${config.style.bold ? 700 : 400} ${config.style.fontSize}px "Noto Sans SC"`,
          );
        if (!active) return;
        await Plotly.react(
          el,
          result.plot!.traces,
          structuredClone(result.plot!.layout),
          { staticPlot: true, displayModeBar: false, responsive: false },
        );
        if (active) setState("");
      })
      .catch((e) => {
        if (active) setState(`预览失败：${e.message}`);
      });
    return () => {
      active = false;
    };
  }, [result, config]);
  useEffect(() => {
    const el = graph.current;
    return () => {
      void queue.current.finally(() => {
        if (el) Plotly.purge(el);
      });
    };
  }, []);
  const available = width || config.style.width;
  const scale = Math.min(
    available / config.style.width,
    maxHeight / config.style.height,
    1,
  );
  const message = result.error || state;
  return (
    <div
      className="figure-preview"
      ref={host}
      aria-busy={!result.error && !!state}
    >
      <div
        className="figure-preview-stage"
        role="img"
        aria-label={label}
        style={{ height: config.style.height * scale }}
      >
        <div
          ref={graph}
          data-testid="figure-preview-plot"
          style={{
            width: config.style.width,
            height: config.style.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            marginLeft: Math.max(0, (available - config.style.width * scale) / 2),
          }}
        />
      </div>
      {message && (
        <p
          className="figure-preview-status"
          role={
            result.error || state.startsWith("预览失败") ? "alert" : "status"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
