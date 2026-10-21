import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, MessageSquare, Square } from "lucide-react";
import { api, send, type Dataset } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import type { Config } from "./model";
import { ProposalPreview } from "./ProposalPreview";
import {
  sameProtectedFigure,
  structuralAllowance,
  type ToolOperation,
  type ToolPreview,
} from "./figureTools";
import "./quick-actions.css";
import "./agent-assistant.css";

export type AgentRun = {
  run_id: string;
  status:
    | "queued"
    | "running"
    | "proposed"
    | "answered"
    | "cancelled"
    | "failed"
    | "incomplete";
  model: string;
  steps: number;
  tokens: number;
  max_steps: number;
  latency_ms: number;
  text: string;
  reason: string;
  catalog_hash: string;
  prompt_version: string;
  trace: {
    step: number;
    event: string;
    name?: string;
    ok?: boolean;
    tokens?: number;
  }[];
  proposal?: ToolPreview & { operations: ToolOperation[] };
};
const active = (run: AgentRun | null) =>
  !!run && ["queued", "running"].includes(run.status);
const statusNames: Record<AgentRun["status"], string> = {
  queued: "等待运行",
  running: "正在分析",
  proposed: "提案已就绪",
  answered: "助手回复",
  cancelled: "已取消",
  failed: "运行失败",
  incomplete: "运行未完成",
};
export function AgentAssistant(p: {
  project: number;
  chartId: number | null;
  revision: number;
  config: Config;
  data: Dataset;
  token: string;
  onClose: () => void;
  onApply: (token: string, config: Config, count: number) => boolean;
}) {
  const provider = useQuery({
    queryKey: ["agent-provider"],
    queryFn: () =>
      api<{
        available: boolean;
        model: string;
        endpoint: string;
        reason: string;
      }>("/agent/provider"),
    staleTime: 0,
  });
  const [prompt, setPrompt] = useState("");
  const [consent, setConsent] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applying, setApplying] = useState(false);
  const current = useRef(p);
  current.current = p;
  const mounted = useRef(true);
  const captured = useRef<{ token: string; config: Config } | null>(null);
  const ownedRun = useRef<string | null>(null);
  const path = `/projects/${p.project}/agent/runs`;
  // A disappearing editor cancels only the run it owns; no pending request may apply on unmount.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (ownedRun.current)
        void api(`${path}/${ownedRun.current}/cancel`, send("POST", {})).catch(
          () => {},
        );
    };
  }, [path]);
  useEffect(() => {
    if (!active(run)) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const next = await api<AgentRun>(`${path}/${run!.run_id}`);
        if (alive) {
          setRun(next);
          setError("");
          if (!active(next)) ownedRun.current = null;
        }
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setRun((v) => (v ? { ...v } : null));
        }
      }
    }, 650);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [run, path]);
  async function start() {
    captured.current = { token: p.token, config: structuredClone(p.config) };
    setSubmitting(true);
    setError("");
    setRun(null);
    try {
      const result = await api<AgentRun>(
        path,
        send("POST", {
          protocol_version: 1,
          chart_id: p.chartId,
          base_revision: p.chartId ? p.revision : 0,
          config: p.config,
          prompt,
          share_metadata: consent,
        }),
      );
      if (!mounted.current) {
        await api(`${path}/${result.run_id}/cancel`, send("POST", {}));
        return;
      }
      ownedRun.current = active(result) ? result.run_id : null;
      setRun(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  async function cancel() {
    if (!run) return;
    try {
      const result = await api<AgentRun>(
        `${path}/${run.run_id}/cancel`,
        send("POST", {}),
      );
      setRun(result);
      ownedRun.current = null;
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const result = run?.status === "proposed" ? run.proposal : undefined;
  const snapshot = captured.current;
  const trusted =
    !!result &&
    !!snapshot &&
    result.protocol_version === 1 &&
    result.source.dataset_version_id === p.data.id &&
    result.source.sha256 === p.data.sha256 &&
    result.config.datasetVersionId === p.config.datasetVersionId &&
    Array.isArray(result.operations) &&
    sameProtectedFigure(
      snapshot.config,
      result.config,
      structuralAllowance(result.operations),
    );
  const busy = submitting || active(run) || applying;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting && !applying) p.onClose();
      }}
      title="绘图助手"
      description="用一句话描述调整，先查看效果，再决定是否应用。"
      wide
      className="quick-actions-dialog agent-assistant-dialog"
    >
      <div className="quick-actions-body">
        <section
          className="quick-actions-builder agent-conversation"
          aria-label="绘图助手对话"
        >
          <div className="agent-provider">
            <MessageSquare size={17} />
            <div>
              <strong>{provider.data?.model || "连接模型服务"}</strong>
              <span>
                {provider.data?.endpoint || "通过后端连接，密钥不会进入浏览器"}
              </span>
            </div>
          </div>
          {provider.isPending ? (
            <p role="status">正在检查模型配置…</p>
          ) : provider.isError ? (
            <div role="alert">
              {provider.error.message}
              <Button variant="outline" onClick={() => provider.refetch()}>
                重新检查
              </Button>
            </div>
          ) : (
            !provider.data?.available && (
              <div className="agent-setup" role="status">
                <strong>尚未连接模型</strong>
                <p>{provider.data?.reason}</p>
                <p>
                  设置 LABFLOW_AGENT_MODEL、LABFLOW_AGENT_API_KEY
                  后重启后端。自定义兼容地址使用 LABFLOW_AGENT_BASE_URL。
                </p>
                <p>手动编辑和快捷操作仍可正常使用。</p>
                <Button variant="outline" onClick={() => provider.refetch()}>
                  重新读取配置
                </Button>
              </div>
            )
          )}
          <label className="agent-prompt">
            希望怎样调整？
            <textarea
              value={prompt}
              maxLength={2000}
              rows={4}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：把图例放到右侧，字号改为 16，并将第一条曲线设为蓝色。"
            />
          </label>
          <div className="agent-suggestions">
            {["图例放到右侧", "隐藏网格线", "整体字号改为 18"].map((text) => (
              <button
                key={text}
                disabled={busy}
                onClick={() => setPrompt(text)}
              >
                {text}
              </button>
            ))}
          </div>
          <label className="agent-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              允许发送当前图表配置与字段摘要至上述模型服务。不发送原始数据行；外部模型可能计费。
            </span>
          </label>
          <div className="agent-controls">
            <Button
              onClick={start}
              disabled={
                busy || !provider.data?.available || !consent || !prompt.trim()
              }
            >
              {busy ? (
                <Loader2 size={15} className="agent-spin" />
              ) : (
                <MessageSquare size={15} />
              )}
              {busy ? "正在生成提案…" : "生成调整提案"}
            </Button>
            {active(run) && (
              <Button variant="outline" onClick={cancel}>
                <Square size={13} />
                取消运行
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {run && (
            <div className="agent-reply" aria-live="polite">
              <div className="agent-run-status">
                <strong>{statusNames[run.status]}</strong>
                <span>
                  {run.steps}/{run.max_steps} 步 · {run.tokens} tokens
                </span>
              </div>
              {run.text && <p>{run.text}</p>}
              {run.reason && <p>{run.reason}</p>}
              {run.status === "proposed" && !trusted && (
                <p role="alert">提案来源或配置不一致，请重新生成。</p>
              )}
              <details>
                <summary>运行记录</summary>
                <code>{run.run_id}</code>
                <ol>
                  {run.trace.map((v, i) => (
                    <li key={i}>
                      第 {v.step} 步 ·{" "}
                      {v.event === "tool"
                        ? `${v.name} · ${v.ok ? "校验通过" : "已撤回并反馈"}`
                        : `模型响应 · ${v.tokens} tokens`}
                    </li>
                  ))}
                </ol>
                <small>运行记录暂存在内存中，重启后清除。</small>
              </details>
            </div>
          )}
        </section>
        <aside className="quick-result">
          <ProposalPreview
            config={snapshot?.config || p.config}
            data={p.data}
            preview={trusted ? result : undefined}
          />
          <div className="quick-result-footer">
            <p>确认后只更新草稿，可一步撤销。保存正式版本仍由你决定。</p>
            <Button
              disabled={
                busy ||
                !trusted ||
                !result?.changes.length ||
                snapshot?.token !== p.token
              }
              onClick={async () => {
                if (!result || !snapshot || !run) return;
                setApplying(true);
                try {
                  // Re-check the persisted revision and run status immediately before applying.
                  const latest = await api<AgentRun>(`${path}/${run.run_id}`);
                  if (latest.status !== "proposed")
                    throw new Error("提案已失效，请重新生成");
                  await api(
                    `/projects/${p.project}/figure-tools/lint`,
                    send("POST", {
                      protocol_version: 1,
                      chart_id: p.chartId,
                      base_revision: p.chartId ? p.revision : 0,
                      config: result.config,
                    }),
                  ).then((lint) => {
                    if (!lint.ok) throw new Error("提案未通过校验，请重新生成");
                  });
                  if (!mounted.current) return;
                  if (
                    !current.current.onApply(
                      snapshot.token,
                      result.config,
                      result.operation_count,
                    )
                  )
                    throw new Error("画布已变化，请重新生成提案");
                  current.current.onClose();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setApplying(false);
                }
              }}
            >
              应用这组调整
              <ArrowRight size={15} />
            </Button>
            {snapshot && snapshot.token !== p.token && (
              <p role="alert">画布已变化，请重新生成提案。</p>
            )}
          </div>
        </aside>
      </div>
    </Dialog>
  );
}
