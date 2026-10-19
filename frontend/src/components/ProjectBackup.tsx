import { useState } from "react";
import { api, type Project } from "../lib/api";
import { Button } from "./ui/button";
import { downloadBlob } from "../lib/download";
type Preview = {
  name: string;
  counts: Record<string, number>;
  original_bytes: number;
};
export function ProjectBackup({
  projects,
  onUpdated,
  currentProject,
}: {
  projects: Project[];
  onUpdated: () => void;
  currentProject?: number;
}) {
  const [project, setProject] = useState(
    projects.find((p) => p.id === currentProject)?.id ||
      projects.find((p) => !p.archived)?.id ||
      projects[0]?.id ||
      0,
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function body(f: File) {
    const form = new FormData();
    form.append("file", f);
    return form;
  }
  return (
    <section className="project-backup" aria-label="项目备份与恢复">
      <h3>项目备份与恢复</h3>
      <p className="tiny-note">
        包含原始文件、数据与图表的全部版本、实验关联及本项目创建的样式模板。保存在本机的未提交草稿不包含在备份内。
      </p>
      <label>
        备份项目
        <select
          aria-label="备份项目"
          value={project}
          onChange={(e) => setProject(Number(e.target.value))}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={busy || !project}
        variant="outline"
        onClick={() =>
          run(async () => {
            const res = await fetch(`/api/projects/${project}/backup`);
            if (!res.ok) {
              throw new Error((await res.json()).message || "备份失败");
            }
            downloadBlob(
              await res.blob(),
              `labflow-project-${project}.labflow.zip`,
            );
            setDone("项目备份已下载；请保存在工作区以外的位置。");
          })
        }
      >
        {busy ? "处理中…" : "下载项目备份"}
      </Button>
      <label>
        选择项目备份
        <input
          aria-label="选择项目备份"
          type="file"
          accept=".zip"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFile(null);
            setPreview(null);
            setDone("");
            setError("");
            if (!f) return;
            if (f.size > 64 * 1024 * 1024) {
              setError("备份文件超过 64 MiB");
              return;
            }
            void run(async () => {
              const result = await api<Preview>("/backups/preview", {
                method: "POST",
                body: body(f),
              });
              setFile(f);
              setPreview(result);
              setName(`${result.name.slice(0, 110)} · 恢复`);
            });
          }}
        />
      </label>
      {preview && (
        <div className="export-summary">
          <b>{preview.name}</b>
          <p>
            {preview.counts.experiments} 条实验 ·{" "}
            {preview.counts.dataset_versions} 个数据版本 ·{" "}
            {preview.counts.charts} 张图 / {preview.counts.chart_versions}{" "}
            个快照 · {preview.counts.style_templates} 个样式
          </p>
          <small>
            原文件合计 {(preview.original_bytes / 1024).toFixed(1)}{" "}
            KiB。内容校验已通过，校验和不代表来源可信。
          </small>
          <label>
            恢复项目名称
            <input
              aria-label="恢复项目名称"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            disabled={busy || !name.trim() || !file}
            onClick={() =>
              run(async () => {
                const form = body(file!);
                form.append("name", name);
                const result = await api("/backups/restore", {
                  method: "POST",
                  body: form,
                });
                setPreview(null);
                setFile(null);
                onUpdated();
                setDone(
                  `已创建「${result.name}」，可从项目列表打开。原项目保持不变。`,
                );
              })
            }
          >
            恢复为新项目
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {done && <p role="status">{done}</p>}
    </section>
  );
}
