import {
  History,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useConfirm } from "../../components/useConfirm";
import { type Dataset } from "../../lib/api";
import {
  defaultClassification,
  defaultEmpirical,
  defaultEvaluation,
  defaults,
  type Config,
  type Series,
} from "../model";
import { ProfessionalPanel } from "../ProfessionalPanel";
import "../styles-library.css";
import { NumberInput, Section, Text, Toggle } from "./controls";
import { AppearanceTab } from "./inspector/AppearanceTab";
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
        {panel === "axes" &&
          (["x", "y"] as const).map((axis) => (
            <Section key={axis} title={`${axis.toUpperCase()} 坐标轴`}>
              <Text
                label={`${axis.toUpperCase()} 轴名称`}
                value={
                  c.type === "confusion"
                    ? c.classification?.[axis === "x" ? "xTitle" : "yTitle"] ||
                      ""
                    : evaluation
                      ? c.evaluation?.[
                          c.type === "roc"
                            ? axis === "x"
                              ? "rocXTitle"
                              : "rocYTitle"
                            : axis === "x"
                              ? "prXTitle"
                              : "prYTitle"
                        ] || ""
                      : empirical
                        ? axis === "x"
                          ? c.empirical?.valueTitle || ""
                          : c.empirical?.resultTitle || ""
                        : c.axes[axis].title
                }
                onChange={(title) =>
                  c.type === "confusion"
                    ? patch({
                        classification: {
                          ...(c.classification || defaultClassification),
                          [axis === "x" ? "xTitle" : "yTitle"]: title,
                        },
                      })
                    : evaluation
                      ? patch({
                          evaluation: {
                            ...(c.evaluation || defaultEvaluation),
                            [c.type === "roc"
                              ? axis === "x"
                                ? "rocXTitle"
                                : "rocYTitle"
                              : axis === "x"
                                ? "prXTitle"
                                : "prYTitle"]: title,
                          },
                        })
                      : empirical
                        ? patch({
                            empirical: {
                              ...(c.empirical || defaultEmpirical),
                              [axis === "x" ? "valueTitle" : "resultTitle"]:
                                title,
                            },
                          })
                        : patch({
                            axes: {
                              ...c.axes,
                              [axis]: { ...c.axes[axis], title },
                            },
                          })
                }
              />
              <fieldset
                className="axis-numeric-controls"
                disabled={
                  evaluation ||
                  (axis === "x" && (c.type === "box" || c.type === "violin"))
                }
              >
                <div className="form-grid">
                  {(["min", "max"] as const).map((k) => (
                    <Text
                      key={k}
                      label={k === "min" ? "最小值" : "最大值"}
                      value={c.axes[axis][k]}
                      placeholder="自动"
                      onChange={(v) =>
                        patch({
                          axes: {
                            ...c.axes,
                            [axis]: { ...c.axes[axis], [k]: v },
                          },
                        })
                      }
                    />
                  ))}
                </div>
                <Text
                  label="刻度间隔（log 轴为指数间隔）"
                  placeholder="自动"
                  value={c.axes[axis].dtick}
                  onChange={(dtick) =>
                    patch({
                      axes: {
                        ...c.axes,
                        [axis]: { ...c.axes[axis], dtick },
                      },
                    })
                  }
                />
              </fieldset>
              {c.type !== "confusion" && (
                <Toggle
                  label="显示网格线"
                  value={c.axes[axis].grid}
                  onChange={(grid) =>
                    patch({
                      axes: {
                        ...c.axes,
                        [axis]: { ...c.axes[axis], grid },
                      },
                    })
                  }
                />
              )}
              <fieldset
                className="axis-numeric-controls"
                disabled={
                  evaluation ||
                  (axis === "x" && (c.type === "box" || c.type === "violin"))
                }
              >
                <Toggle
                  label="对数坐标"
                  value={c.axes[axis].log}
                  onChange={(log) =>
                    patch({
                      axes: { ...c.axes, [axis]: { ...c.axes[axis], log } },
                    })
                  }
                />
              </fieldset>
              {evaluation && (
                <p className="tiny-note">
                  {c.type === "confusion"
                    ? "混淆矩阵使用离散类别轴；普通图的范围和对数设置已保留。"
                    : "评估曲线使用线性 0–1 坐标；普通图的范围和对数设置已保留。"}
                </p>
              )}
              {axis === "x" && (c.type === "box" || c.type === "violin") && (
                <p className="tiny-note">
                  X 为离散类别；数值范围、刻度间隔与对数设置保留供其他图表使用。
                </p>
              )}
            </Section>
          ))}
        {panel === "annotations" && (
          <Section title="文本注释">
            <p className="tiny-note">
              位置采用画布比例坐标：0 为左 / 下，1 为右 / 上。
            </p>
            {c.annotations.map((a, i) => (
              <div className="annotation-item" key={a.id}>
                <Text
                  label={`注释 ${i + 1}`}
                  value={a.text}
                  onChange={(text) =>
                    patch({
                      annotations: c.annotations.map((v) =>
                        v.id === a.id ? { ...v, text } : v,
                      ),
                    })
                  }
                />
                <div className="form-grid">
                  <NumberInput
                    label="X 位置"
                    value={a.x}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(x) =>
                      patch({
                        annotations: c.annotations.map((v) =>
                          v.id === a.id ? { ...v, x } : v,
                        ),
                      })
                    }
                  />
                  <NumberInput
                    label="Y 位置"
                    value={a.y}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(y) =>
                      patch({
                        annotations: c.annotations.map((v) =>
                          v.id === a.id ? { ...v, y } : v,
                        ),
                      })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patch({
                      annotations: c.annotations.filter((v) => v.id !== a.id),
                    })
                  }
                >
                  <Trash2 size={13} />
                  删除注释
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  annotations: [
                    ...c.annotations,
                    {
                      id: crypto.randomUUID(),
                      text: "Observation",
                      x: 0.5,
                      y: 0.9,
                    },
                  ],
                })
              }
            >
              <Plus size={13} />
              添加文本注释
            </Button>
          </Section>
        )}
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
