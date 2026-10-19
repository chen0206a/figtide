import type { Dataset } from "../lib/api";
import { defaultClassification, type Config } from "./model";
import { Button } from "../components/ui/button";
import { SamplingPanel } from "./SamplingPanel";
export function ClassificationPanel({
  config: c,
  data,
  onChange,
}: {
  config: Config;
  data: Dataset;
  onChange: (value: Partial<Config>) => void;
}) {
  if (c.type !== "confusion") return null;
  const k = c.classification || defaultClassification,
    set = (v: Partial<typeof k>) =>
      onChange({ classification: { ...k, ...v } });
  const visible = c.series.filter((s) => s.visible),
    fields = data.fields.map((f) => f.name),
    groups = c.group ? [...new Set(data.rows.map((r) => r[c.group]))] : [""];
  const choose = (
    label: string,
    value: string,
    options: { value: string; label: string }[],
    change: (v: string) => void,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {!options.some((v) => v.value === value) && (
          <option value={value}>请明确选择</option>
        )}
        {options.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
  const readClasses = () => {
    const cols = [
      k.label,
      ...(k.input === "labels" ? visible.map((s) => s.prediction || "") : []),
    ];
    const values = [
      ...new Set(
        data.rows.flatMap((r) =>
          cols
            .map((col) => r[col])
            .filter((v) => v != null && v !== "")
            .map(String),
        ),
      ),
    ];
    set({ classes: values });
  };
  return (
    <>
      <section className="property-section evaluation-panel">
        <span className="professional-kicker">CLASSIFICATION EVALUATION</span>
        <h3>从标签，核查分类结果。</h3>
        {choose(
          "分类真实标签列",
          k.label,
          fields.map((f) => ({ value: f, label: f })),
          (label) => set({ label }),
        )}
        {choose(
          "预测输入方式",
          k.input,
          [
            { value: "labels", label: "预测标签 · 二分类 / 多分类" },
            { value: "scores", label: "预测分数经阈值 · 仅二分类" },
          ],
          (input) => set({ input: input as typeof k.input }),
        )}
        <p className="tiny-note">
          每个模型在「序列」里映射预测标签或分数列；一行是一份样本，不输入预先汇总的矩阵。
        </p>
        {k.input === "scores" && (
          <>
            {choose(
              "矩阵正类值",
              k.positive,
              k.classes.map((v) => ({ value: v, label: v })),
              (positive) => set({ positive }),
            )}
            <label>
              矩阵决策阈值
              <input
                type="number"
                step="any"
                aria-label="矩阵决策阈值"
                value={k.threshold}
                onChange={(e) => {
                  if (
                    e.target.value !== "" &&
                    Number.isFinite(Number(e.target.value))
                  )
                    set({ threshold: Number(e.target.value) });
                }}
              />
            </label>
            <p className="tiny-note">
              分数 ≥ 阈值判为正类；分数越高越倾向正类。不自动把分数当概率。
            </p>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!k.label}
          onClick={readClasses}
        >
          读取真实与预测类别
        </Button>
        <p className="tiny-note">
          明确保存类别顺序（2–20
          类），行是真实类别、列是预测类别。未知类别会报错，不会丢弃。
        </p>
        {k.classes.map((value, i) => (
          <div className="class-order-row" key={i}>
            <input
              aria-label={`类别 ${i + 1}`}
              maxLength={500}
              value={value}
              onChange={(e) =>
                set({
                  classes: k.classes.map((v, j) =>
                    i === j ? e.target.value : v,
                  ),
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!i}
              aria-label={`上移类别 ${i + 1}`}
              onClick={() => {
                const next = [...k.classes];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                set({ classes: next });
              }}
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`删除类别 ${i + 1}`}
              onClick={() =>
                set({ classes: k.classes.filter((_, j) => i !== j) })
              }
            >
              ×
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={k.classes.length >= 20}
          onClick={() => set({ classes: [...k.classes, ""] })}
        >
          添加类别
        </Button>
      </section>
      <section className="property-section">
        <h3>矩阵显示</h3>
        {choose(
          "矩阵归一化",
          k.normalization,
          [
            { value: "count", label: "原始计数" },
            { value: "true", label: "按真实类别（行）" },
            { value: "pred", label: "按预测类别（列）" },
            { value: "all", label: "按全部有效样本" },
          ],
          (normalization) =>
            set({ normalization: normalization as typeof k.normalization }),
        )}
        {choose(
          "矩阵模型",
          k.seriesId || visible[0]?.id || "",
          visible.map((s) => ({ value: s.id, label: s.name })),
          (seriesId) => set({ seriesId }),
        )}
        {choose(
          "矩阵分组",
          k.groupValue || JSON.stringify(groups[0]),
          groups.map((g) => ({
            value: JSON.stringify(g),
            label: c.group ? String(g ?? "缺失") : "全部",
          })),
          (groupValue) => set({ groupValue }),
        )}
        <p className="tiny-note">
          归一化仅改变显示，计数与指标不变；零分母显示
          —。底部报告列出所有可见模型与分组，支持每类、macro、micro 与 weighted
          指标。
        </p>
      </section>
      <SamplingPanel config={c} data={data} onChange={onChange} />
    </>
  );
}
