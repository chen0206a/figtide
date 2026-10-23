import { SourceProvenance } from "../../experiments/SourceProvenance";
import { type Dataset } from "../../lib/api";
import "../styles-library.css";

type FigureSourceStripProps = {
  data: Dataset;
  project: number;
};
export function FigureSourceStrip({ data, project }: FigureSourceStripProps) {
  if (!data.source_meta) return null;
  return (
    <div className="provenance-strip">
      <SourceProvenance source={data.source_meta} project={project} />
      <span>
        {data.source_meta.kind === "data_processing"
          ? "基于固定数据版本和显式处理规则 · 原始数据保持不变"
          : "指标来自固定实验快照 · 后续修改实验不会影响此图"}
      </span>
    </div>
  );
}
