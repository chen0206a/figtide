import { Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { type Dataset } from "../../../lib/api";
import { BandPanel } from "../../EvaluationPanel";
import { type Config, type Series } from "../../model";
import { NumberInput, Section, Select, Text, Toggle } from "../controls";

type SeriesTabProps = {
  panel: string;
  series: Series;
  c: Config;
  setSeriesId: React.Dispatch<React.SetStateAction<string>>;
  updateSeries: (value: Partial<Series>) => void;
  classificationLabels: boolean;
  evaluation: boolean;
  fields: string[];
  nums: string[];
  data: Dataset;
  patch: (value: Partial<Config>) => void;
};
export function SeriesTab({
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
}: SeriesTabProps) {
  return (
    <>
      {panel === "series" && series && (
        <>
          <Section title="序列映射">
            <Select
              label="当前序列"
              value={series.id}
              options={c.series.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
              onChange={setSeriesId}
            />
            <Text
              label="序列名称"
              value={series.name}
              onChange={(name) => updateSeries({ name })}
            />
            <Select
              label={
                classificationLabels
                  ? "预测标签列"
                  : evaluation
                    ? "预测分数列"
                    : "Y 数值字段"
              }
              value={classificationLabels ? series.prediction || "" : series.y}
              options={classificationLabels ? ["", ...fields] : nums}
              onChange={(y) =>
                updateSeries(classificationLabels ? { prediction: y } : { y })
              }
            />
            <Toggle
              label="显示该序列"
              value={series.visible}
              onChange={(visible) => updateSeries({ visible })}
            />
          </Section>
          {c.type !== "confusion" && (
            <Section title="外观">
              <label>
                序列颜色
                <div className="color-input">
                  <input
                    aria-label="序列颜色"
                    type="color"
                    value={series.color}
                    onChange={(e) => updateSeries({ color: e.target.value })}
                  />
                  <span>{series.color.toUpperCase()}</span>
                </div>
              </label>
              <label>
                透明度{" "}
                <span className="float-right">
                  {Math.round(series.opacity * 100)}%
                </span>
                <input
                  aria-label="透明度"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={series.opacity}
                  onChange={(e) =>
                    updateSeries({ opacity: Number(e.target.value) })
                  }
                />
              </label>
              <div className="form-grid">
                <NumberInput
                  label="线宽"
                  value={series.width}
                  min={0.5}
                  max={10}
                  step={0.5}
                  onChange={(width) => updateSeries({ width })}
                />
                {c.type !== "box" && c.type !== "violin" && (
                  <Select
                    label="线型"
                    value={series.dash}
                    options={["solid", "dash", "dot", "dashdot"]}
                    onChange={(dash) => updateSeries({ dash })}
                  />
                )}
              </div>
              <Select
                label="点形状"
                value={series.symbol}
                options={[
                  "circle",
                  "square",
                  "diamond",
                  "triangle-up",
                  "cross",
                  "x",
                ]}
                onChange={(symbol) => updateSeries({ symbol })}
              />
              <NumberInput
                label="点大小"
                value={series.size}
                min={0}
                max={30}
                onChange={(size) => updateSeries({ size })}
              />
            </Section>
          )}
          {c.type === "line" && (
            <BandPanel series={series} data={data} onChange={updateSeries} />
          )}
          {!evaluation && c.type !== "box" && c.type !== "violin" && (
            <Section title="误差棒 · 实际数据">
              <Select
                label="误差数值列"
                value={series.error}
                options={["", ...nums]}
                empty="不显示误差棒"
                onChange={(error) => updateSeries({ error })}
              />
              <p className="tiny-note">
                仅使用文件中的非负误差值，不生成误差或显著性。
              </p>
            </Section>
          )}
          <Section title="序列操作">
            <Button
              variant="outline"
              size="sm"
              disabled={c.series.length <= 1}
              onClick={() => {
                patch({
                  series: c.series.filter((s) => s.id !== series.id),
                });
                setSeriesId(c.series.find((s) => s.id !== series.id)!.id);
              }}
            >
              <Trash2 size={13} />
              删除该序列
            </Button>
          </Section>
        </>
      )}
    </>
  );
}
