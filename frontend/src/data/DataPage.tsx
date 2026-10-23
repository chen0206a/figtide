import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Database,
  ArrowUpRight,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  Layers,
} from "lucide-react";
import { api, type Dataset } from "../lib/api";
import { Button } from "../components/ui/button";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { SourceProvenance } from "../experiments/SourceProvenance";
import { ProcessingDialog } from "../processing/ProcessingDialog";
import "./data-page.css";
const ChartPlanner = lazy(() => import("../components/ChartPlanner"));
export function DataPage({
  project,
  selected,
  onSelect,
  datasets,
  loading,
  error,
  onRetry,
  onUpload,
  busy,
  onPlot,
  onChartCreated,
  onProcessed,
}: {
  project: number;
  selected: number;
  onSelect: (id: number) => void;
  datasets: Dataset[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onUpload: (id?: number | null) => void;
  busy: boolean;
  onPlot: () => void;
  onChartCreated: (id: number) => void;
  onProcessed: (data: Dataset, plot: boolean) => void;
}) {
  const [processing, setProcessing] = useState<Dataset | null>(null);
  const [planning, setPlanning] = useState<Dataset | null>(null);
  const id = selected || datasets[0]?.id;
  const detail = useQuery({
    queryKey: ["data", project, id],
    queryFn: () => api<Dataset>(`/projects/${project}/data/${id}`),
    enabled: !!id,
  });
  useEffect(() => {
    if (!selected && id) onSelect(id);
  }, [id, selected, onSelect]);
  return (
    <>
      <PageHeader
        title="数据管理"
        description="原始文件只读保存，每次更新追加为新版本。"
        actions={
          <Button disabled={busy} onClick={() => onUpload()}>
            <Upload size={16} />
            {busy ? "解析中…" : "上传数据文件"}
          </Button>
        }
      />
      {loading ? (
        <p>正在加载数据…</p>
      ) : error ? (
        <div className="empty-inline">
          {error}
          <Button onClick={onRetry}>重试</Button>
        </div>
      ) : datasets.length ? (
        <div className="data-layout">
          <aside className="dataset-list">
            <h3>
              数据版本 <span>{datasets.length}</span>
            </h3>
            {datasets.map((d) => (
              <button
                key={d.id}
                className={id === d.id ? "active" : ""}
                onClick={() => onSelect(d.id)}
              >
                <FileSpreadsheet size={18} />
                <span>
                  <b className="lf-mono">{d.filename}</b>
                  <small className="lf-mono">
                    v{d.version} · {d.row_count} 行
                  </small>
                </span>
              </button>
            ))}
          </aside>
          <section className="data-detail">
            {detail.isPending ? (
              <p>正在读取数据…</p>
            ) : detail.isError ? (
              <div className="empty-inline">
                {detail.error.message}
                <Button onClick={() => detail.refetch()}>重试</Button>
              </div>
            ) : (
              detail.data && (
                <>
                  <div className="data-title">
                    <div>
                      <h2>{detail.data.filename}</h2>
                      <span className="muted">
                        版本 {detail.data.version} · 内容指纹{" "}
                        {detail.data.sha256.slice(0, 12)}…
                      </span>
                    </div>
                    <div className="button-row">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProcessing(detail.data)}
                      >
                        处理与统计
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onUpload(detail.data.dataset_id)}
                      >
                        <Layers size={14} />
                        新版本
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/projects/${project}/data/${id}/original`}
                        >
                          {detail.data.source_meta?.kind === "data_processing"
                            ? "结果 CSV"
                            : "原始文件"}
                        </a>
                      </Button>
                      <Button size="sm" onClick={onPlot}>
                        用于绘图 <ArrowUpRight size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="planner-entry">
                    <div>
                      <b>数据已就绪，下一步选择怎样表达。</b>
                      <p>让助手推荐图型，或自己选择字段，先预览再创建。</p>
                    </div>
                    <Button onClick={() => setPlanning(detail.data)}>
                      选择绘图方案 <ArrowRight size={15} />
                    </Button>
                  </div>
                  <div className="field-pills">
                    {detail.data.fields.map((f) => (
                      <span key={f.name}>
                        <b>{f.type === "number" ? "#" : "Aa"}</b>
                        {f.name}
                        <small>
                          {f.type === "number" ? "数值" : "文本"}
                          {f.missing ? ` · ${f.missing} 个空值` : ""}
                        </small>
                      </span>
                    ))}
                  </div>
                  {detail.data.warnings.map((w) => (
                    <div className="warning" key={w}>
                      {w}
                    </div>
                  ))}
                  <SourceProvenance
                    project={project}
                    source={detail.data.source_meta}
                  />
                  <DataTable key={id} data={detail.data} />
                </>
              )
            )}
          </section>
        </div>
      ) : (
        <div className="empty-state bordered">
          <Database size={40} />
          <h2>将实验结果带入工作区</h2>
          <p>CSV / TSV / TXT / XLSX / JSON / JSONL · 最多 10 MB / 20,000 行</p>
          <Button disabled={busy} onClick={() => onUpload()}>
            <Upload size={16} />
            选择数据文件
          </Button>
        </div>
      )}
      {processing && (
        <ProcessingDialog
          project={project}
          data={processing}
          onClose={() => setProcessing(null)}
          onSaved={(d, plot) => {
            setProcessing(null);
            onProcessed(d, plot);
          }}
        />
      )}
      {planning && (
        <Suspense fallback={<p role="status">正在打开选图工作区…</p>}>
          <ChartPlanner
            key={`${project}:${planning.id}`}
            project={project}
            data={planning}
            onClose={() => setPlanning(null)}
            onCreated={(id) => {
              setPlanning(null);
              onChartCreated(id);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
