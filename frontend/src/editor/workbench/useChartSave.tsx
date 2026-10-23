import type { QueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { ApiError, api, send, type Dataset } from "../../lib/api";
import type { ChartDraft } from "../../lib/chartDraft";
import { chartDraftKey } from "../../lib/chartDraft";
import { DraftWriter } from "../../lib/draftWriter";
import { readableError, saveFailureMessage } from "../../lib/saveFeedback";
import { type Config } from "../model";

type useChartSaveProps = {
  saving: boolean;
  c: Config;
  data: Dataset;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  name: string;
  id: number | null;
  project: number;
  revision: number;
  queryClient: QueryClient;
  mounted: React.RefObject<boolean>;
  draftWriter: React.RefObject<DraftWriter | null>;
  draftKey: string;
  initialDraft: ChartDraft | null;
  originDataset: number;
  panel: string;
  seriesId: string;
  setConflict: React.Dispatch<React.SetStateAction<boolean>>;
  setId: React.Dispatch<React.SetStateAction<number | null>>;
  setRevision: React.Dispatch<React.SetStateAction<number>>;
  setBaseline: React.Dispatch<React.SetStateAction<string>>;
  setLogs: React.Dispatch<React.SetStateAction<string[]>>;
  notify: (s: string) => void;
  onSaved: (id: number) => void;
};
export function useChartSave({
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
}: useChartSaveProps) {
  // A request can fail after further edits: persist the current draft, not the
  // snapshot sent to the server. Keep the existing recovery shape and key.
  const latestDraft = useRef({ c, name, revision, draftKey });
  latestDraft.current = { c, name, revision, draftKey };
  async function save(asCopy = false) {
    if (saving || c.datasetVersionId !== data.id) return;
    setSaving(true);
    const snapshot = c,
      saveName = asCopy ? `${name.slice(0, 115)} · 副本` : name;
    const saveId = asCopy ? null : id;
    try {
      const result = await api(
        `/projects/${project}/charts${saveId ? "/" + saveId : ""}`,
        send(saveId ? "PUT" : "POST", {
          name: saveName,
          revision,
          config: snapshot,
        }),
      );
      queryClient.setQueryData(["chart", project, result.id], result);
      if (!mounted.current) {
        void queryClient.invalidateQueries({ queryKey: ["charts", project] });
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        return;
      }
      if (!asCopy)
        try {
          draftWriter.current?.clear(draftKey);
          if (initialDraft?.storageKey && initialDraft.storageKey !== draftKey)
            localStorage.removeItem(initialDraft.storageKey);
        } catch {}
      try {
        sessionStorage.setItem(
          `labflow-editor-view:${chartDraftKey(project, result.id, originDataset)}`,
          JSON.stringify({ panel, seriesId }),
        );
      } catch {}
      setConflict(false);
      setId(result.id);
      setRevision(result.revision);
      setBaseline(JSON.stringify({ config: snapshot, name: saveName }));
      setLogs((l) => [`已保存版本 v${result.revision}`, ...l].slice(0, 30));
      notify(`图表已保存 · v${result.revision}`);
      onSaved(result.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      if (e instanceof ApiError && e.kind === "offline") {
        let kept = false;
        try {
          const latest = latestDraft.current;
          const value = JSON.stringify({
            config: latest.c,
            name: latest.name,
            revision: latest.revision,
            at: new Date().toISOString(),
          });
          const written = draftWriter.current?.writeNow(latest.draftKey, value) ?? false;
          kept = written && localStorage.getItem(latest.draftKey) === value;
        } catch {}
        notify(saveFailureMessage(kept));
      } else notify(readableError(e));
    } finally {
      setSaving(false);
    }
  }

  return { save };
}
