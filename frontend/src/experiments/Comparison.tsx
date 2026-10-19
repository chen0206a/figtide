import { useState } from "react";
import { api, send, type Dataset, type Experiment } from "../lib/api";
import { Button } from "../components/ui/button";
import { statuses } from "./ExperimentForm";
import { delta, display, numeric, stable, formatDelta } from "./compare";
export function Comparison({
  project,
  records,
  onClose,
  onRefresh,
  onGenerated,
}: {
  project: number;
  records: Experiment[];
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
  onGenerated: (data: Dataset) => void | Promise<void>;
}) {
  const keys = (kind: "parameters" | "metrics") =>
    [...new Set(records.flatMap((r) => Object.keys(r[kind])))].sort();
  const metricKeys = keys("metrics");
  const candidates = metricKeys.filter(
    (k) => records.filter((r) => numeric(r.metrics[k]) !== null).length >= 2,
  );
  const [baseline, setBaseline] = useState(records[0].id);
  const base = records.find((r) => r.id === baseline) || records[0];
  const [metric, setMetric] = useState(candidates[0] || "");
  const [directions, setDirections] = useState<
    Record<string, "higher" | "lower">
  >({});
  const [chartType, setChartType] = useState<"bar" | "scatter">("bar");
  const [differences, setDifferences] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const result = await api<Dataset>(
        `/projects/${project}/comparisons`,
        send("POST", {
          experiments: records.map((r) => ({ id: r.id, revision: r.revision })),
          baseline_id: base.id,
          metric,
          direction: directions[metric] || "higher",
          chart_type: chartType,
        }),
      );
      await onGenerated(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const different = (key: string) =>
    new Set(records.map((r) => stable(r.parameters[key]))).size > 1;
  return (
    <section className="comparison-workspace">
      <div className="comparison-heading">
        <div>
          <span className="page-eyebrow">EXPERIMENT COMPARISON</span>
          <h2>让每一次变化，都有依据。</h2>
          <p>{records.length} 个实验 · 参数差异与指标差值 · 缺失结果保持缺失</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={onClose}>
          返回实验列表
        </Button>
      </div>
      <fieldset disabled={busy} className="compare-controls">
        <label>
          基线实验
          <select
            value={base.id}
            onChange={(e) => setBaseline(Number(e.target.value))}
          >
            {records.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          绘图指标
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {!candidates.length && <option value="">没有足够的数值指标</option>}
            {candidates.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          图表类型
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as "bar" | "scatter")}
          >
            <option value="bar">柱状图</option>
            <option value="scatter">散点图（实验类别轴）</option>
          </select>
        </label>
        <Button disabled={!candidates.includes(metric)} onClick={generate}>
          {busy ? "正在保存来源快照…" : "生成对比图"}
        </Button>
      </fieldset>
      <p className="field-help">
        每次绘制一个指标，请确认各实验使用相同的评估口径与单位。差值为当前值减基线值，颜色按该行的优劣方向标记。
      </p>
      {error && (
        <div className="inline-error" role="alert">
          {error}
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await onRefresh();
              setError("");
            }}
          >
            刷新实验后重试
          </Button>
        </div>
      )}
      <div className="comparison-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>实验与来源</th>
              {records.map((r) => (
                <th key={r.id}>
                  <strong>{r.name}</strong>
                  <small>
                    {r.id === base.id ? "基线 · " : ""}
                    {statuses[r.status]} · 修订 {r.revision}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>关联数据版本</th>
              {records.map((r) => (
                <td key={r.id}>
                  {r.datasets.length
                    ? r.datasets.map((d) => (
                        <div key={d.dataset_version_id}>
                          {d.filename} · v{d.version}
                        </div>
                      ))
                    : "尚未关联"}
                </td>
              ))}
            </tr>
            <tr className="comparison-section">
              <th colSpan={records.length + 1}>
                <span>参数差异</span>
                <label>
                  <input
                    type="checkbox"
                    checked={differences}
                    onChange={(e) => setDifferences(e.target.checked)}
                  />
                  只看不同参数
                </label>
              </th>
            </tr>
            {keys("parameters")
              .filter((k) => !differences || different(k))
              .map((k) => (
                <tr
                  key={`p-${k}`}
                  className={different(k) ? "parameter-diff" : ""}
                >
                  <th>
                    {k}
                    {different(k) && <small>有差异</small>}
                  </th>
                  {records.map((r) => (
                    <td key={r.id} title={display(r.parameters[k])}>
                      {display(r.parameters[k])}
                    </td>
                  ))}
                </tr>
              ))}
            <tr className="comparison-section">
              <th colSpan={records.length + 1}>指标与基线差值</th>
            </tr>
            {metricKeys.map((k) => (
              <tr key={`m-${k}`}>
                <th>
                  {k}
                  <select
                    aria-label={`${k} 优劣方向`}
                    value={directions[k] || "higher"}
                    onChange={(e) =>
                      setDirections({
                        ...directions,
                        [k]: e.target.value as "higher" | "lower",
                      })
                    }
                  >
                    <option value="higher">越大越好</option>
                    <option value="lower">越小越好</option>
                  </select>
                </th>
                {records.map((r) => {
                  const change = delta(r.metrics[k], base.metrics[k]);
                  const good =
                    change !== null &&
                    (directions[k] === "lower" ? change < 0 : change > 0);
                  return (
                    <td key={r.id}>
                      <strong>{display(r.metrics[k])}</strong>
                      {r.id === base.id ? (
                        <small>基线</small>
                      ) : (
                        <small
                          className={
                            change === null || change === 0
                              ? ""
                              : good
                                ? "metric-better"
                                : "metric-worse"
                          }
                        >
                          {change === null
                            ? "不可计算差值"
                            : `${formatDelta(change)}${change === 0 ? " · 相同" : good ? " · 改善" : " · 下降"}`}
                        </small>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!metricKeys.length && (
              <tr>
                <td colSpan={records.length + 1}>
                  尚无指标，请先填写实验结果。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
