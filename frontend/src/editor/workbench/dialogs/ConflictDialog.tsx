import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import "../../styles-library.css";

type ConflictDialogProps = {
  conflict: boolean;
  setConflict: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  save: (asCopy?: boolean) => Promise<void>;
};
export function ConflictDialog({
  conflict,
  setConflict,
  saving,
  save,
}: ConflictDialogProps) {
  return (
    <Dialog
      open={conflict}
      onOpenChange={setConflict}
      title="图表已有更新版本"
      description="当前修改仍保留在本机草稿中。可以另存为新图表，避免覆盖另一个窗口保存的版本。"
    >
      <div className="dialog-actions">
        <Button variant="outline" onClick={() => setConflict(false)}>
          继续编辑
        </Button>
        <Button disabled={saving} onClick={() => save(true)}>
          另存副本
        </Button>
      </div>
    </Dialog>
  );
}
