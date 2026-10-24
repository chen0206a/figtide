import type { Dataset } from "../lib/api";
import {
  defaultEvaluation,
  defaultBand,
  type Config,
  type Series,
} from "./model";
import { SamplingPanel } from "./SamplingPanel";
export function EvaluationPanel({
  config: c,
  data,
  onChange,
}: {
  config: Config;
  data: Dataset;
  onChange: (v: Partial<Config>) => void;
}) {
  if (c.type !== "roc" && c.type !== "pr") return null;
  const e = c.evaluation || defaultEvaluation;
  const set = (v: Partial<typeof e>) =>
    onChange({ evaluation: { ...e, ...v } });
  const labels = [
    ...new Set(
      data.rows
        .filter((r) => r[e.label] != null && r[e.label] !== "")
        .map((r) => String(r[e.label])),
    ),
  ];
  return (
    <>
      <section className="property-section evaluation-panel">
        <span className="professional-kicker">BINARY MODEL EVALUATION</span>
        <h3>从样本，到评估曲线。</h3>
        <p className="tiny-note">
          每行是一份真实样本；各序列 Y
          映射为预测分数。分数越高越倾向正类，不要求为概率。
        </p>
        <label>
          真实标签列
          <select
            aria-label="真实标签列"
            value={e.label}
            onChange={(v) => set({ label: v.target.value })}
          >
            <option value="">请明确选择</option>
            {data.fields.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          正类值
          <select
            aria-label="正类值"
            value={e.positive}
            onChange={(v) => set({ positive: v.target.value })}
          >
            {!labels.includes(e.positive) && (
              <option value={e.positive}>请选择正类</option>
            )}
            {labels.slice(0, 100).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          决策阈值
          <input
            aria-label="决策阈值"
            type="number"
            step="any"
            value={e.threshold}
            onChange={(v) => {
              if (
                v.target.value !== "" &&
                Number.isFinite(Number(v.target.value))
              )
                set({ threshold: Number(v.target.value) });
            }}
          />
        </label>
        <p className="tiny-note">
          分数 ≥ 阈值判为正类。阈值只影响混淆指标，不改变
          AUC/AP。缺失标签或分数明确排除；样本口径由下方策略指定。
        </p>
        <label className="toggle-label">
          显示随机排序参考线
          <input
            type="checkbox"
            role="switch"
            aria-label="显示随机排序参考线"
            checked={e.baseline}
            onChange={(v) => set({ baseline: v.target.checked })}
          />
        </label>
        <label className="toggle-label">
          图例显示 {c.type === "pr" ? "AP" : "AUC"}
          <input
            type="checkbox"
            role="switch"
            aria-label="图例显示评估指标"
            checked={!!e.legendMetric}
            onChange={(v) => set({ legendMetric: v.target.checked })}
          />
        </label>
        <p className="tiny-note">
          ROC AUC 采用梯形积分；AP
          采用逐阈值召回增量加权精确率。并列分数一起处理，PR 阶梯线与 AP
          一致。指标见画布下方「模型评估」。
        </p>
      </section>
      <SamplingPanel config={c} data={data} onChange={onChange} />
    </>
  );
}
export function BandPanel({
  series: s,
  data,
  onChange,
}: {
  series: Series;
  data: Dataset;
  onChange: (v: Partial<Series>) => void;
}) {
  const b = s.band || defaultBand;
  const set = (v: Partial<typeof b>) => onChange({ band: { ...b, ...v } });
  return (
    <section className="property-section">
      <h3>区间带 · 实际上下界</h3>
      <label className="toggle-label">
        显示实际区间带
        <input
          type="checkbox"
          role="switch"
          aria-label="显示实际区间带"
          checked={b.enabled}
          onChange={(v) => set({ enabled: v.target.checked })}
        />
      </label>
      {b.enabled && (
        <>
          {(["lower", "upper"] as const).map((k) => (
            <label key={k}>
              {k === "lower" ? "区间下界列" : "区间上界列"}
              <select
                aria-label={k === "lower" ? "区间下界列" : "区间上界列"}
                value={b[k]}
                onChange={(v) => set({ [k]: v.target.value })}
              >
                <option value="">请选择实际数据列</option>
                {data.fields
                  .filter((f) => f.type === "number")
                  .map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <label>
            区间说明
            <input
              aria-label="区间说明"
              maxLength={120}
              value={b.label}
              onChange={(v) => set({ label: v.target.value })}
            />
          </label>
          <label>
            区间透明度
            <input
              aria-label="区间透明度"
              type="range"
              min={0.05}
              max={0.6}
              step={0.01}
              value={b.opacity}
              onChange={(v) => set({ opacity: Number(v.target.value) })}
            />
          </label>
          <p className="tiny-note">
            使用文件内上下界；不推算置信区间。X
            需按原始顺序严格递增；缺失处断开。启用后保留但不显示误差棒映射。
          </p>
        </>
      )}
    </section>
  );
}
