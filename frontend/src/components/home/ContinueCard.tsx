import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import type { Config } from "../../editor/model";
import { api, type Dataset } from "../../lib/api";
import "./home.css";
import { localDraftInfo, relativeTime, type ChartSummary } from "./homeData";

const FigurePreview = lazy(() => import("../../editor/FigurePreview"));
type ChartDetail = {
  id: number;
  name: string;
  revision: number;
  updated_at: string;
  dataset_version_id: number;
  config: Config;
};
export function ContinueCard({
  project,
  projectName,
  chart,
  onOpen,
}: {
  project: number;
  projectName: string;
  chart: ChartSummary;
  onOpen: () => void;
}) {
  // Same query keys as the editor, so opening the chart reuses this cache.
  const detail = useQuery({
    queryKey: ["chart", project, chart.id],
    queryFn: () => api<ChartDetail>(`/projects/${project}/charts/${chart.id}`),
  });
  const versionId =
    detail.data?.config.datasetVersionId || detail.data?.dataset_version_id;
  const data = useQuery({
    queryKey: ["data", project, versionId],
    queryFn: () => api<Dataset>(`/projects/${project}/data/${versionId}`),
    enabled: !!versionId,
  });
  const [draft, setDraft] = useState(() =>
    localDraftInfo(localStorage, project, chart.id),
  );
  useEffect(() => {
    setDraft(localDraftInfo(localStorage, project, chart.id));
  }, [project, chart.id, chart.revision]);
  const c = detail.data?.config;
  const spec = c
    ? `FIGURE ${String(chart.id).padStart(2, "0")} · ${c.type.toUpperCase()} · ${c.style.preset.toUpperCase()}`
    : `FIGURE ${String(chart.id).padStart(2, "0")}`;
  return (
    <article className="home-card home-continue" aria-label="继续上次的图表">
      <header className="home-continue-head">
        <span className="lf-kicker">{spec}</span>
        {draft ? (
          <span className="lf-chip" data-tone="warning">
            <span className="lf-dot is-warning" />
            本机草稿 · 有未保存修改
          </span>
        ) : (
          <span className="lf-chip" data-tone="success">
            已保存 v{chart.revision}
          </span>
        )}
      </header>
      <div className="home-continue-figure">
        {detail.isError || data.isError ? (
          <div className="home-figure-message" role="alert">
            预览暂时无法生成：{(detail.error || data.error)?.message}
          </div>
        ) : c && data.data ? (
          <Suspense fallback={<div className="home-figure-skeleton" />}>
            <FigurePreview
              config={c}
              data={data.data}
              maxHeight={340}
              label={`${chart.name} 的预览`}
            />
          </Suspense>
        ) : (
          <div
            className="home-figure-skeleton"
            role="status"
            aria-label="正在载入预览"
          />
        )}
      </div>
      <footer className="home-continue-foot">
        <div className="home-continue-meta">
          <h2 title={chart.name}>{chart.name}</h2>
          <p>
            {projectName}
            {data.data && (
              <>
                {" · "}
                <span className="lf-mono">
                  {data.data.filename} v{data.data.version}
                </span>
              </>
            )}
            {" · "}
            {relativeTime(draft?.at || chart.updated_at)}
            {draft ? "编辑" : "保存"}
          </p>
        </div>
        <button
          type="button"
          className="home-btn home-btn-primary"
          onClick={onOpen}
        >
          继续编辑 <ArrowRight size={16} aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}
