import { useState } from "react";
import {
  api,
  send,
  type Experiment,
  type Dataset,
  type ExperimentStatus,
  type JsonValue,
} from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { ObjectFields } from "./ObjectFields";
export const statuses: Record<ExperimentStatus, string> = {
  planned: "计划中",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
};
export type ExperimentDraft = Pick<
  Experiment,
  | "name"
  | "parameters"
  | "metrics"
  | "notes"
  | "status"
  | "tags"
  | "dataset_version_ids"
> &
  Partial<Pick<Experiment, "id" | "revision">>;
export function ExperimentForm({
  project,
  initial,
  datasets,
  onClose,
  onSaved,
}: {
  project: number;
  initial: ExperimentDraft;
  datasets: Dataset[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [edit, setEdit] = useState(initial);
  const [tagText, setTagText] = useState(initial.tags.join(", "));
  const [search, setSearch] = useState("");
  const [validParams, setValidParams] = useState(true);
  const [validMetrics, setValidMetrics] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const object = (
    key: "parameters" | "metrics",
    value: Record<string, JsonValue>,
  ) => setEdit((e) => ({ ...e, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!validParams || !validMetrics) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/projects/${project}/experiments${edit.id ? `/${edit.id}` : ""}`,
        send(edit.id ? "PUT" : "POST", {
          ...edit,
          tags: tagText
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      wide
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title={edit.id ? "编辑实验记录" : "新建实验记录"}
      description="记录参数、指标和固定的版本，让每次实验都有清楚的来源。"
    >
      <form onSubmit={save}>
        <fieldset disabled={busy} className="experiment-form-body">
          <div className="experiment-basics">
            <label>
              实验名称
              <input
                required
                maxLength={120}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label>
              实验状态
              <select
                aria-label="实验状态"
                value={edit.status}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    status: e.target.value as ExperimentStatus,
                  })
                }
              >
                {Object.entries(statuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            标签
            <input
              placeholder="逗号分隔，例如 baseline, CIFAR-10"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
            />
          </label>
          <ObjectFields
            label="参数"
            value={edit.parameters}
            onChange={(v) => object("parameters", v)}
            onValid={setValidParams}
          />
          <ObjectFields
            label="指标"
            value={edit.metrics}
            onChange={(v) => object("metrics", v)}
            onValid={setValidMetrics}
          />
          <section className="object-fields">
            <div className="form-section-head">
              <h3>关联版本</h3>
              <span>{edit.dataset_version_ids.length} 个已选</span>
            </div>
            <input
              aria-label="搜索关联数据"
              placeholder="按文件名搜索…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="dataset-link-options">
              {datasets
                .filter((d) =>
                  d.filename.toLowerCase().includes(search.toLowerCase()),
                )
                .map((d) => (
                  <label key={d.id}>
                    <input
                      type="checkbox"
                      aria-label={`关联 ${d.filename} v${d.version}`}
                      checked={edit.dataset_version_ids.includes(d.id)}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          dataset_version_ids: e.target.checked
                            ? [...edit.dataset_version_ids, d.id]
                            : edit.dataset_version_ids.filter(
                                (id) => id !== d.id,
                              ),
                        })
                      }
                    />
                    <span>
                      {d.filename}
                      <small>
                        版本 {d.version} · {d.row_count} 行 ·{" "}
                        {d.sha256.slice(0, 10)}
                      </small>
                    </span>
                  </label>
                ))}
              {!datasets.length && (
                <p className="field-help">
                  项目尚无数据，可先保存实验，再导入文件并关联。
                </p>
              )}
            </div>
          </section>
          <label>
            备注
            <textarea
              aria-label="备注"
              maxLength={30000}
              value={edit.notes}
              onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            disabled={
              busy || !validParams || !validMetrics || !edit.name.trim()
            }
          >
            {busy ? "保存中…" : "保存记录"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
