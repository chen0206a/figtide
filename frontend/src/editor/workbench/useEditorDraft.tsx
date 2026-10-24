import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Dataset } from "../../lib/api";
import type { ChartDraft } from "../../lib/chartDraft";
import {
  chartDraftKey,
  readChartDraft,
  sameDraftContent,
} from "../../lib/chartDraft";
import { DraftWriter } from "../../lib/draftWriter";
import { defaults, type Config } from "../model";
import type { StoredChart } from "./types";

type useEditorDraftProps = {
  initialDataset: number;
  datasets: Dataset[];
  data: Dataset;
  project: number;
  chartId: number | null;
  original: StoredChart | undefined;
};
export function useEditorDraft({
  initialDataset,
  datasets,
  data,
  project,
  chartId,
  original,
}: useEditorDraftProps) {
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

  return {
    originDataset,
    draftKey,
    initialDraft,
    recovery,
    setRecovery,
    seed,
    viewKey,
    initialView,
  };
}

type useDraftPersistenceProps = {
  dirty: boolean;
  draftKey: string;
  c: Config;
  name: string;
  revision: number;
  recovery: ChartDraft | null;
  onLeaveGuard: (guard: (() => boolean) | null) => void;
};
export function useDraftPersistence({
  dirty,
  draftKey,
  c,
  name,
  revision,
  recovery,
  onLeaveGuard,
}: useDraftPersistenceProps) {
  const [draftStatus, setDraftStatus] = useState("");

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

  return { draftStatus, draftWriter, mounted };
}
