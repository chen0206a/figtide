import type { Config } from "./model";
import type { EvaluationMetric } from "./evaluation";
import { Button } from "../components/ui/button";
export function EvaluationResults({
  metrics,
  config,
}: {
  metrics: EvaluationMetric[];
  config: Config;
}) {
  const number = (n: number | null) =>
    n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(4);
  const columns: [keyof EvaluationMetric, string][] = [
    ["panel", "子图"],
    ["series", "序列"],
    ["group", "分组"],
    ["n", "有效 n"],
    ["positive", "正例"],
    ["negative", "负例"],
    ["excluded", "排除"],
    ["ownMissing", "自身缺失"],
    ["excludedByOthers", "共同样本额外排除"],
    ["auc", "ROC AUC"],
    ["ap", "AP"],
    ["threshold", "阈值"],
    ["tp", "TP"],
    ["fp", "FP"],
    ["tn", "TN"],
    ["fn", "FN"],
    ["precision", "Precision"],
    ["recall", "Recall"],
    ["f1", "F1"],
    ["accuracy", "Accuracy"],
  ];
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schema_version: 1,
              datasetVersionId: config.datasetVersionId,
              evaluation: config.evaluation,
              sampling: config.sampling || { policy: "independent", id: "" },
              series: config.series.map((s) => ({
                id: s.id,
                name: s.name,
                score: s.y,
                visible: s.visible,
              })),
              group: config.group,
              facet: config.facet,
              transforms: config.transforms,
              metrics,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "labflow-evaluation.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="evaluation-results">
      <div className="evaluation-results-head">
        <p className="sample-summary-note">
          基于当前过滤后的真实标签与分数。排除数含缺失；— 表示未定义。AP
          不是梯形 PR AUC。
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={!metrics.length}
          onClick={download}
        >
          导出评估 JSON
        </Button>
      </div>
      {!metrics.length ? (
        <p className="subtle">请在专业面板配置二分类标签及正类，并检查告警。</p>
      ) : (
        <table className="sample-summary" aria-label="模型评估指标">
          <thead>
            <tr>
              {columns.map(([k, title]) => (
                <th key={k}>{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, i) => (
              <tr key={i}>
                {columns.map(([k]) => (
                  <td key={k}>
                    {typeof m[k] === "string"
                      ? m[k] || "单图"
                      : number(m[k] as number | null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
