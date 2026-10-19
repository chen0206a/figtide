import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, send, type Dataset } from "../lib/api";
import type { Config } from "./model";
import { applyStyle, bindings, reuseConfig, type StyleProfile } from "./reuse";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
type Template = {
  id: number;
  name: string;
  project_name: string;
  profile: StyleProfile;
};
export function ReuseDialog(p: {
  project: number;
  config: Config;
  name: string;
  datasets: Dataset[];
  onClose: () => void;
  onApply: (c: Config) => void;
  onReused: (chart: any) => void;
}) {
  const [tab, setTab] = useState<"style" | "reuse">("style");
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
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
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
      title="复用科研图表"
      description="样式可跨项目使用。整图复用将核对字段并保存新图，不覆盖源图；当前编辑内容也会包含在副本中。"
      wide
    >
      <div className="dialog-actions">
        <Button
          variant={tab === "style" ? "default" : "outline"}
          onClick={() => setTab("style")}
        >
          个人样式模板
        </Button>
        <Button
          variant={tab === "reuse" ? "default" : "outline"}
          onClick={() => setTab("reuse")}
        >
          复用到其他数据集
        </Button>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {tab === "style" ? (
        <>
          <p className="tiny-note">
            只保存字体、画布、图例、网格、色板与序列外观。字段、标题、轴范围、过滤和统计设置保持原样；应用可撤销。
          </p>
          <label>
            模板名称
            <input
              aria-label="模板名称"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            disabled={busy || !name.trim()}
            onClick={() =>
              run(async () => {
                await api(
                  `/projects/${p.project}/style-templates`,
                  send("POST", { name, config: p.config }),
                );
                await templates.refetch();
              })
            }
          >
            保存当前样式
          </Button>
          {templates.isPending ? (
            <p>读取样式中…</p>
          ) : templates.isError ? (
            <p role="alert">
              {templates.error.message}
              <Button onClick={() => templates.refetch()}>重试</Button>
            </p>
          ) : !templates.data?.length ? (
            <p>还没有个人样式，保存当前图表外观即可复用。</p>
          ) : (
            <div className="manage-list">
              {templates.data.map((t) => (
                <div key={t.id}>
                  <span>
                    {t.name}
                    <small>
                      {t.project_name} · {t.profile.series.length} 组序列外观
                    </small>
                  </span>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      p.onApply(applyStyle(p.config, t.profile));
                      p.onClose();
                    }}
                  >
                    应用样式 {t.name}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(`/style-templates/${t.id}`, {
                          method: "DELETE",
                        });
                        await templates.refetch();
                      })
                    }
                  >
                    删除 {t.name}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </Dialog>
  );
}
