import {
  AlertTriangle,
  ChartCandlestick,
  ChartNoAxesCombined,
  Check,
  History,
  Table2,
} from "lucide-react";
import { DataTable } from "../../components/DataTable";
import { type Dataset } from "../../lib/api";
import { ClassificationResults } from "../ClassificationResults";
import { EvaluationResults } from "../EvaluationResults";
import { type Config } from "../model";
import { usePlotRenderer } from "./usePlotRenderer";

type BottomDrawerProps = {
  evaluation: boolean;
  bottom: string;
  setBottom: React.Dispatch<React.SetStateAction<string>>;
  c: Config;
  plot: ReturnType<typeof usePlotRenderer>["plot"];
  empirical: boolean;
  plotPending: boolean;
  renderConfig: Config;
  project: number;
  data: Dataset;
  logs: string[];
};
export function BottomDrawer({
  evaluation,
  bottom,
  setBottom,
  c,
  plot,
  empirical,
  plotPending,
  renderConfig,
  project,
  data,
  logs,
}: BottomDrawerProps) {
  return (
    <>
      <div className="bottom-tabs">
        {evaluation && (
          <button
            className={bottom === "evaluation" ? "active" : ""}
            onClick={() =>
              setBottom(bottom === "evaluation" ? "" : "evaluation")
            }
          >
            <ChartNoAxesCombined size={14} />
            模型评估
            <span>
              {c.type === "confusion"
                ? plot.classificationReports.length
                : plot.metrics.length}
            </span>
          </button>
        )}
        {(c.type === "box" || c.type === "violin" || empirical) && (
          <button
            className={bottom === "samples" ? "active" : ""}
            onClick={() => setBottom(bottom === "samples" ? "" : "samples")}
          >
            <ChartCandlestick size={14} />
            样本检查<span>{plot.summaries.length}</span>
          </button>
        )}
        <button
          className={bottom === "data" ? "active" : ""}
          onClick={() => setBottom(bottom === "data" ? "" : "data")}
        >
          <Table2 size={14} />
          数据预览<span>{plot.shownRows}</span>
        </button>
        <button
          className={bottom === "warnings" ? "active" : ""}
          onClick={() => setBottom(bottom === "warnings" ? "" : "warnings")}
        >
          <AlertTriangle size={14} />
          告警
          <span className={plot.warnings.length ? "warning-count" : ""}>
            {plot.warnings.length}
          </span>
        </button>
        <button
          className={bottom === "log" ? "active" : ""}
          onClick={() => setBottom(bottom === "log" ? "" : "log")}
        >
          <History size={14} />
          操作记录
        </button>
        <span className="bottom-status">
          <span className="green-dot" />
          {plotPending ? "正在更新预览…" : "实时画布"}
        </span>
      </div>
      {bottom && (
        <div
          className="bottom-content"
          aria-busy={plotPending}
          inert={plotPending}
        >
          {bottom === "evaluation" ? (
            c.type === "confusion" ? (
              <ClassificationResults
                reports={plot.classificationReports}
                config={renderConfig}
                project={project}
              />
            ) : (
              <EvaluationResults metrics={plot.metrics} config={renderConfig} />
            )
          ) : bottom === "samples" ? (
            <>
              <p className="sample-summary-note">
                按当前过滤、分箱范围与对数轴统计；缺失与排除分开列出，均不作为零。汇总数据不能替代逐次观测。
              </p>
              <table className="lf-table sample-summary">
                <thead>
                  <tr>
                    {[
                      "子图",
                      "序列",
                      "类别",
                      "有效 n",
                      "缺失",
                      "排除",
                      "最小值",
                      "最大值",
                    ].map((title, i) => (
                      <th key={title} className={i >= 3 ? "num" : ""}>{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plot.summaries.map((row, i) => (
                    <tr key={i}>
                      <td>{row.panel || "单图"}</td>
                      <td>{row.series}</td>
                      <td>{row.category}</td>
                      <td className="num">{row.n}</td>
                      <td className="num">{row.missing}</td>
                      <td className="num">{row.excluded}</td>
                      <td className="num">{row.min ?? "—"}</td>
                      <td className="num">{row.max ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : bottom === "data" ? (
            <DataTable data={data} />
          ) : bottom === "warnings" ? (
            plot.warnings.length ? (
              plot.warnings.map((w) => (
                <div className="warning" key={w}>
                  {w}
                </div>
              ))
            ) : (
              <p className="subtle">
                没有数据告警。缺失值按断点展示，不自动插值。
              </p>
            )
          ) : (
            logs.map((l, i) => (
              <p className="log-line" key={i}>
                <Check size={12} />
                {l}
              </p>
            ))
          )}
        </div>
      )}
    </>
  );
}
