import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { buildPlot } from "./plot";
import { PreviewWarnings } from "./PreviewWarnings";

export function StylePreview({
  config,
  data,
}: {
  config: Config;
  data: Dataset;
}) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<HTMLDivElement>(null);
  const queue = useRef(Promise.resolve());
  const [width, setWidth] = useState(400);
  const [state, setState] = useState("正在渲染预览…");
  const result = useMemo(() => {
    try {
      return { plot: buildPlot(config, data), error: "" };
    } catch (e) {
      return { plot: null, error: (e as Error).message };
    }
  }, [config, data]);
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
  const scale = Math.min(
    (width || 400) / config.style.width,
    220 / config.style.height,
    1,
  );
  return (
    <>
      <div
        className="style-preview"
        ref={host}
        aria-label="当前数据样式预览"
        aria-busy={!result.error && !!state}
      >
        <div
          className="style-preview-stage"
          style={{ height: config.style.height * scale }}
        >
          <div
            ref={graph}
            style={{
              width: config.style.width,
              height: config.style.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              marginLeft: Math.max(0, (width - config.style.width * scale) / 2),
            }}
          />
        </div>
        {(state || result.error) && (
          <p
            role={
              result.error || state.startsWith("预览失败") ? "alert" : "status"
            }
          >
            {result.error || state}
          </p>
        )}
      </div>
      <PreviewWarnings warnings={result.plot?.warnings || []} />
    </>
  );
}
