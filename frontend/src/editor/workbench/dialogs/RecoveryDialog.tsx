import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import type { ChartDraft } from "../../../lib/chartDraft";
import { type Config } from "../../model";
import "../../styles-library.css";

type RecoveryDialogProps = {
  recovery: ChartDraft | null;
  draftKey: string;
  initialDraft: ChartDraft | null;
  setRecovery: React.Dispatch<React.SetStateAction<ChartDraft | null>>;
  change: (value: Config) => void;
  setName: React.Dispatch<React.SetStateAction<string>>;
  setRevision: React.Dispatch<React.SetStateAction<number>>;
};
export function RecoveryDialog({
  recovery,
  draftKey,
  initialDraft,
  setRecovery,
  change,
  setName,
  setRevision,
}: RecoveryDialogProps) {
  return (
    <Dialog
      open={!!recovery}
      onOpenChange={() => {}}
      title="本机草稿与已保存版本不同"
      description={`图表已有其他保存版本。本机草稿时间：${recovery?.at ? new Date(recovery.at).toLocaleString() : ""}。恢复后可另存副本，保留两份内容。`}
    >
      <div className="dialog-actions">
        <Button
          variant="outline"
          onClick={() => {
            try {
              localStorage.removeItem(draftKey);
              if (initialDraft?.storageKey)
                localStorage.removeItem(initialDraft.storageKey);
            } catch {}
            setRecovery(null);
          }}
        >
          使用已保存版本
        </Button>
        <Button
          onClick={() => {
            if (recovery) {
              change(recovery.config);
              setName(recovery.name);
              setRevision(recovery.revision);
              setRecovery(null);
            }
          }}
        >
          恢复草稿
        </Button>
      </div>
    </Dialog>
  );
}
