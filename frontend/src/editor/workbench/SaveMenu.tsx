import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";

/** Save-copy stays explicit; this menu never saves on opening or dismissing. */
export function SaveMenu({
  disabled,
  onSaveCopy,
}: {
  disabled: boolean;
  onSaveCopy: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="editor-save-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
          item.current?.focus();
        }
      }}
    >
      <Button
        ref={trigger}
        variant="outline"
        size="icon"
        disabled={disabled}
        aria-label="更多保存选项"
        title="更多保存选项"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={14} />
      </Button>
      {open && (
        <div role="menu" aria-label="保存选项">
          <button
            ref={item}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
              onSaveCopy();
            }}
          >
            另存副本
          </button>
        </div>
      )}
    </div>
  );
}
