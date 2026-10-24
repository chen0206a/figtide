import { Database, Filter, Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { type Config, type Series } from "../../model";
import { Section, Select, Text } from "../controls";

type ChartTabProps = {
  panel: string;
  empirical: boolean;
  evaluation: boolean;
  c: Config;
  fields: string[];
  patch: (value: Partial<Config>) => void;
  nums: string[];
  classificationLabels: boolean;
  series: Series;
  updateSeries: (value: Partial<Series>) => void;
};
export function ChartTab({
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
}: ChartTabProps) {
  return (
    <>
      {panel === "chart" && (
        <>
          <Section title="字段映射" icon={<Database size={13} />}>
            {!empirical && !evaluation && (
              <Select
                label="X 轴字段"
                value={c.x}
                options={fields}
                onChange={(x) => patch({ x })}
              />
            )}
            {c.type === "heatmap" ? (
              <>
                <Select
                  label="Y 分类字段"
                  value={c.heatY}
                  options={fields}
                  onChange={(heatY) => patch({ heatY })}
                />
                <Select
                  label="Z 数值字段"
                  value={c.heatZ}
                  options={nums}
                  onChange={(heatZ) => patch({ heatZ })}
                />
              </>
            ) : (
              <>
                <Select
                  label={
                    classificationLabels
                      ? "预测标签列 · 当前序列"
                      : evaluation
                        ? "预测分数列 · 当前序列"
                        : "Y 轴字段 · 当前序列"
                  }
                  value={
                    classificationLabels ? series.prediction || "" : series.y
                  }
                  options={classificationLabels ? ["", ...fields] : nums}
                  onChange={(y) =>
                    updateSeries(
                      classificationLabels
                        ? { prediction: y, name: y }
                        : { y, name: y },
                    )
                  }
                />
                <Select
                  label="按类别分组"
                  value={c.group}
                  options={["", ...fields]}
                  empty="不分组"
                  onChange={(group) => patch({ group })}
                />
              </>
            )}
          </Section>
        </>
      )}
      {panel === "chart" && (
        <>
          <Section title="数据过滤 · 可复现" icon={<Filter size={13} />}>
            <p className="tiny-note">仅影响展示，不覆盖原始数据。</p>
            {c.transforms.map((t, i) => (
              <div className="transform" key={i}>
                <Select
                  label="过滤字段"
                  value={t.field}
                  options={fields}
                  onChange={(field) =>
                    patch({
                      transforms: c.transforms.map((v, j) =>
                        j === i ? { ...v, field } : v,
                      ),
                    })
                  }
                />
                <Select
                  label="条件"
                  value={t.operator}
                  options={["eq", "gte", "lte"]}
                  onChange={(operator) =>
                    patch({
                      transforms: c.transforms.map((v, j) =>
                        j === i ? { ...v, operator: operator as any } : v,
                      ),
                    })
                  }
                />
                <Text
                  label="过滤值"
                  value={t.value}
                  onChange={(value) =>
                    patch({
                      transforms: c.transforms.map((v, j) =>
                        j === i ? { ...v, value } : v,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patch({
                      transforms: c.transforms.filter((_, j) => j !== i),
                    })
                  }
                >
                  <Trash2 size={13} />
                  删除条件
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  transforms: [
                    ...c.transforms,
                    {
                      op: "filter",
                      field: c.x,
                      operator: "eq",
                      value: "",
                    },
                  ],
                })
              }
            >
              <Plus size={13} />
              添加过滤
            </Button>
          </Section>
        </>
      )}
    </>
  );
}
