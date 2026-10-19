import { useState } from "react";
import type { ProcessingSource } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
export function ProcessingProvenance({
  source,
  project,
}: {
  source: ProcessingSource;
  project: number;
}) {
  const [open, setOpen] = useState(false);
  const s = source.source,
    r = source.rules;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        数据处理来源
      </Button>
      <Dialog
        wide
        open={open}
        onOpenChange={setOpen}
        title="数据处理来源"
        description="以下来源与规则随派生数据版本保存，源文件不会被处理操作覆盖。"
      >
        <div className="source-summary">
          <strong>
            {s.filename} · v{s.version}
          </strong>
          <span>{r.mode === "aggregate" ? "分组统计" : "筛选与排序"}</span>
          <span>{new Date(source.created_at).toLocaleString()}</span>
        </div>
        <p>
          源版本 #{s.datasetVersionId} · 内容指纹 {s.sha256}
        </p>
        <p>
          源数据 {source.counts.source_rows} 行 · 过滤后{" "}
          {source.counts.filtered_rows} 行 · 总排除{" "}
          {source.counts.excluded_rows} 行 · 结果 {source.counts.output_rows} 行
        </p>
        {r.mode === "aggregate" && (
          <>
            <p>
              分组：{r.groupBy.join("、") || "全部观测"}；指标：
              {r.metrics.join("、")}
            </p>
            <p>
              每行观测单位：{r.observationUnit}；重复标识：
              {r.replicate || "未校验"}
            </p>
            <p>
              误差口径：
              {r.error === "none" ? "不显示误差" : r.error.toUpperCase()}。SD
              采用 n−1；SEM=SD/√n，不代表置信区间。
            </p>
          </>
        )}
        <p>
          排序：
          {r.sort.length
            ? r.sort
                .map(
                  (s) =>
                    `${s.field} ${s.direction === "asc" ? "升序" : "降序"}`,
                )
                .join(" → ")
            : "未排序，保留原顺序"}
          ；缺失始终最后。
        </p>
        <Button variant="outline" asChild>
          <a
            href={`/api/projects/${project}/data/${s.datasetVersionId}/original`}
          >
            下载源文件
          </a>
        </Button>
        <details>
          <summary>完整计算规则与统计列映射</summary>
          <pre>
            {JSON.stringify(
              {
                algorithm: source.algorithm,
                rules: r,
                statistics: source.statistics,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </Dialog>
    </>
  );
}
