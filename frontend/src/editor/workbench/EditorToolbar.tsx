import {
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Undo2,
  Sparkles,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { type Dataset } from "../../lib/api";
import { type Config, type History } from "../model";
import { SaveMenu } from "./SaveMenu";
import "./toolbar.css";

type EditorToolbarProps = {
  saving: boolean;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  projectName: string;
  id: number | null;
  dirty: boolean;
  draftStatus: string;
  revision: number;
  panels: { left: boolean; right: boolean };
  togglePanel: (side: "left" | "right") => void;
  agentOpen: boolean;
  setAgentOpen: React.Dispatch<React.SetStateAction<boolean>>;
  c: Config;
  data: Dataset;
  setQuickOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setReuseTab: React.Dispatch<React.SetStateAction<"builtin" | "style">>;
  setReuseOpen: React.Dispatch<React.SetStateAction<boolean>>;
  save: (asCopy?: boolean) => Promise<void>;
  history: History;
  dispatch: React.ActionDispatch<
    [a: { type: "edit" | "reset" | "undo" | "redo"; value?: Config }]
  >;
  setPreview: React.Dispatch<React.SetStateAction<boolean>>;
  preview: boolean;
  exporting: boolean;
  plotPending: boolean;
  plotError: string;
  plot: { traces: readonly unknown[] };
  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>;
};
export function EditorToolbar({
  saving,
  name,
  setName,
  projectName,
  id,
  dirty,
  draftStatus,
  revision,
  panels,
  togglePanel,
  agentOpen,
  setAgentOpen,
  c,
  data,
  setQuickOpen,
  setReuseTab,
  setReuseOpen,
  save,
  history,
  dispatch,
  setPreview,
  preview,
  exporting,
  plotPending,
  plotError,
  plot,
  setExportOpen,
}: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      <div className="figure-info">
        <span className="figure-icon">
          <ChartNoAxesCombined size={19} />
        </span>
        <div>
          <input
            aria-label="图表名称"
            disabled={saving}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          <small>
            {projectName}
            <ChevronRight size={10} /> {id ? `v${revision}` : "未保存"}
          </small>
        </div>
        <span className={`save-state ${dirty ? "unsaved" : ""}`}>
          {saving ? (
            "保存中…"
          ) : dirty ? (
            draftStatus || "正在保留草稿…"
          ) : id ? (
            <>
              <Check size={12} /> 已保存 v{revision}
            </>
          ) : (
            "新图表 · 可以直接编辑"
          )}
        </span>
      </div>
      <div className="toolbar-actions">
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={panels.left}
          aria-label="数据栏"
          title="数据栏"
          onClick={() => togglePanel("left")}
        >
          <PanelLeft size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={panels.right && !agentOpen}
          aria-label="属性栏"
          title="属性栏"
          onClick={() => {
            if (agentOpen) {
              setAgentOpen(false);
              if (!panels.right) togglePanel("right");
            } else togglePanel("right");
          }}
        >
          <PanelRight size={17} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="快捷操作 Ctrl+K"
          disabled={saving || c.datasetVersionId !== data.id}
          onClick={() => setQuickOpen(true)}
        >
          快捷操作
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving || c.datasetVersionId !== data.id}
          aria-expanded={agentOpen}
          aria-label="绘图助手"
          aria-controls="figure-assistant"
          className="agent-trigger"
          title="绘图助手 Alt+A"
          onClick={() => setAgentOpen((value) => !value)}
        >
          <Sparkles size={15}/>绘图助手 <kbd>Alt A</kbd>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setReuseTab("style");
            setReuseOpen(true);
          }}
          disabled={saving || c.datasetVersionId !== data.id}
        >
          复用
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="撤销 Ctrl+Z"
          aria-label="撤销"
          disabled={saving || !history.past.length}
          onClick={() => dispatch({ type: "undo" })}
        >
          <Undo2 size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="重做 Ctrl+Shift+Z"
          aria-label="重做"
          disabled={saving || !history.future.length}
          onClick={() => dispatch({ type: "redo" })}
        >
          <Redo2 size={17} />
        </Button>
        <span className="toolbar-divider" />
        <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}>
          <Eye size={15} />
          {preview ? "退出预览" : "预览"}
        </Button>
        <div className="editor-save-group">
          <Button
            variant="outline"
            size="sm"
            disabled={
              saving ||
              !name.trim() ||
              (!!id && !dirty) ||
              c.datasetVersionId !== data.id
            }
            onClick={() => save()}
          >
            <Save size={14} />
            保存
          </Button>
          <SaveMenu
            disabled={saving || !name.trim() || c.datasetVersionId !== data.id}
            onSaveCopy={() => {
              void save(true);
            }}
          />
        </div>
        <Button
          size="sm"
          disabled={
            exporting ||
            plotPending ||
            !!plotError ||
            !plot.traces.length ||
            c.datasetVersionId !== data.id
          }
          onClick={() => setExportOpen(true)}
        >
          <Download size={14} />
          {exporting ? "导出中…" : "导出"}
          <ChevronDown size={12} />
        </Button>
      </div>
    </div>
  );
}
