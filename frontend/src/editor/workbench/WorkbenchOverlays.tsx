import type { QueryClient, UseQueryResult } from "@tanstack/react-query";
import { type Dataset } from "../../lib/api";
import type { ChartDraft } from "../../lib/chartDraft";
import { type Config } from "../model";
import { QuickActions } from "../QuickActions";
import { ReuseDialog } from "../ReuseDialog";
import "../styles-library.css";
import { ConflictDialog } from "./dialogs/ConflictDialog";
import { ExportDialog } from "./dialogs/ExportDialog";
import { RecoveryDialog } from "./dialogs/RecoveryDialog";
import { VersionHistoryDialog } from "./dialogs/VersionHistoryDialog";
import type { ChartVersion } from "./types";

type WorkbenchOverlaysProps = {
  recovery: ChartDraft | null;
  draftKey: string;
  initialDraft: ChartDraft | null;
  setRecovery: React.Dispatch<React.SetStateAction<ChartDraft | null>>;
  change: (value: Config) => void;
  setName: React.Dispatch<React.SetStateAction<string>>;
  setRevision: React.Dispatch<React.SetStateAction<number>>;
  conflict: boolean;
  setConflict: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  save: (asCopy?: boolean) => Promise<void>;
  quickOpen: boolean;
  project: number;
  id: number | null;
  revision: number;
  c: Config;
  data: Dataset;
  serialized: string;
  setQuickOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLogs: React.Dispatch<React.SetStateAction<string[]>>;
  notify: (s: string) => void;
  reuseOpen: boolean;
  name: string;
  datasets: Dataset[];
  reuseTab: "builtin" | "style";
  previewPreset: string;
  setReuseOpen: React.Dispatch<React.SetStateAction<boolean>>;
  queryClient: QueryClient;
  onSaved: (id: number) => void;
  exportOpen: boolean;
  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>;
  format: "svg" | "png" | "pdf";
  setFormat: React.Dispatch<React.SetStateAction<"svg" | "png" | "pdf">>;
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  output: {
    heightMm: number;
    fontPx: number;
    pixelWidth: number;
    pixelHeight: number;
    scale: number;
    effectiveDpi: number;
    enabled: boolean;
    widthMm: number;
    fontPt: number;
    dpi: number;
  };
  style: (value: Partial<Config["style"]>) => void;
  exporting: boolean;
  plotPending: boolean;
  download: () => Promise<void>;
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  versions: UseQueryResult<ChartVersion[], Error>;
  onDataset: (id: number) => void;
  onPaperSize: () => void;
};
export function WorkbenchOverlays({
  recovery,
  draftKey,
  initialDraft,
  setRecovery,
  change,
  setName,
  setRevision,
  conflict,
  setConflict,
  saving,
  save,
  quickOpen,
  project,
  id,
  revision,
  c,
  data,
  serialized,
  setQuickOpen,
  setLogs,
  notify,
  reuseOpen,
  name,
  datasets,
  reuseTab,
  previewPreset,
  setReuseOpen,
  queryClient,
  onSaved,
  exportOpen,
  setExportOpen,
  format,
  setFormat,
  scale,
  setScale,
  output,
  style,
  exporting,
  plotPending,
  download,
  historyOpen,
  setHistoryOpen,
  versions,
  onDataset,
  onPaperSize,
}: WorkbenchOverlaysProps) {
  return (
    <>
      <RecoveryDialog
        {...{
          recovery,
          draftKey,
          initialDraft,
          setRecovery,
          change,
          setName,
          setRevision,
        }}
      />
      <ConflictDialog {...{ conflict, setConflict, saving, save }} />
      {quickOpen && (
        <QuickActions
          project={project}
          chartId={id}
          revision={revision}
          config={c}
          data={data}
          token={JSON.stringify({ serialized, id, revision })}
          onClose={() => setQuickOpen(false)}
          onApply={(token, config, count) => {
            if (
              token !== JSON.stringify({ serialized, id, revision }) ||
              saving
            )
              return false;
            change(config);
            setLogs((l) => [`已应用快捷调整 · ${count} 项`, ...l].slice(0, 30));
            notify(`已应用 ${count} 项调整，可撤销`);
            return true;
          }}
        />
      )}
      {reuseOpen && (
        <ReuseDialog
          project={project}
          config={c}
          name={name}
          datasets={datasets}
          data={data}
          initialTab={reuseTab}
          initialPreset={previewPreset || c.style.preset}
          onClose={() => setReuseOpen(false)}
          onApply={change}
          onReused={(result) => {
            queryClient.setQueryData(["chart", project, result.id], result);
            setReuseOpen(false);
            onSaved(result.id);
            notify("已创建复用图表，源图保持不变");
          }}
        />
      )}
      <ExportDialog
        {...{
          exportOpen,
          setExportOpen,
          format,
          setFormat,
          c,
          scale,
          setScale,
          output,
          style,
          exporting,
          plotPending,
          download,
          onPaperSize,
        }}
      />
      <VersionHistoryDialog
        {...{
          historyOpen,
          setHistoryOpen,
          versions,
          change,
          onDataset,
          notify,
        }}
      />
    </>
  );
}
