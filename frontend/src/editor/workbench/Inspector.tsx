import {
  Database,
  Filter,
  History,
  Maximize2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useConfirm } from "../../components/useConfirm";
import { type Dataset } from "../../lib/api";
import { BandPanel } from "../EvaluationPanel";
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
import { NumberInput, Section, Select, Text, Toggle } from "./controls";

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
        {panel === "appearance" && (
          <>
            <Section title="标题与字体" icon={<Type size={13} />}>
              <Text
                label="图表标题"
                value={c.style.title}
                onChange={(title) => style({ title })}
              />
              <Select
                label="字体"
                value={c.style.font}
                options={[
                  "Arial",
                  "Helvetica",
                  "Times New Roman",
                  "Georgia",
                  "Courier New",
                  "Noto Sans SC",
                ]}
                onChange={(font) => style({ font })}
              />
              <div className="form-grid">
                <fieldset
                  className="axis-numeric-controls"
                  disabled={!!c.publication?.enabled}
                >
                  <NumberInput
                    label="字号"
                    value={c.style.fontSize}
                    min={8}
                    max={40}
                    onChange={(fontSize) => style({ fontSize })}
                  />
                </fieldset>
                <label>
                  字重
                  <select
                    value={c.style.bold ? "bold" : "normal"}
                    onChange={(e) => style({ bold: e.target.value === "bold" })}
                  >
                    <option value="normal">Regular</option>
                    <option value="bold">Bold</option>
                  </select>
                </label>
              </div>
            </Section>
            <Section title="画布设置" icon={<Maximize2 size={13} />}>
              <div className="form-grid">
                <NumberInput
                  label="宽度 / px"
                  value={c.style.width}
                  min={250}
                  max={2400}
                  onChange={(width) => style({ width })}
                />
                <NumberInput
                  label="高度 / px"
                  value={c.style.height}
                  min={250}
                  max={2400}
                  onChange={(height) => style({ height })}
                />
              </div>
              <label>
                画布背景
                <div className="color-input">
                  <input
                    aria-label="画布背景"
                    type="color"
                    value={c.style.background}
                    onChange={(e) => style({ background: e.target.value })}
                  />
                  <span>{c.style.background.toUpperCase()}</span>
                </div>
              </label>
              <div className="form-grid">
                {(["top", "bottom", "left", "right"] as const).map((k) => (
                  <NumberInput
                    key={k}
                    label={
                      {
                        top: "上边距",
                        bottom: "下边距",
                        left: "左边距",
                        right: "右边距",
                      }[k]
                    }
                    value={c.style[k]}
                    min={0}
                    max={300}
                    onChange={(v) => style({ [k]: v })}
                  />
                ))}
              </div>
            </Section>
            {c.type !== "confusion" && (
              <Section title="图例">
                <Toggle
                  label="显示图例"
                  value={c.legend.show}
                  onChange={(show) => patch({ legend: { ...c.legend, show } })}
                />
                <div className="form-grid">
                  <Select
                    label="位置"
                    value={c.legend.position}
                    options={["top", "bottom", "right"]}
                    onChange={(position) =>
                      patch({ legend: { ...c.legend, position } })
                    }
                  />
                  <Select
                    label="方向"
                    value={c.legend.orientation}
                    options={["h", "v"]}
                    onChange={(v) =>
                      patch({
                        legend: {
                          ...c.legend,
                          orientation: v as "h" | "v",
                        },
                      })
                    }
                  />
                </div>
              </Section>
            )}
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
                value={
                  classificationLabels ? series.prediction || "" : series.y
                }
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
            <Section title="图层操作">
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
