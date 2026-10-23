import { useState } from "react";
import type { ClassificationReport } from "./classification";
import type { Config } from "./model";
import { api, send } from "../lib/api";
import { Button } from "../components/ui/button";
export function ClassificationResults({
  reports,
  config,
  project,
}: {
  reports: ClassificationReport[];
  config: Config;
  project: number;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const f = (value: number | null) =>
    value == null ? "—" : Number.isInteger(value) ? value : value.toFixed(4);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const report = await api(
        `/projects/${project}/classification/report`,
        send("POST", { config }),
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "labflow-classification.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="evaluation-results">
      <div className="evaluation-results-head">
        <p className="sample-summary-note">
          行=真实类别，列=预测类别。指标始终基于原始计数；— 为未定义。JSON
          报告由本地服务按同一配置重新计算。macro 传播未定义值，weighted
          按真实 support 计权；micro 在完整单标签分类中等于 accuracy。
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !reports.length}
          onClick={download}
        >
          {busy ? "正在核算…" : "导出分类报告 JSON"}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!reports.length && (
        <p>请在专业面板选择真实标签、类别顺序，并为模型映射预测字段。</p>
      )}
      {reports.map((r, i) => (
        <section className="classification-report" key={i}>
          <strong>
            {r.series} · {r.group} · n={r.n} · Accuracy {f(r.accuracy)}
          </strong>
          <p className="sample-summary-note">
            自身缺失 {r.ownMissing} 行 · 共同样本额外排除 {r.excludedByOthers}{" "}
            行 · 总排除 {r.excluded}
          </p>
          <table className="lf-table sample-summary" aria-label={`${r.series} 分类指标`}>
            <thead>
              <tr>
                {[
                  "类别 / 平均",
                  "Support",
                  "Predicted",
                  "Precision",
                  "Recall",
                  "F1",
                ].map((v, i) => (
                  <th key={v} className={i ? "num" : ""}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.perClass.map((m) => (
                <tr key={m.label}>
                  <td className="num">{m.label}</td>
                  <td className="num">{m.support}</td>
                  <td className="num">{m.predicted}</td>
                  <td className="num">{f(m.precision)}</td>
                  <td className="num">{f(m.recall)}</td>
                  <td className="num">{f(m.f1)}</td>
                </tr>
              ))}
              {(["macro", "micro", "weighted"] as const).map((a) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">—</td>
                  <td className="num">{f(r[a].precision)}</td>
                  <td className="num">{f(r[a].recall)}</td>
                  <td className="num">{f(r[a].f1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

