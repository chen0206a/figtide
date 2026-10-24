import { useEffect } from "react";
import { type Dataset } from "../../lib/api";
import { type Config } from "../model";

type useEditorShortcutsProps = {
  saving: boolean;
  c: Config;
  data: Dataset;
  setQuickOpen: React.Dispatch<React.SetStateAction<boolean>>;
  quickOpen: boolean;
  save: (asCopy?: boolean) => Promise<void>;
  dispatch: React.ActionDispatch<
    [a: { type: "edit" | "reset" | "undo" | "redo"; value?: Config }]
  >;
};
export function useEditorShortcuts({
  saving,
  c,
  data,
  setQuickOpen,
  quickOpen,
  save,
  dispatch,
}: useEditorShortcutsProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (
          !saving &&
          !document.querySelector('[role="dialog"]') &&
          c.datasetVersionId === data.id
        )
          setQuickOpen(true);
        return;
      }
      if (quickOpen || (e.target as HTMLElement).closest(".agent-dock")) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")
          e.preventDefault();
        return;
      }
      if (saving) {
        if (
          (e.ctrlKey || e.metaKey) &&
          ["s", "z"].includes(e.key.toLowerCase())
        )
          e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
}
