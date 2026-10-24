import { useState } from "react";
import type { Config } from "./model";
import type { Dataset } from "../lib/api";
import FigurePreview from "./FigurePreview";
import { PreviewWarnings } from "./PreviewWarnings";
export function StylePreview({
  config,
  data,
}: {
  config: Config;
  data: Dataset;
}) {
  const [warnings, setWarnings] = useState<string[]>([]);
  return (
    <>
      <div className="style-preview">
        <FigurePreview
          config={config}
          data={data}
          maxHeight={220}
          label="当前数据样式预览"
          onWarnings={setWarnings}
        />
      </div>
      <PreviewWarnings warnings={warnings} />
    </>
  );
}
