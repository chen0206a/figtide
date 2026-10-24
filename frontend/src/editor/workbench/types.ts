import type { Dataset } from "../../lib/api";
import type { Config } from "../model";
export type StoredChart = {
  id: number;
  revision: number;
  name: string;
  config: Config;
};
export type ChartVersion = {
  version: number;
  created_at: string;
  config: Config;
};
export type EditorProps = {
  project: number;
  projectName: string;
  datasets: Dataset[];
  chartId: number | null;
  initialDataset: number;
  onSaved: (id: number) => void;
  onUpload: () => void;
  onLeaveGuard: (guard: (() => boolean) | null) => void;
  notify: (s: string) => void;
};
export type WorkbenchProps = EditorProps & {
  data: Dataset;
  original?: StoredChart;
  onDataset: (id: number) => void;
};
