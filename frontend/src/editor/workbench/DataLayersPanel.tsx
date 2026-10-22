import {
  AudioLines,
  ChartCandlestick,
  ChartColumn,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Grid2X2,
  Palette,
  Plus,
  ScatterChart,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { type Dataset } from "../../lib/api";
import type { StoredChart } from "../Editor";
import { defaultClassification, makeSeries, type Config } from "../model";
import { presetThumbnail, stylePresets } from "../stylePresets";
import "../styles-library.css";
import { StyleThumbnail } from "../StyleThumbnail";

type DataLayersPanelProps = {
  widths: { left: number; right: number };
  onUpload: () => void;
  c: Config;
  onDataset: (id: number) => void;
  patch: (value: Partial<Config>) => void;
  datasets: Dataset[];
  data: Dataset;
  original: StoredChart | undefined;
  setPanel: React.Dispatch<React.SetStateAction<string>>;
  nums: string[];
  classificationLabels: boolean;
  setSeriesId: React.Dispatch<React.SetStateAction<string>>;
  panel: string;
  seriesId: string;
  setPreviewPreset: React.Dispatch<React.SetStateAction<string>>;
  setReuseTab: React.Dispatch<React.SetStateAction<"style" | "builtin">>;
  setReuseOpen: React.Dispatch<React.SetStateAction<boolean>>;
};
export function DataLayersPanel({
  widths,
  onUpload,
  c,
  onDataset,
  patch,
  datasets,
  data,
  original,
  setPanel,
  nums,
  classificationLabels,
  setSeriesId,
  panel,
  seriesId,
  setPreviewPreset,
  setReuseTab,
  setReuseOpen,
}: DataLayersPanelProps) {
  return (
    <aside className="editor-left" style={{ width: widths.left }}>
      <div className="panel-title">
        <Database size={14} />
        数据与图层
      </div>
      <section className="left-section">
        <div className="section-label">
          数据集{" "}
          <button aria-label="上传数据" title="上传数据" onClick={onUpload}>
            <Plus size={14} />
          </button>
        </div>
        <select
          aria-label="绘图数据集"
          value={c.datasetVersionId}
          onChange={(e) => {
            const n = Number(e.target.value);
            onDataset(n);
            patch({ datasetVersionId: n });
          }}
        >
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.filename} · v{d.version}
            </option>
          ))}
        </select>
        <div className="dataset-meta">
          <span className="green-dot" />
          {data.row_count} 行 <span>·</span> {data.fields.length} 字段{" "}
          <span className="version-tag">v{data.version}</span>
        </div>
        <details className="field-disclosure">
          <summary>
            查看字段 <span>{data.fields.length}</span>
          </summary>
          <div className="field-list">
            {data.fields.map((f) => (
              <div key={f.name}>
                <span
                  className={
                    f.type === "number" ? "number-symbol" : "string-symbol"
                  }
                >
                  {f.type === "number" ? "#" : "Aa"}
                </span>
                <span>{f.name}</span>
                <small>{f.type === "number" ? "数值" : "文本"}</small>
              </div>
            ))}
          </div>
        </details>
      </section>
      <details className="left-section chart-picker" open={!original}>
        <summary>
          图表类型{" "}
          <span>
            {
              {
                line: "折线图",
                bar: "柱状图",
                scatter: "散点图",
                heatmap: "热力图",
                box: "箱线图",
                violin: "小提琴图",
                histogram: "直方图",
                ecdf: "ECDF",
                roc: "ROC",
                pr: "PR",
                confusion: "混淆矩阵",
              }[c.type]
            }
          </span>
          <ChevronDown size={13} />
        </summary>
        <div className="chart-type-grid">
          {(
            [
              ["line", ChartNoAxesCombined, "折线图"],
              ["bar", ChartColumn, "柱状图"],
              ["scatter", ScatterChart, "散点图"],
              ["heatmap", Grid2X2, "热力图"],
              ["box", ChartCandlestick, "箱线图"],
              ["violin", AudioLines, "小提琴图"],
              ["histogram", ChartColumn, "直方图"],
              ["ecdf", ChartNoAxesCombined, "ECDF"],
              ["roc", ChartNoAxesCombined, "ROC"],
              ["pr", ChartNoAxesCombined, "PR"],
              ["confusion", Grid2X2, "混淆矩阵"],
            ] as const
          ).map(([type, Icon, label]) => (
            <button
              key={type}
              className={c.type === type ? "active" : ""}
              onClick={() => {
                patch({
                  type,
                  ...(type === "confusion" && !c.classification
                    ? {
                        classification: {
                          ...defaultClassification,
                          label: c.evaluation?.label || "",
                          positive: c.evaluation?.positive || "1",
                          threshold: c.evaluation?.threshold ?? 0.5,
                        },
                      }
                    : {}),
                });
                setPanel(
                  type === "box" ||
                    type === "violin" ||
                    type === "histogram" ||
                    type === "ecdf" ||
                    type === "roc" ||
                    type === "pr" ||
                    type === "confusion"
                    ? "professional"
                    : "chart",
                );
              }}
            >
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </details>
      <section className="left-section">
        <div className="section-label">
          图层 / 序列{" "}
          <button
            aria-label="添加序列"
            title="添加序列"
            disabled={
              c.series.length >= 20 || (!nums.length && !classificationLabels)
            }
            onClick={() => {
              const s = makeSeries(
                nums.find(
                  (n) => !c.series.some((s) => s.y === n) && n !== c.x,
                ) ||
                  nums[0] ||
                  "",
                c.series.length,
              );
              patch({ series: [...c.series, s] });
              setSeriesId(s.id);
              setPanel("series");
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          className={`layer-item ${panel === "chart" ? "active" : ""}`}
          onClick={() => setPanel("chart")}
        >
          <ChartNoAxesCombined size={15} />
          <span>图表画布</span>
        </button>
        {c.series.map((s) => (
          <button
            className={`layer-item ${panel === "series" && s.id === seriesId ? "active" : ""}`}
            key={s.id}
            onClick={() => {
              setSeriesId(s.id);
              setPanel("series");
            }}
          >
            <span className="series-line" style={{ background: s.color }} />
            <span>{s.name}</span>
            {!s.visible && <small>隐藏</small>}
            <ChevronRight size={12} />
          </button>
        ))}
      </section>
      <details className="left-section presets preset-disclosure">
        <summary>
          <Palette size={13} />
          图表样式
        </summary>
        <div className="sidebar-style-grid">
          {stylePresets.map(({ key, name }) => (
            <button
              className={c.style.preset === key ? "preset active" : "preset"}
              aria-label={`预览内置样式 ${key}`}
              onClick={() => {
                setPreviewPreset(key);
                setReuseTab("builtin");
                setReuseOpen(true);
              }}
              key={key}
            >
              <div>
                <span>{name}</span>
                {c.style.preset === key && <Check size={12} />}
              </div>
              <StyleThumbnail profile={presetThumbnail(key)} />
            </button>
          ))}
        </div>
        <p className="tiny-note">点击预览，确认后应用。可随时撤销。</p>
        <Button
          variant="outline"
          onClick={() => {
            setReuseTab("style");
            setReuseOpen(true);
          }}
        >
          管理个人模板
        </Button>
      </details>
      <div className="left-foot">
        <span className="green-dot" />
        原始实验数据始终保持不变
      </div>
    </aside>
  );
}
