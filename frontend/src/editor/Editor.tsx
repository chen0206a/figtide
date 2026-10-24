import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesCombined, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { WorkbenchSkeleton } from "../components/WorkbenchSkeleton";
import { api, type Dataset } from "../lib/api";
import "./styles-library.css";
import type { EditorProps, StoredChart } from "./workbench/types";
import { Workbench } from "./workbench/Workbench";
export type { ChartVersion, StoredChart } from "./workbench/types";
export default function Editor(p: EditorProps) {
  const existing = useQuery<StoredChart>({
    queryKey: ["chart", p.project, p.chartId],
    queryFn: () =>
      api<StoredChart>(`/projects/${p.project}/charts/${p.chartId}`),
    enabled: !!p.chartId,
    staleTime: 0,
  });
  const chartLoaded = useRef(false);
  const [selected, setSelected] = useState(0);
  const dataId =
    selected ||
    existing.data?.config.datasetVersionId ||
    p.initialDataset ||
    p.datasets[0]?.id;
  const data = useQuery({
    queryKey: ["data", p.project, dataId],
    queryFn: () => api<Dataset>(`/projects/${p.project}/data/${dataId}`),
    enabled: !!dataId,
    placeholderData: (previous) => previous,
  });
  if (
    p.chartId &&
    (existing.isPending || (!chartLoaded.current && existing.isFetching))
  )
    return <WorkbenchSkeleton />;
  if (existing.data && !existing.isFetching) chartLoaded.current = true;
  if (existing.isError)
    return (
      <div className="empty-state">
        <p>{existing.error.message}</p>
        <Button onClick={() => existing.refetch()}>重试</Button>
      </div>
    );
  if (!p.datasets.length)
    return (
      <div className="empty-state editor-empty">
        <div className="empty-art">
          <ChartNoAxesCombined size={64} />
        </div>
        <span className="lf-kicker">从第一份数据开始</span>
        <h1>从数据，走向发现。</h1>
        <p>导入实验结果，开始构建你的第一张科研图表。</p>
        <Button onClick={p.onUpload}>
          <Upload size={16} />
          导入数据文件
        </Button>
        <small>折线 · 分组柱状 · 散点 · 热力图 · 箱线 · 小提琴</small>
      </div>
    );
  if (data.isPending) return <WorkbenchSkeleton />;
  if (data.isError)
    return (
      <div className="empty-state">
        <p>{data.error.message}</p>
        <Button onClick={() => data.refetch()}>重试</Button>
      </div>
    );
  return (
    <Workbench
      {...p}
      data={data.data!}
      original={existing.data}
      onDataset={setSelected}
    />
  );
}
