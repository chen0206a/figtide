import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { type Config } from "../../model";
import type { ChartVersion } from "../types";
import { formatDateTime } from "../../../lib/format";

type VersionHistoryDialogProps = {
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  versions: UseQueryResult<ChartVersion[], Error>;
  change: (value: Config) => void;
  onDataset: (id: number) => void;
  notify: (s: string) => void;
};
export function VersionHistoryDialog({
  historyOpen,
  setHistoryOpen,
  versions,
  change,
  onDataset,
  notify,
}: VersionHistoryDialogProps) {
  return (
    <Dialog
      open={historyOpen}
      onOpenChange={setHistoryOpen}
      title="图表版本历史"
      description="载入历史快照后保存，会创建新版本，不覆盖已有历史。"
    >
      {versions.isPending ? (
        <p>读取中…</p>
      ) : versions.isError ? (
        <p>{versions.error.message}</p>
      ) : (
        versions.data?.map((v) => (
          <div className="version-row" key={v.version}>
            <span>
              <b>版本 {v.version}</b>
              <small className="lf-mono">{formatDateTime(v.created_at)}</small>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                change(v.config);
                onDataset(v.config.datasetVersionId);
                setHistoryOpen(false);
                notify(`已载入 v${v.version}，保存可创建新版本`);
              }}
            >
              载入快照
            </Button>
          </div>
        ))
      )}
    </Dialog>
  );
}
