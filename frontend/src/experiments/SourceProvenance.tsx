import { useState } from "react";
import type { ComparisonSource } from "../lib/api";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
export function SourceProvenance({
  source,
  project,
}: {
  source: ComparisonSource | null | undefined;
  project: number;
}) {
  const [open, setOpen] = useState(false);
  if (!source || source.kind !== "experiment_comparison") return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        实验来源快照
      </Button>
      <Dialog
        wide
        open={open}
        onOpenChange={setOpen}
        title="实验来源快照"
        description="以下是生成对比数据时保存的记录。实验后续修改不会改变这份快照。"
      >
        <div className="source-summary">
          <strong>{source.metric}</strong>
          <span>{source.direction === "higher" ? "越大越好" : "越小越好"}</span>
          <span>{new Date(source.created_at).toLocaleString()}</span>
        </div>
        {source.missing_count > 0 && (
          <p className="import-warning">
            {source.missing_count}{" "}
            个实验没有该指标的有效数值，在图表中保持缺失。
          </p>
        )}
        {source.experiments.map((r) => (
          <section className="source-experiment" key={r.id}>
            <h3>
              {r.name} {r.id === source.baseline_id && <small>基线实验</small>}
            </h3>
            <p>
              实验 #{r.id} · 修订 {r.revision}
            </p>
            <details>
              <summary>参数、指标与备注</summary>
              <pre>
                {JSON.stringify(
                  {
                    parameters: r.parameters,
                    metrics: r.metrics,
                    notes: r.notes,
                    tags: r.tags,
                    status: r.status,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <div className="source-files">
              {r.datasets.map((d) => (
                <a
                  key={d.dataset_version_id}
                  href={`/api/projects/${project}/data/${d.dataset_version_id}/original`}
                >
                  {d.filename} · v{d.version}
                  <small>下载原文件 · 内容指纹 {d.sha256}</small>
                </a>
              ))}
              {!r.datasets.length && <small>生成快照时未关联数据文件</small>}
            </div>
          </section>
        ))}
      </Dialog>
    </>
  );
}
