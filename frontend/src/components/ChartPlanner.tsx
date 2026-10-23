import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Sparkles, Square } from "lucide-react";
import { ApiError, api, send, type Dataset } from "../lib/api";
import { defaults } from "../editor/model";
import {
  configFromPlan,
  initialPlan,
  planCaveats,
  planTypes,
  type PlotPlan,
} from "../editor/plotPlans";
import type { AgentRun } from "../editor/AgentAssistant";
import { StylePreview } from "../editor/StylePreview";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { ModelConnectionDialog } from "./ModelConnectionDialog";
import "./chart-planner.css";
import "../editor/styles-library.css";

type RecommendationRun = AgentRun & { recommendations?: PlotPlan[] };
export default function ChartPlanner(p: {
  project: number;
  data: Dataset;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [manual, setManual] = useState(() => initialPlan(p.data));
  const [choice, setChoice] = useState<PlotPlan | null>(null);
  const [goal, setGoal] = useState("");
  const [consent, setConsent] = useState(false);
  const [run, setRun] = useState<RecommendationRun | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const ownedRun = useRef<string | null>(null);
  const mounted = useRef(true);
  const provider = useQuery({
    queryKey: ["agent-provider"],
    queryFn: () =>
      api<{ available: boolean; model: string }>("/agent/provider"),
    staleTime: 0,
  });
  const active = !!run && ["queued", "running"].includes(run.status);
  const numeric = p.data.fields.filter(
    (f) => f.type === "number" && f.missing < p.data.row_count,
  );
  const selected = choice || manual;
  const result = useMemo(() => {
    try {
      return { config: configFromPlan(p.data, selected), error: "" };
    } catch (e) {
      return { config: null, error: (e as Error).message };
    }
  }, [p.data, selected]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (ownedRun.current)
        void api(
          `/projects/${p.project}/agent/runs/${ownedRun.current}/cancel`,
          { method: "POST" },
        ).catch(() => {});
    };
  }, [p.project]);
  useEffect(() => {
    if (!active || !run) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<RecommendationRun>(
          `/projects/${p.project}/agent/runs/${run.run_id}`,
        );
        if (live) {
          setError("");
          setRun(next);
          if (!["queued", "running"].includes(next.status)) {
            ownedRun.current = null;
            return;
          }
        }
      } catch (e) {
        if (live)
          setError(
            `连接中断：${(e as Error).message}。正在重新读取运行状态；可关闭窗口取消分析。`,
          );
      }
      if (live) timer = setTimeout(poll, 1200);
    };
    timer = setTimeout(poll, 900);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, run?.run_id, p.project]);
  async function recommend() {
    const requestId = crypto.randomUUID();
    ownedRun.current = requestId;
    setSubmitting(true);
    setError("");
    setChoice(null);
    try {
      const next = await api<RecommendationRun>(
        `/projects/${p.project}/agent/runs`,
        send("POST", {
          protocol_version: 1,
          mode: "recommend",
          chart_id: null,
          base_revision: 0,
          config: defaults(p.data),
          prompt:
            goal.trim() ||
            "请根据字段画像推荐适合探索这份实验数据的图表，并说明适用条件。",
          share_metadata: consent,
          request_id: requestId,
          max_steps: 4,
          max_tokens: 60000,
          session_budget: 60000,
        }),
      );
      if (!mounted.current) {
        await api(`/projects/${p.project}/agent/runs/${next.run_id}/cancel`, {
          method: "POST",
        });
        return;
      }
      ownedRun.current = ["queued", "running"].includes(next.status)
        ? next.run_id
        : null;
      setRun(next);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "http" && e.status < 500)
        ownedRun.current = null;
      else if (mounted.current) setPendingId(requestId);
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }
  async function recover() {
    if (!pendingId) return;
    setSubmitting(true);
    try {
      const restored = await api<RecommendationRun>(
        `/projects/${p.project}/agent/runs/${pendingId}`,
      );
      setRun(restored);
      setPendingId(null);
      setError("");
      ownedRun.current = ["queued", "running"].includes(restored.status)
        ? restored.run_id
        : null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setPendingId(null);
        ownedRun.current = null;
      }
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  async function create() {
    if (!result.config) return;
    setSaving(true);
    setError("");
    try {
      const lint = await api<{ ok: boolean; issues: { message: string }[] }>(
        `/projects/${p.project}/figure-tools/lint`,
        send("POST", {
          protocol_version: 1,
          chart_id: null,
          base_revision: 0,
          config: result.config,
        }),
      );
      if (!lint.ok)
        throw new Error(lint.issues.map((i) => i.message).join("；"));
      const chart = await api<{ id: number }>(
        `/projects/${p.project}/charts`,
        send("POST", {
          name: selected.title || "实验结果",
          config: result.config,
        }),
      );
      p.onCreated(chart.id);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }
  const update = (patch: Partial<PlotPlan>) => {
    setChoice(null);
    setManual((prev) => ({ ...prev, ...patch }));
  };
  const fieldSelect = (
    label: string,
    value: string,
    names: string[],
    onChange: (value: string) => void,
    optional = false,
  ) => (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {optional && <option value="">不分组</option>}
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !saving && !submitting) p.onClose();
        }}
        closeDisabled={saving || submitting}
        title="选择绘图方案"
        description="先看数据适合怎样表达，再决定创建哪种图表。"
        wide
        className="chart-planner"
      >
        <div className="planner-source">
          <b>{p.data.filename}</b>
          <span>
            v{p.data.version} · {p.data.row_count.toLocaleString()} 行
            · {p.data.fields.length} 个字段
          </span>
        </div>
        <section className="planner-agent" aria-label="数据选图助手">
          <div className="planner-section-title">
            <h3>
              <Sparkles size={17} />
              让助手推荐
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConnection(true)}
            >
              模型设置
            </Button>
          </div>
          <label>
            想观察什么？
            <input
              value={goal}
              maxLength={2000}
              placeholder="例如：比较各模型随训练轮次的准确率变化"
              onChange={(e) => setGoal(e.target.value)}
              disabled={active || submitting || !!pendingId}
            />
          </label>
          <div className="planner-consent">
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={active || submitting}
              />
              同意将字段名、类型、统计摘要及这段描述发送给已配置的模型；不发送原始行。
            </label>
            {pendingId ? (
              <Button
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => void recover()}
              >
                恢复分析状态
              </Button>
            ) : active ? (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const r = await api<RecommendationRun>(
                      `/projects/${p.project}/agent/runs/${run!.run_id}/cancel`,
                      { method: "POST" },
                    );
                    setRun(r);
                    ownedRun.current = null;
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Square size={13} />
                停止分析
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void recommend()}
                disabled={
                  submitting ||
                  !consent ||
                  !provider.data?.available ||
                  !numeric.length
                }
              >
                {submitting ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
                分析并推荐
              </Button>
            )}
          </div>
          {!provider.data?.available && (
            <p className="muted">
              {provider.isError
                ? "无法读取模型设置状态。"
                : "完成模型设置后可获取推荐；也可以直接在下方手动选图。"}
            </p>
          )}
          {active && (
            <p role="status">
              <Loader2 className="spin" size={14} />
              正在分析字段画像 · 第 {run.steps} 步 ·{" "}
              {run.tokens.toLocaleString()} tokens
            </p>
          )}
          {run && !active && (
            <p role="status">
              {run.status === "answered"
                ? run.text || "分析完成，请查看推荐方案。"
                : run.reason ||
                  `分析${run.status === "cancelled" ? "已取消" : "未完成"}，可继续手动选图。`}
            </p>
          )}
        </section>
        {!!run?.recommendations?.length && run.persisted && (
          <section aria-label="推荐图表" className="planner-options">
            {run.recommendations.map((plan) => (
              <article
                key={plan.id}
                className={choice?.id === plan.id ? "selected" : ""}
              >
                <header>
                  <b>{planTypes[plan.type]}</b>
                  <span>{plan.title}</span>
                </header>
                <p>{plan.reason}</p>
                <small>
                  X：{plan.x} · Y：{plan.ys.join("、")}
                  {plan.group && ` · 分组：${plan.group}`}
                </small>
                {plan.caveat && <p className="planner-caveat">{plan.caveat}</p>}
                <Button
                  variant={choice?.id === plan.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setChoice(plan);
                    setManual({ ...plan, id: "manual" });
                  }}
                >
                  {choice?.id === plan.id ? <Check size={14} /> : null}选择
                  {planTypes[plan.type]}
                </Button>
              </article>
            ))}
          </section>
        )}
        <div className="planner-workbench">
          <section className="planner-mapping">
            <h3>手动选图与字段</h3>
            <p className="muted">随时选择自己的方案，进入编辑器后仍可调整。</p>
            <label>
              图表类型
              <select
                value={manual.type}
                onChange={(e) =>
                  update({
                    type: e.target.value as PlotPlan["type"],
                    caveat: planCaveats[e.target.value as PlotPlan["type"]],
                  })
                }
              >
                {Object.entries(planTypes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {fieldSelect(
              "X 字段",
              manual.x,
              (["scatter", "histogram", "ecdf"].includes(manual.type)
                ? numeric
                : p.data.fields
              ).map((f) => f.name),
              (x) => update({ x }),
            )}
            <fieldset>
              <legend>
                {["histogram", "ecdf"].includes(manual.type)
                  ? "分布数值字段"
                  : "Y 数值字段"}
              </legend>
              {numeric.map((f) => (
                <label key={f.name}>
                  <input
                    type="checkbox"
                    checked={manual.ys.includes(f.name)}
                    onChange={(e) =>
                      update({
                        ys: e.target.checked
                          ? [...manual.ys, f.name].slice(0, 8)
                          : manual.ys.filter((y) => y !== f.name),
                      })
                    }
                  />
                  {f.name}
                </label>
              ))}
            </fieldset>
            {manual.type === "heatmap" ? (
              <>
                {fieldSelect(
                  "热力图 Y 字段",
                  manual.heatY,
                  p.data.fields.map((f) => f.name),
                  (heatY) => update({ heatY }),
                )}
                {fieldSelect(
                  "色值字段",
                  manual.heatZ,
                  numeric.map((f) => f.name),
                  (heatZ) => update({ heatZ }),
                )}
              </>
            ) : (
              fieldSelect(
                "分类分组",
                manual.group,
                p.data.fields.map((f) => f.name),
                (group) => update({ group }),
                true,
              )
            )}
            <label>
              图表标题
              <input
                maxLength={120}
                value={manual.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </label>
          </section>
          <section className="planner-preview">
            <div className="planner-section-title">
              <h3>真实数据预览</h3>
              <span>
                {choice ? "助手推荐 · " : "手动方案 · "}
                {planTypes[selected.type]}
              </span>
            </div>
            <p>
              X：{selected.x} · Y：{selected.ys.join("、")}
            </p>
            {result.config ? (
              <StylePreview config={result.config} data={p.data} />
            ) : (
              <p role="alert">{result.error}</p>
            )}
            <p className="planner-caveat">{selected.caveat}</p>
          </section>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="planner-footer">
          <span>原始数据保持不变；确认后保存初始配置。</span>
          <Button
            onClick={() => void create()}
            disabled={
              saving || submitting || active || !!pendingId || !result.config
            }
          >
            {saving ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <ArrowRight size={16} />
            )}
            创建图表并编辑
          </Button>
        </footer>
      </Dialog>
      {connection && (
        <ModelConnectionDialog
          onClose={() => {
            setConnection(false);
            void provider.refetch();
          }}
        />
      )}
    </>
  );
}
