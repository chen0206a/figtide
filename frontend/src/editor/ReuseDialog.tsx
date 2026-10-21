import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, send, type Dataset } from "../lib/api";
import type { Config } from "./model";
import { applyStyle, bindings, reuseConfig, type StyleProfile } from "./reuse";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  Check,
  FolderOpen,
  Palette,
  Bookmark,
} from "lucide-react";
import { applyPreset, stylePresets, styleProfile } from "./stylePresets";
import { StyleThumbnail } from "./StyleThumbnail";
import { StylePreview } from "./StylePreview";
import "./styles-library.css";
type Template = {
  id: number;
  project_id: number;
  name: string;
  project_name: string;
  profile: StyleProfile;
};
export function ReuseDialog(p: {
  project: number;
  config: Config;
  name: string;
  datasets: Dataset[];
  data?: Dataset;
  initialTab?: "builtin" | "style";
  initialPreset?: string;
  onClose: () => void;
  onApply: (c: Config) => void;
  onReused: (chart: any) => void;
}) {
  const [tab, setTab] = useState<"builtin" | "style" | "reuse">(
    p.initialTab || "style",
  );
  const [scope, setScope] = useState("current");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(9);
  const [selected, setSelected] = useState<number | string>(
    p.initialPreset || p.config.style.preset,
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [rename, setRename] = useState("");
  const [removing, setRemoving] = useState<Template | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState(`${p.name.slice(0, 100)} · 样式`);
  const [copyName, setCopyName] = useState(`${p.name.slice(0, 100)} · 复用`);
  const [target, setTarget] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const templates = useQuery({
    queryKey: ["style-templates"],
    queryFn: () => api<Template[]>("/style-templates"),
  });
  const data = p.datasets.find((d) => d.id === target);
  const refs = bindings(p.config);
  // Dataset list entries contain metadata only; use the loaded active version's rows.
  const source =
    p.data?.id === p.config.datasetVersionId
      ? p.data
      : p.datasets.find(
          (d) => d.id === p.config.datasetVersionId && Array.isArray(d.rows),
        );
  const selectedTemplate = templates.data?.find((t) => t.id === selected);
  const selectedPreset =
    stylePresets.find((v) => v.key === selected) || stylePresets[0];
  const previewConfig = useMemo(
    () =>
      tab === "builtin"
        ? applyPreset(p.config, selectedPreset.key)
        : selectedTemplate
          ? applyStyle(p.config, selectedTemplate.profile)
          : p.config,
    [tab, p.config, selectedPreset, selectedTemplate],
  );
  const matching = (templates.data || []).filter(
    (t) =>
      (scope === "all" || Number(t.project_id) === p.project) &&
      `${t.name} ${t.project_name}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  function switchTab(next: typeof tab) {
    setTab(next);
    setCreating(false);
    setEditing(null);
    setRemoving(null);
    setError("");
    setMessage("");
    setSelected(next === "builtin" ? p.config.style.preset : "");
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
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
        if (!v && !busy) p.onClose();
      }}
      title="图表样式与复用"
      description="为当前数据找到合适的外观，或将图表复用到另一份数据。"
      wide
      className="style-library-dialog"
    >
      <div
        className="style-tabs"
        role="tablist"
        aria-label="样式与复用"
        onKeyDown={(e) => {
          if (
            !["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key) ||
            busy
          )
            return;
          const tabs = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          );
          const index = tabs.indexOf(e.target as HTMLButtonElement);
          if (index < 0) return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? tabs.length - 1
                : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                  tabs.length;
          tabs[next].focus();
          tabs[next].click();
        }}
      >
        <button
          role="tab"
          aria-selected={tab === "builtin"}
          tabIndex={tab === "builtin" ? 0 : -1}
          disabled={busy}
          onClick={() => switchTab("builtin")}
        >
          <Palette size={15} />
          内置图表样式
        </button>
        <button
          role="tab"
          aria-selected={tab === "style"}
          tabIndex={tab === "style" ? 0 : -1}
          disabled={busy}
          onClick={() => switchTab("style")}
        >
          <Bookmark size={15} />
          个人样式模板
        </button>
        <button
          role="tab"
          aria-selected={tab === "reuse"}
          tabIndex={tab === "reuse" ? 0 : -1}
          disabled={busy}
          onClick={() => switchTab("reuse")}
        >
          <ArrowRight size={15} />
          复用到其他数据集
        </button>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {message && (
        <p className="style-message" role="status">
          {message}
        </p>
      )}
      {tab !== "reuse" ? (
        <div className="style-library-body">
          <section
            className="style-browser"
            aria-label={tab === "builtin" ? "内置样式" : "个人模板"}
          >
            <div className="style-browser-heading">
              <div>
                <h3>
                  {tab === "builtin"
                    ? "找到适合这张图的表达"
                    : "把好用的样式留给下一次"}
                </h3>
                <p>
                  {tab === "builtin"
                    ? "先预览，再应用。每一种样式都可以继续调整。"
                    : "默认只看当前项目；跨项目复用时切换到全部项目。"}
                </p>
              </div>
              {tab === "style" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setCreating((v) => !v)}
                >
                  <Plus size={14} />
                  保存为模板
                </Button>
              )}
            </div>
            {tab === "style" && (
              <>
                <div className="style-filter">
                  <div>
                    <Search size={15} />
                    <input
                      aria-label="搜索样式模板"
                      placeholder="搜索模板或来源项目"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setLimit(9);
                      }}
                    />
                  </div>
                  <select
                    aria-label="模板项目范围"
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value);
                      setLimit(9);
                    }}
                  >
                    <option value="current">当前项目</option>
                    <option value="all">全部项目</option>
                  </select>
                </div>
                {creating && (
                  <form
                    className="style-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (busy || !name.trim()) return;
                      void run(async () => {
                        const created = await api(
                          `/projects/${p.project}/style-templates`,
                          send("POST", { name: name.trim(), config: p.config }),
                        );
                        await templates.refetch();
                        setSelected(created.id);
                        setScope("current");
                        setSearch("");
                        setLimit(9);
                        setCreating(false);
                        setMessage("已保存当前画布样式，可跨项目复用");
                      });
                    }}
                  >
                    <label>
                      模板名称
                      <input
                        aria-label="模板名称"
                        maxLength={120}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setCreating(false)}
                      >
                        取消
                      </Button>
                      <Button disabled={busy || !name.trim()}>
                        保存当前样式
                      </Button>
                    </div>
                  </form>
                )}
                {editing && (
                  <form
                    className="style-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (busy || !rename.trim()) return;
                      void run(async () => {
                        await api(
                          `/style-templates/${editing.id}`,
                          send("PATCH", { name: rename.trim() }),
                        );
                        await templates.refetch();
                        setEditing(null);
                        setMessage("模板已重命名");
                      });
                    }}
                  >
                    <label>
                      新模板名称
                      <input
                        aria-label="新模板名称"
                        maxLength={120}
                        value={rename}
                        onChange={(e) => setRename(e.target.value)}
                      />
                    </label>
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        取消重命名
                      </Button>
                      <Button disabled={busy || !rename.trim()}>
                        保存名称
                      </Button>
                    </div>
                  </form>
                )}
                {removing && (
                  <div
                    className="style-remove"
                    role="group"
                    aria-label="确认删除模板"
                  >
                    <p>
                      删除「{removing.name}
                      」？已有图表不会改变，删除后无法恢复此模板。
                    </p>
                    <div>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setRemoving(null)}
                      >
                        保留模板
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(`/style-templates/${removing.id}`, {
                              method: "DELETE",
                            });
                            await templates.refetch();
                            if (selected === removing.id) setSelected("");
                            setRemoving(null);
                            setMessage("模板已删除，已有图表保持原样");
                          })
                        }
                      >
                        确认删除模板
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            {tab === "builtin" ? (
              <div className="style-card-grid">
                {stylePresets.map((v) => (
                  <button
                    key={v.key}
                    aria-label={`预览内置样式 ${v.key}`}
                    className={`style-card ${selected === v.key ? "selected" : ""}`}
                    aria-pressed={selected === v.key}
                    onClick={() => setSelected(v.key)}
                  >
                    <StyleThumbnail
                      profile={styleProfile(applyPreset(p.config, v.key))}
                    />
                    <span className="style-card-name">
                      {v.name}
                      {selected === v.key && <Check size={14} />}
                    </span>
                    <small>{v.key}</small>
                    <p>{v.description}</p>
                  </button>
                ))}
              </div>
            ) : templates.isPending ? (
              <div className="style-empty" role="status">
                正在读取个人模板…
              </div>
            ) : templates.isError ? (
              <div className="style-empty" role="alert">
                {templates.error.message}
                <Button onClick={() => templates.refetch()}>重试</Button>
              </div>
            ) : !matching.length ? (
              <div className="style-empty">
                <FolderOpen size={27} />
                <h4>{search ? "没有匹配的模板" : "这里还没有个人模板"}</h4>
                <p>
                  {search
                    ? "试试其他关键词，或切换到全部项目。"
                    : "调整好一张图后，保存它的外观，下次直接使用。"}
                </p>
                {!search && (
                  <Button variant="outline" onClick={() => setCreating(true)}>
                    保存为模板
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="style-count">
                  {matching.length} 个模板 · 缩略图为样式示意
                </p>
                <div className="style-card-grid">
                  {matching.slice(0, limit).map((t) => (
                    <article
                      key={t.id}
                      className={`style-card ${selected === t.id ? "selected" : ""}`}
                    >
                      <button
                        className="template-select"
                        aria-label={`预览模板 ${t.name}`}
                        aria-pressed={selected === t.id}
                        onClick={() => setSelected(t.id)}
                      >
                        <StyleThumbnail profile={t.profile} />
                        <span className="style-card-name">
                          {t.name}
                          {selected === t.id && <Check size={14} />}
                        </span>
                        <small title={t.project_name}>{t.project_name}</small>
                      </button>
                      <div className="template-card-actions">
                        <span>{t.profile.series.length} 组外观</span>
                        <button
                          aria-label={`重命名 ${t.name}`}
                          disabled={busy}
                          onClick={() => {
                            setEditing(t);
                            setRename(t.name);
                            setCreating(false);
                            setRemoving(null);
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          aria-label={`删除 ${t.name}`}
                          disabled={busy}
                          onClick={() => {
                            setRemoving(t);
                            setEditing(null);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {matching.length > limit && (
                  <Button
                    className="style-more"
                    variant="outline"
                    onClick={() => setLimit((v) => v + 9)}
                  >
                    显示更多模板（剩余 {matching.length - limit}）
                  </Button>
                )}
              </>
            )}
          </section>
          <aside className="style-detail">
            <div className="style-detail-heading">
              <span>当前数据预览</span>
              <span>未应用</span>
            </div>
            {source && <StylePreview config={previewConfig} data={source} />}
            <h3>
              {tab === "builtin"
                ? selectedPreset.name
                : selectedTemplate?.name || "当前画布样式"}
            </h3>
            <p>
              {tab === "builtin"
                ? selectedPreset.description
                : selectedTemplate
                  ? `来自「${selectedTemplate.project_name}」`
                  : "选择左侧模板，查看它在这份数据上的效果。"}
            </p>
            <dl>
              <div>
                <dt>字体</dt>
                <dd>
                  {previewConfig.style.font} · {previewConfig.style.fontSize}px
                </dd>
              </div>
              <div>
                <dt>数据</dt>
                <dd>{source?.filename || "未找到当前数据"}</dd>
              </div>
              <div>
                <dt>画布</dt>
                <dd>
                  {previewConfig.style.width} × {previewConfig.style.height}px
                </dd>
              </div>
            </dl>
            <div className="style-detail-note">
              仅调整外观，保留字段映射、标题、坐标范围和统计设置。应用后可撤销。
              {tab === "builtin" && " 内置样式为独立设计，无期刊官方认证。"}
            </div>
            <Button
              disabled={busy || (!selectedTemplate && tab === "style")}
              aria-label={
                tab === "builtin"
                  ? `应用内置样式 ${selectedPreset.key}`
                  : `应用样式 ${selectedTemplate?.name || "未选择"}`
              }
              onClick={() => {
                p.onApply(previewConfig);
                p.onClose();
              }}
            >
              应用到当前图表
              <ArrowRight size={15} />
            </Button>
          </aside>
        </div>
      ) : (
        <div className="style-reuse-body">
          <label>
            目标数据版本
            <select
              aria-label="复用目标数据版本"
              value={target}
              onChange={(e) => {
                setTarget(Number(e.target.value));
                setMapping({});
                setError("");
              }}
            >
              <option value={0}>请选择…</option>
              {p.datasets
                .filter((d) => d.id !== p.config.datasetVersionId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.filename} · v{d.version}
                  </option>
                ))}
            </select>
          </label>
          {!data ? (
            <p>选择目标后逐项确认映射。即使列名相同，也需明确选择。</p>
          ) : (
            <>
              <p className="tiny-note">
                包括暂未启用的设置。保留过滤值、类别顺序、正类和阈值，请核对其含义；分面自定义标签与矩阵分组选择会重置。
              </p>
              <div className="reuse-map">
                {refs.map((b) => (
                  <label key={b.field}>
                    {b.field}
                    <small>
                      {b.uses.join(" / ")}
                      {b.numeric ? " · 数值" : ""}
                    </small>
                    <select
                      aria-label={`映射 ${b.field}`}
                      value={mapping[b.field] || ""}
                      onChange={(e) =>
                        setMapping({ ...mapping, [b.field]: e.target.value })
                      }
                    >
                      <option value="">选择目标字段…</option>
                      {data.fields
                        .filter((f) => !b.numeric || f.type === "number")
                        .map((f) => (
                          <option key={f.name}>{f.name}</option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              {p.config.evaluation && (
                <p>
                  二分类正类：{p.config.evaluation.positive} · 阈值：
                  {p.config.evaluation.threshold}
                </p>
              )}
              {p.config.classification && (
                <p>
                  矩阵类别：{p.config.classification.classes.join("、")} ·
                  正类：{p.config.classification.positive} · 阈值：
                  {p.config.classification.threshold}
                </p>
              )}
              {p.config.transforms.length > 0 && (
                <p>
                  保留过滤：
                  {p.config.transforms
                    .map((t) => `${t.field} ${t.operator} ${t.value}`)
                    .join("；")}
                </p>
              )}
              <label>
                新图名称
                <input
                  aria-label="复用图表名称"
                  maxLength={120}
                  value={copyName}
                  onChange={(e) => setCopyName(e.target.value)}
                />
              </label>
              <div className="dialog-actions">
                <Button
                  disabled={
                    busy ||
                    !copyName.trim() ||
                    refs.some((b) => !mapping[b.field])
                  }
                  onClick={() =>
                    run(async () => {
                      const config = reuseConfig(p.config, data, mapping);
                      const chart = await api(
                        `/projects/${p.project}/charts`,
                        send("POST", { name: copyName, config }),
                      );
                      p.onReused(chart);
                    })
                  }
                >
                  {busy ? "正在验证并保存…" : "确认映射并保存新图"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
