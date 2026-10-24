import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-cartesian-dist-min";
import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import { buildPlot } from "./plot";
import {useReducedMotion} from "../lib/useMotion";

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
  mode="exact",
  animateLines=false,
  onRendered,
  onError,
}: {
  config: Config;
  data: Dataset;
  maxHeight?: number;
  label?: string;
  onWarnings?: (warnings: string[]) => void;
  mode?: "exact" | "fit";
  animateLines?: boolean;
  onRendered?: (element: HTMLDivElement) => void;
  onError?: (message:string)=>void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<HTMLDivElement>(null);
  const queue = useRef(Promise.resolve());
  const [width, setWidth] = useState(0);
  const [state, setState] = useState("正在渲染预览…");
  const reduced=useReducedMotion();
  const callback=useRef(onRendered);callback.current=onRendered;
  const errorCallback=useRef(onError);errorCallback.current=onError;
  const fitWidth=mode==='fit'?Math.min(width||config.style.width,maxHeight*config.style.width/config.style.height,540):config.style.width;
  const fitHeight=fitWidth*config.style.height/config.style.width;
  const result = useMemo(() => {
    try {
      return { plot: buildPlot(config, data), error: "" };
    } catch (e) {
      return { plot: null, error: (e as Error).message };
    }
  }, [config, data]);
  useEffect(() => {
    onWarnings?.(result.plot?.warnings || []);
    if(result.error)errorCallback.current?.(result.error);
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
    const cleanup:(()=>void)[]=[];
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
        const layout=structuredClone(result.plot!.layout);
        if(mode==='fit'){layout.width=fitWidth;layout.height=fitHeight;}
        await Plotly.react(
          el,
          result.plot!.traces,
          layout,
          { staticPlot: true, displayModeBar: false, responsive: false },
        );
        if (active) {
          setState("");callback.current?.(el);
          if(animateLines&&!reduced)el.querySelectorAll<SVGPathElement>('.scatterlayer .js-line').forEach((path,i)=>{
            if(!path.getTotalLength||!path.animate)return;
            const length=path.getTotalLength(),old=path.style.strokeDasharray;
            path.style.strokeDasharray=String(length);
            const animation=path.animate([{strokeDashoffset:String(length)},{strokeDashoffset:'0'}],{duration:500,delay:Math.min(i,5)*120,easing:'cubic-bezier(.65,0,.35,1)',fill:'both'});
            const restore=()=>{animation.cancel();path.style.strokeDasharray=old};cleanup.push(restore);void animation.finished.then(restore,()=>{});
          });
        }
      })
      .catch((e) => {
        if (active) {setState(`预览失败：${e.message}`);errorCallback.current?.(e.message);}
      });
    return () => {
      active = false;
      cleanup.forEach(fn=>fn());
    };
  }, [result, config, mode, fitWidth, fitHeight, animateLines, reduced]);
  useEffect(() => {
    const el = graph.current;
    return () => {
      void queue.current.finally(() => {
        if (el) Plotly.purge(el);
      });
    };
  }, []);
  const available = width || config.style.width;
  const scale = mode==='fit'?1:Math.min(
    available / config.style.width,
    maxHeight / config.style.height,
    1,
  );
  const message = result.error || state;
  return (
    <div
      className="figure-preview"
      ref={host}
      role="img"
      aria-label={label}
      aria-busy={!result.error && !!state}
    >
      <div
        className="figure-preview-stage"
        style={{ height: fitHeight * scale }}
      >
        <div
          ref={graph}
          data-testid="figure-preview-plot"
          style={{
            width: fitWidth,
            height: fitHeight,
            transform: mode==='fit'?'none':`scale(${scale})`,
            transformOrigin: "top left",
            marginLeft: Math.max(
              0,
              (available - fitWidth * scale) / 2,
            ),
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
