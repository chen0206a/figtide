import { useRef, useState, useEffect, useCallback } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
export function useConfirm() {
  const [message, setMessage] = useState("");
  const resolve = useRef<((v: boolean) => void) | null>(null);
  useEffect(() => () => resolve.current?.(false), []);
  function finish(v: boolean) {
    resolve.current?.(v);
    resolve.current = null;
    setMessage("");
  }
  const confirm = useCallback(
    (text: string) =>
      new Promise<boolean>((r) => {
        resolve.current?.(false);
        resolve.current = r;
        setMessage(text);
      }),
    [],
  );
  const dialog = (
    <Dialog
      open={!!message}
      onOpenChange={(v) => {
        if (!v) finish(false);
      }}
      title="确认操作"
      description={message}
    >
      <div className="dialog-actions">
        <Button variant="outline" onClick={() => finish(false)}>
          取消
        </Button>
        <Button onClick={() => finish(true)}>继续</Button>
      </div>
    </Dialog>
  );
  return { confirm, dialog };
}
