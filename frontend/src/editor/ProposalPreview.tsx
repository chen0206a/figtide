import { ArrowRight } from "lucide-react";
import type { Dataset } from "../lib/api";
import type { Config } from "./model";
import { StylePreview } from "./StylePreview";
import { changeLabel, displayToolValue, type ToolPreview } from "./figureTools";

/** Shared rendering for manual and agent proposals. Applying is always owned by the editor. */
export function ProposalPreview(p: {
  config: Config;
  data: Dataset;
  preview?: ToolPreview | null;
}) {
  return (
    <div className="quick-result-scroll">
      <div className="quick-result-heading">
        <h3>{p.preview ? "调整后预览" : "当前画布"}</h3>
        <span>
          {p.preview ? `${p.preview.changes.length} 处变化` : "尚未应用"}
        </span>
      </div>
      <StylePreview config={p.preview?.config || p.config} data={p.data} />
      {!p.preview ? (
        <p className="quick-actions-note">预览不会保存或修改当前图表。</p>
      ) : !p.preview.changes.length ? (
        <p className="quick-actions-note">这些设置与当前画布相同，无需应用。</p>
      ) : (
        <ul className="quick-changes" aria-label="修改明细">
          {p.preview.changes.map((v) => (
            <li key={v.path}>
              <strong>{changeLabel(v.path, p.config)}</strong>
              <span>
                <del>
                  {displayToolValue(v.before, v.path.split("/").at(-1))}
                </del>
                <ArrowRight size={12} />
                {displayToolValue(v.after, v.path.split("/").at(-1))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
