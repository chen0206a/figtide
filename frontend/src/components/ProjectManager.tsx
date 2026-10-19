import { useState } from "react";
import { api, send, type Project } from "../lib/api";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { ProjectBackup } from "./ProjectBackup";
export function ProjectManager({
  projects,
  onClose,
  onUpdated,
  currentProject,
}: {
  projects: Project[];
  onClose: () => void;
  onUpdated: () => void;
  currentProject: number;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(p: Project) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/projects/${p.id}`,
        send("PUT", {
          name: p.name,
          description: p.description,
          archived: !!p.archived,
        }),
      );
      setEditing(null);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="管理研究项目"
      description="归档后项目将从工作区隐藏，数据与图表仍保留，可随时恢复。"
    >
      <input
        placeholder="搜索项目…"
        aria-label="搜索项目"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {!editing && (
        <ProjectBackup
          projects={projects}
          onUpdated={onUpdated}
          currentProject={currentProject}
        />
      )}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(editing);
          }}
        >
          <label>
            项目名称
            <input
              required
              maxLength={120}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            研究简介
            <textarea
              maxLength={10000}
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
          </label>
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              取消编辑
            </Button>
            <Button disabled={busy || !editing.name.trim()}>保存项目</Button>
          </div>
        </form>
      ) : (
        <div className="manage-list">
          {projects
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((p) => (
              <div key={p.id}>
                <span>
                  {p.name}
                  <small>{p.archived ? "已归档" : "工作区项目"}</small>
                </span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(p)}
                >
                  重命名
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => save({ ...p, archived: !p.archived })}
                >
                  {p.archived ? "恢复" : "归档"}
                </Button>
              </div>
            ))}
        </div>
      )}
    </Dialog>
  );
}
