import { type Dataset } from "../../lib/api";

type EditorStatusBarProps = {
  data: Dataset;
};
export function EditorStatusBar({ data }: EditorStatusBarProps) {
  return (
    <div className="editor-statusbar">
      <span>
        LabFlow <span className="muted">/</span> 科研绘图工作台
      </span>
      <span>
        {data.filename} · v{data.version}{" "}
        <span className="status-separator">|</span>{" "}
        <span className="green-dot" />
        本地工作区
      </span>
    </div>
  );
}
