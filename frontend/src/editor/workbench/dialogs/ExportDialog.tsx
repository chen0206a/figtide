import { Download } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { type Config } from "../../model";
import { exportChecks, publicationMetrics } from "../../publication";
import { NumberInput, Select } from "../controls";

type ExportDialogProps = {
  exportOpen: boolean;
  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>;
  format: "svg" | "png" | "pdf";
  setFormat: React.Dispatch<React.SetStateAction<"svg" | "png" | "pdf">>;
  c: Config;
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
  onPaperSize?: () => void;
};
export function ExportDialog({
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
}: ExportDialogProps) {
  return (
    <Dialog
      open={exportOpen}
      onOpenChange={setExportOpen}
      title="导出科研图表"
      description="导出与当前画布使用相同配置，缩放比例不会影响导出尺寸。"
    >
      <Select
        label="文件格式"
        value={format}
        options={[
          { value: "svg", label: "SVG 矢量" },
          { value: "png", label: "PNG 图片" },
          { value: "pdf", label: "PDF 文档" },
        ]}
        onChange={(v) => setFormat(v as "svg" | "png" | "pdf")}
      />
      {format === "png" && !c.publication?.enabled && (
        <NumberInput
          label="像素倍率"
          value={scale}
          min={1}
          max={4}
          onChange={setScale}
        />
      )}
      <div className="export-summary">
        {format === "pdf"
          ? "PDF 矢量 · 字体嵌入 · 单页图版"
          : format === "svg"
            ? "SVG 矢量 · 可编辑文本"
            : `PNG · ${publicationMetrics(c, scale).pixelWidth} × ${publicationMetrics(c, scale).pixelHeight} px`}
        <small>
          {format === "pdf"
            ? "使用内置 Noto Sans SC 字体，保证中英文与符号可移植。未启用物理尺寸时按 96 px/in 定义页面。"
            : format === "svg"
              ? "文字保留为文本，接收设备需安装相同字体。"
              : c.publication?.enabled
                ? `成品 ${output.widthMm} × ${output.heightMm.toFixed(1)} mm · 约 ${output.effectiveDpi.toFixed(0)} DPI`
                : "有效 DPI 取决于成品物理宽度，可在专业面板中设置。"}
        </small>
      </div>
      {format === "pdf" && c.style.font !== "Noto Sans SC" && (
        <div className="export-summary">
          <p>
            PDF 首版支持内置 Noto Sans
            SC。请先切换画布字体并核对效果，再下载；此修改可撤销。SVG / PNG
            继续支持所有现有字体。
          </p>
          <Button
            variant="outline"
            onClick={() => style({ font: "Noto Sans SC" })}
          >
            切换为可嵌入字体并预览
          </Button>
        </div>
      )}
      <div className="export-checks">
        {exportChecks(c, scale).map((message) => (
          <p key={message}>{message}</p>
        ))}
        {c.publication?.enabled && (
          <p>
            SVG 物理尺寸：{output.widthMm} × {output.heightMm.toFixed(1)} mm ·
            基础字号 {output.fontPt} pt
          </p>
        )}
        {!c.publication?.enabled && onPaperSize && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setExportOpen(false);
              onPaperSize();
            }}
          >
            设置论文尺寸
          </Button>
        )}
      </div>
      <div className="dialog-actions">
        <Button
          disabled={
            exporting ||
            plotPending ||
            (format === "pdf" && c.style.font !== "Noto Sans SC")
          }
          onClick={download}
        >
          <Download size={15} />
          {exporting ? "正在导出…" : "下载图表"}
        </Button>
      </div>
    </Dialog>
  );
}
