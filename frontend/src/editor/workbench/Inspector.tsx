import { History, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useConfirm } from "../../components/useConfirm";
import { type Dataset } from "../../lib/api";
import { defaults, type Config, type Series } from "../model";
import { ProfessionalPanel } from "../ProfessionalPanel";
import "../styles-library.css";
import { AnnotationsTab } from "./inspector/AnnotationsTab";
import { AppearanceTab } from "./inspector/AppearanceTab";
import { AxesTab } from "./inspector/AxesTab";
import { ChartTab } from "./inspector/ChartTab";
import { SeriesTab } from "./inspector/SeriesTab";

type InspectorProps = {
  widths: { left: number; right: number };
  panel: string;
  setPanel: React.Dispatch<React.SetStateAction<string>>;
  c: Config;
  data: Dataset;
  patch: (value: Partial<Config>) => void;
  empirical: boolean;
  evaluation: boolean;
  fields: string[];
  nums: string[];
  classificationLabels: boolean;
  series: Series;
  updateSeries: (value: Partial<Series>) => void;
  style: (value: Partial<Config["style"]>) => void;
  setSeriesId: React.Dispatch<React.SetStateAction<string>>;
  id: number | null;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  change: (value: Config) => void;
};
export function Inspector({
  widths,
  panel,
  setPanel,
  c,
  data,
  patch,
  empirical,
  evaluation,
  fields,
  nums,
  classificationLabels,
  series,
  updateSeries,
  style,
  setSeriesId,
  id,
  setHistoryOpen,
  confirm,
  change,
}: InspectorProps) {
  return (
    <aside className="editor-right" style={{ width: widths.right }}>
      <div className="panel-title">
        <SlidersHorizontal size={14} />
        属性
      </div>
      <div className="inspector-tabs">
        {[
          ["chart", "图表"],
          ["appearance", "外观"],
          ["series", "序列"],
          ["axes", "坐标轴"],
          ["annotations", "注释"],
          ["professional", "专业"],
        ].map(([key, label]) => (
          <button
            className={panel === key ? "active" : ""}
            aria-pressed={panel === key}
            key={key}
            onClick={() => setPanel(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="inspector-scroll">
        {panel === "professional" && (
          <ProfessionalPanel config={c} data={data} onChange={patch} />
        )}
        <ChartTab
          {...{
            panel,
            empirical,
            evaluation,
            c,
            fields,
            patch,
            nums,
            classificationLabels,
            series,
            updateSeries,
          }}
        />
        <AppearanceTab {...{ panel, c, style, patch }} />

        <SeriesTab
          {...{
            panel,
            series,
            c,
            setSeriesId,
            updateSeries,
            classificationLabels,
            evaluation,
            fields,
            nums,
            data,
            patch,
          }}
        />
        <AxesTab {...{ panel, c, evaluation, empirical, patch }} />
        <AnnotationsTab {...{ panel, c, patch }} />
        <div className="inspector-footer">
          <Button
            variant="ghost"
            size="sm"
            disabled={!id}
            onClick={() => setHistoryOpen(true)}
          >
            <History size={13} />
            版本历史
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (await confirm("恢复默认配置？可通过撤销恢复。"))
                change(defaults(data));
            }}
          >
            <RotateCcw size={13} />
            恢复默认
          </Button>
        </div>
      </div>
    </aside>
  );
}
