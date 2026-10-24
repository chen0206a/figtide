import Plotly from "plotly.js-cartesian-dist-min";
import type { RefObject } from "react";
import { downloadBlob } from "../../lib/download";
import { type Config } from "../model";
import { physicalSvg, pngDensity, publicationMetrics } from "../publication";

type useFigureExportProps = {
  exporting: boolean;
  plotPending: boolean;
  setExporting: React.Dispatch<React.SetStateAction<boolean>>;
  plotReady: RefObject<Promise<unknown>>;
  c: Config;
  scale: number;
  format: "svg" | "png" | "pdf";
  graph: RefObject<HTMLDivElement | null>;
  name: string;
  setLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notify: (s: string) => void;
};
export function useFigureExport({
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
}: useFigureExportProps) {
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
      let url = await Plotly.toImage(graph.current!, {
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
        const { vectorPdf } = await import("../pdf");
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
  return { download };
}
