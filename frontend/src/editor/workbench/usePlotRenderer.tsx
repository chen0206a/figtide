import Plotly from "plotly.js-cartesian-dist-min";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { type Dataset } from "../../lib/api";
import { layoutPatch } from "../layoutPatch";
import { type Config } from "../model";
import { buildPlot } from "../plot";

type usePlotRendererProps = {
  c: Config;
  data: Dataset;
  onDataset: (id: number) => void;
  setSeriesId: React.Dispatch<React.SetStateAction<string>>;
  setPanel: React.Dispatch<React.SetStateAction<string>>;
};
export function usePlotRenderer({
  c,
  data,
  onDataset,
  setSeriesId,
  setPanel,
}: usePlotRendererProps) {
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

  const plotReady = useRef<Promise<any>>(Promise.resolve());

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

  return {
    plot,
    plotPending,
    plotError,
    graph,
    plotReady,
    rendered,
    renderConfig,
  };
}
