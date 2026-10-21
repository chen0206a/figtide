import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "../components/ui/button";

export function PreviewWarnings({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(30);
  if (!warnings.length) return null;
  const sparse = warnings.filter((s) => s.includes("样本不足或为常量"));
  return (
    <details
      className="preview-diagnostics"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <AlertTriangle size={14} />
        <span>
          {warnings.length} 条数据提示
          <small>
            {sparse.length
              ? "部分分组样本不足，未估计密度"
              : "查看当前数据与分组的绘图诊断"}
          </small>
        </span>
        <ChevronDown size={14} />
      </summary>
      <p className="preview-diagnostics-hint">
        {sparse.length
          ? `${sparse.length} 个分组样本不足或为常量。请检查分布图的类别与分组字段；样式不会补齐样本或生成密度。`
          : "提示来自当前数据与绘图设置，切换样式不会自动修正数据。"}
      </p>
      {open && (
        <div className="preview-diagnostics-body">
          <ol>
            {warnings.slice(0, limit).map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ol>
          {warnings.length > limit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLimit((n) => n + 30)}
            >
              再显示 30 条（剩余 {warnings.length - limit}）
            </Button>
          )}
        </div>
      )}
    </details>
  );
}
