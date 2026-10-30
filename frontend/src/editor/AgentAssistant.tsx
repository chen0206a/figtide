import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Loader2,
  MessageSquare,
  Square,
  X,
  Plus,
  Settings2,
  Sparkles,
} from "lucide-react";
import { ApiError, api, send, type Dataset } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import type { Config } from "./model";
import { ProposalPreview } from "./ProposalPreview";
import { AgentHistory } from "./AgentHistory";
import { ModelConnectionDialog } from "../components/ModelConnectionDialog";
import { AuditTrace, outcomeLabels } from "./AuditTrace";
import {
  sameProtectedFigure,
  structuralAllowance,
  type ToolOperation,
  type ToolPreview,
} from "./figureTools";
import "./quick-actions.css";
import "./agent-assistant.css";
import { conversationPrompt, type ConversationTurn } from "./agentConversation";
import {agentConsent,agentSuggestions,type AssistantSubmission} from "./agentPresentation";
import {useAssistantAutoStart} from "./useAssistantAutoStart";
import type {CanvasProposal} from "./workbench/useProposalCanvas";
import {useProposalReview} from './useProposalReview';
import {ReviewIssues} from './ReviewIssues';
import type {ReviewResult} from './review';
import type {RenderFacts} from './renderFacts';
import {TeamProgress} from './TeamProgress';
import {readBudgetPreferences,storeBudgetPreferences,budgetPreferenceError,type AgentBudgetPreferences} from './agentBudgetPreferences';

import {
  recoveryKey,
  recoveryRead,
  recoveryWrite,
  sameConfig,
  type SessionBudget,
} from "./agentRecovery";

function AssistantSurface(p: {
  controls?:ReactNode;
  children: ReactNode;
  docked?: boolean;
  open: boolean;
  locked: boolean;
  onClose: () => void;
}) {
  if (!p.docked)
    return (
      <Dialog
        open={p.open}
        onOpenChange={(open) => {
          if (!open && !p.locked) p.onClose();
        }}
        title="绘图助手"
        description="用一句话描述调整，先查看效果，再决定是否应用。"
        wide
        className="quick-actions-dialog agent-assistant-dialog"
      >
        {p.controls}
        {p.children}
      </Dialog>
    );
  return (
    <aside
      id="figure-assistant"
      aria-label="绘图助手"
      className="agent-dock"
      hidden={!p.open}
    >
      <header className="agent-dock-heading">
        <div>
          <h2>
            <Sparkles size={17} />
            绘图助手
          </h2>
        </div>
        {p.controls}
        <Button
          variant="ghost"
          size="sm"
          aria-label="收起绘图助手"
          disabled={p.locked}
          onClick={p.onClose}
        >
          <X size={17} />
        </Button>
      </header>
      {p.children}
    </aside>
  );
}

export type AgentRun = {
  mode?:'single'|'edit'|'recommend'|'team'|'review';
  phase?:string;
  deep_review?:string;
  roles?:{role:string;steps:number;tokens:number;status:string;summary:string;prompt_version?:string}[];
  run_id: string;
  session_id?: string;
  session?: SessionBudget;
  parent_run_id?: string;
  refinement_depth?: number;
  replaces_parent?: boolean;
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
  persisted?: boolean;
  outcome?: string;
  proposal_hash?: string;
  review?: ReviewResult;
  audit_error?: boolean;
  trace: {
    role?:string;
    step: number;
    event: string;
    name?: string;
    ok?: boolean;
    tokens?: number;
    arguments?: unknown;
    result?: unknown;
  }[];
  proposal?: ToolPreview & { operations: ToolOperation[] };
};
const active = (run: AgentRun | null) =>
  !!run && (["queued", "running"].includes(run.status)||run.phase==='awaiting_render');
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
  initialPrompt?: string;
  initialConsent?: boolean;
  autoStart?: boolean;
  submission?: AssistantSubmission;
  onPreview?: (proposal:CanvasProposal|null)=>void;
  previewVisible?: boolean;
  onTogglePreview?: ()=>void;
  project: number;
  chartId: number | null;
  revision: number;
  config: Config;
  data: Dataset;
  token: string;
  docked?: boolean;
  open?: boolean;
  onClose: () => void;
  onApply: (token: string, config: Config, count: number) => boolean;
}) {
  const queryClient=useQueryClient();
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
  const [session, setSession] = useState<SessionBudget | null>(null);
  const [mode,setMode]=useState<'single'|'team'>(()=>{try{return localStorage.getItem('figtide-agent-mode-v1')==='team'?'team':'single'}catch{return 'single'}});
  const [sessionLimit, setSessionLimit] = useState(180000);
  const [budgetPreferences,setBudgetPreferences]=useState(readBudgetPreferences);
  const budgetError=budgetPreferenceError(mode==='team'?budgetPreferences:{...budgetPreferences,roles:null})||(!session&&(!Number.isInteger(sessionLimit)||sessionLimit<60000||sessionLimit>600000)?'会话额度须为 60,000–600,000 的整数。':'');
  const changeBudget=(value:AgentBudgetPreferences)=>{setBudgetPreferences(value);storeBudgetPreferences(value)};
  const [recovering, setRecovering] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const [recoveryNote, setRecoveryNote] = useState("");
  const cursor = useRef<string | null>(null);
  const failures = useRef(0);
  const storeKey = recoveryKey(p.project, p.chartId, p.data.id);
  const [prompt, setPrompt] = useState(p.initialPrompt ?? "");
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const sentPrompt = useRef("");
  const thread = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const proposalFooter = useRef<HTMLDivElement>(null);
  const proposalPreview = useRef<HTMLElement>(null);
  const reply = useRef<HTMLDivElement>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [tab, setTab] = useState<"edit" | "history">("edit");
  const [rejectionReason, setRejectionReason] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [candidate, setCandidate] = useState<{
    run: AgentRun;
    snapshot: { token: string; config: Config };
  } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applying, setApplying] = useState(false);
  const current = useRef(p);
  current.current = p;
  const mounted = useRef(true);
  const captured = useRef<{ token: string; config: Config } | null>(null);
  const ownedRun = useRef<string | null>(null);
  const path = `/projects/${p.project}/agent/runs`;
  useEffect(() => {
    if (run?.session) setSession(run.session);
    if (!run || active(run)) return;
    if (
      run.status === "proposed" &&
      run.outcome === "pending" &&
      run.persisted &&
      run.proposal &&
      captured.current
    ) {
      setCandidate({ run, snapshot: captured.current });
      setPrompt("");
    }
    if (run.replaces_parent && run.status === "answered" && run.persisted) {
      setCandidate(null);
      setPrompt("");
    }
    setTurns((previous) => {
      if (
        ((run.status === "proposed" && run.outcome === "pending") ||
          run.replaces_parent) &&
        run.persisted &&
        run.parent_run_id
      )
        previous = previous.map((turn) =>
          turn.id === run.parent_run_id
            ? { ...turn, outcome: "superseded" }
            : turn,
        );
      const index = previous.findIndex((turn) => turn.id === run.run_id);
      if (index >= 0)
        return previous.map((turn, i) =>
          i === index ? { ...turn, outcome: run.outcome || run.status } : turn,
        );
      return [
        ...previous,
        {
          id: run.run_id,
          prompt: sentPrompt.current,
          text: run.text || run.reason || "本轮未生成提案。",
          outcome: run.outcome || run.status,
        },
      ].slice(-12);
    });
  }, [run?.run_id, run?.status, run?.outcome]);
  function remember(id: string | null) {
    cursor.current = id;
    try {
      recoveryWrite(storeKey, id);
    } catch {
      setStorageNote(
        "浏览器未允许保存恢复标识；本页可继续使用，刷新后需重新开始。",
      );
    }
  }
  async function reconnect(id = cursor.current) {
    if (!id) return;
    setRecovering(true);
    setError("");
    try {
      const restored = await api<{
        run: AgentRun;
        session?: SessionBudget;
        baseline?: {
          chart_id: number | null;
          base_revision: number;
          config: Config;
        };
        candidate?: {
          run: AgentRun;
          baseline: {
            chart_id: number | null;
            base_revision: number;
            config: Config;
          };
        };
        turns: ConversationTurn[];
        input_text?: string;
        recovery_note?: string;
      }>(`${path}/${id}/resume`);
      if (!mounted.current) return;
      const now = current.current;
      if (
        restored.session &&
        (restored.session.dataset_version_id !== now.data.id ||
          restored.session.chart_id !== now.chartId)
      )
        throw new Error("恢复记录不属于当前图表或版本");
      const capture = (baseline: NonNullable<typeof restored.baseline>) => ({
        config: baseline.config,
        token:
          baseline.chart_id === now.chartId &&
          baseline.base_revision === (now.chartId ? now.revision : 0) &&
          sameConfig(baseline.config, now.config)
            ? now.token
            : `restored-stale:${id}`,
      });
      captured.current = restored.baseline ? capture(restored.baseline) : null;
      setCandidate(
        restored.candidate
          ? {
              run: restored.candidate.run,
              snapshot: capture(restored.candidate.baseline),
            }
          : null,
      );
      const next = { ...restored.run };
      if (next.status === "proposed" && !restored.candidate)
        next.proposal = undefined;
      setTurns(restored.turns || []);
      sentPrompt.current = restored.input_text || "恢复的本轮请求";
      setRun(next);
      setSession(restored.session || next.session || null);
      setRecoveryNote(
        restored.recovery_note || "已恢复本次对话；尚未应用的提案仍需确认。",
      );
      ownedRun.current = active(next) ? next.run_id : null;
      remember(next.run_id);
      failures.current = 0;
      setDisconnected(false);
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        setDisconnected(true);
      }
    } finally {
      if (mounted.current) setRecovering(false);
    }
  }
  useEffect(() => {
    try {
      const saved = recoveryRead(storeKey);
      if (saved) {
        cursor.current = saved;
        void reconnect(saved);
      }
    } catch {
      setStorageNote("浏览器未允许恢复本次对话。");
    }
  }, [storeKey]);
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
    if (!active(run) || recovering) return;
    let alive = true;
    const timer = setTimeout(
      async () => {
        try {
          const next = await api<AgentRun>(`${path}/${run!.run_id}`);
          if (alive) {
            setRun(next);
            setError("");
            failures.current = 0;
            setDisconnected(false);
            if (!active(next)) ownedRun.current = null;
          }
        } catch (e) {
          if (alive) {
            failures.current++;
            setDisconnected(true);
            setError((e as Error).message);
            setRun((v) => (v ? { ...v } : null));
          }
        }
      },
      Math.min(8000, 650 * 2 ** Math.min(failures.current, 4)),
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [run, path, recovering]);
  async function start() {
    if(budgetError){setError(budgetError);return;}
    const previousCursor = cursor.current;
    const requestId = crypto.randomUUID();
    remember(requestId);
    captured.current = { token: p.token, config: structuredClone(p.config) };
    setSubmitting(true);
    setError("");
    setRun(null);
    setComposerExpanded(false);
    setRejectionReason("");
    sentPrompt.current = prompt;
    const context = conversationPrompt(turns, prompt);
    try {
      const result = await api<AgentRun>(
        path,
        send("POST", {
          protocol_version: 1,
          request_id: requestId,
          user_message: prompt,
          ...(session
            ? { session_id: session.session_id }
            : pendingRun?.session_id
              ? { session_id: pendingRun.session_id }
              : { session_budget: sessionLimit }),
          chart_id: p.chartId,
          base_revision: p.chartId ? p.revision : 0,
          config: p.config,
          ...(pendingRun ? { parent_run_id: pendingRun.run_id } : {}),
          prompt: context.prompt,
          share_metadata: consent,
          ...(mode==='team'?{mode:'team',max_steps:8}:{}),
          max_tokens: budgetPreferences.runLimit,
          ...(mode==='team'?{role_budget_percentages:budgetPreferences.roles}:{}),
        }),
      );
      if (!mounted.current) {
        await api(`${path}/${result.run_id}/cancel`, send("POST", {}));
        return;
      }
      ownedRun.current = active(result) ? result.run_id : null;
      remember(result.run_id);
      setRun(result);
    } catch (e) {
      // 网络中断时保留原请求游标，页面重启后仍能找回这次运行；
      // api.ts 会把 TypeError 统一转成 offline 的 ApiError，不能只按类型判断。
      if (e instanceof ApiError && e.kind !== "offline") remember(previousCursor);
      else setDisconnected(true);
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
  const currentProposal =
    run?.status === "proposed" &&
    run.outcome === "pending" &&
    run.persisted &&
    !!run.proposal;
  const pendingRun = currentProposal ? run : candidate?.run;
  const result = pendingRun?.proposal;
  const snapshot = currentProposal ? captured.current : candidate?.snapshot;
  const trusted =
    !!result &&
    !!snapshot &&
    result.protocol_version === 1 &&
    result.source.dataset_version_id === p.data.id &&
    result.source.sha256 === p.data.sha256 &&
    (result.config.datasetVersionId === p.config.datasetVersionId || (String(result.config.datasetVersionId)==='$derived'&&result.processing?.source_dataset_version_id===p.data.id&&!!result.preview_dataset&&result.preview_dataset.sha256===result.processing.preview_hash)) &&
    Array.isArray(result.operations) &&
    sameProtectedFigure(
      snapshot.config,
      result.processing?{...result.config,datasetVersionId:p.data.id}:result.config,
      structuralAllowance(result.operations),
    );
  const busy = submitting || active(run) || applying || recovering;
  const proposalReview=useProposalReview({project:p.project,runId:pendingRun?.run_id,chartId:p.chartId,revision:p.revision,
    proposal:result,awaitGeometry:!!p.onPreview,enabled:p.open!==false&&trusted&&!active(run)&&!submitting&&!recovering});
  const displayResult=proposalReview.result||result;
  const context = conversationPrompt(turns, prompt);
  useAssistantAutoStart({submission:p.submission,autoStart:p.autoStart,initialConsent:p.initialConsent,initialPrompt:p.initialPrompt,prompt,consent,
    ready:p.open!==false&&!busy&&!disconnected&&!!provider.data?.available&&!(session&&session.remaining_budget<2000)&&!(result&&!trusted)&&p.config.datasetVersionId===p.data.id,
    recoveringExisting:!!cursor.current,setPrompt,setConsent,start});
  const canPreview=p.open!==false&&!busy&&!disconnected&&trusted&&!!result?.changes.length&&snapshot?.token===p.token;
  const waitingProposal=useMemo(()=>run?.phase==='awaiting_render'?run.proposal:undefined,[run?.phase,run?.run_id]);
  const geometrySent=useRef(new Set<string>());
  const awaitingId=run?.phase==='awaiting_render'?run.run_id:undefined;
  const captureTeamGeometry=useCallback((facts:RenderFacts|null)=>{if(!facts||!awaitingId||geometrySent.current.has(awaitingId))return;geometrySent.current.add(awaitingId);api(`${path}/${awaitingId}/review`,send('POST',{render_facts:facts})).catch(()=>{geometrySent.current.delete(awaitingId)})},[awaitingId,path]);
  useEffect(()=>{
    p.onPreview?.(waitingProposal&&captured.current?.token===p.token&&p.open!==false?{preview:waitingProposal,token:p.token,data:waitingProposal.preview_dataset,onRendered:captureTeamGeometry}:canPreview?{preview:displayResult!,token:snapshot!.token,data:result?.preview_dataset,reviewIssues:proposalReview.remaining,onRendered:proposalReview.rendered}:null);
    return()=>p.onPreview?.(null);
  },[canPreview,displayResult,snapshot?.token,p.onPreview,proposalReview.remaining,proposalReview.rendered,waitingProposal,captureTeamGeometry,p.token,p.open]);
  useEffect(() => {
    if (!p.docked || p.open === false) return;
    const target = result ? reply.current : thread.current;
    target?.scrollIntoView?.({
      block: result ? "start" : "nearest",
      behavior: "auto",
    });
  }, [turns.length, p.open, run?.status, run?.outcome]);
  const usedBudget = session
    ? session.used_budget + session.reserved_budget
    : 0;
  const budgetMax = session?.max_budget || sessionLimit;
  const budgetPercent = budgetMax > 0 ? Math.round((usedBudget / budgetMax) * 100) : 0;
  const budgetTitle = `已用 ${usedBudget.toLocaleString()} / 上限 ${budgetMax.toLocaleString()} token`;
  const providerRow = (
    <div className="agent-provider">
      <MessageSquare size={17} />
      <div>
        {provider.data?.available ? (
          <strong>
            已连接 ·{" "}
            <span className="agent-model-name lf-mono">
              {provider.data.model}
            </span>
          </strong>
        ) : (
          <>
            <strong>连接模型服务</strong>
            <span>选择模型，开始调整</span>
          </>
        )}
      </div>
      {!provider.data?.available && (
        <span className="agent-connection-indicator">未连接</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="模型设置"
        disabled={busy}
        onClick={() => setConnectionOpen(true)}
      >
        <Settings2 size={15} />
      </Button>
    </div>
  );
  const budgetView = (
    <details className="agent-budget">
      <summary title={budgetTitle}>
        {session
          ? `本次会话已用 ${budgetPercent}%`
          : `本次会话上限 ${sessionLimit.toLocaleString()}`}
        <progress
          aria-label="会话预算使用情况"
          title={budgetTitle}
          data-high={budgetPercent >= 80}
          value={usedBudget}
          max={budgetMax}
        />
      </summary>
      {!session && (
        <label>
          本次对话额度
          <select
            aria-label="本次对话额度"
            value={sessionLimit}
            disabled={busy}
            onChange={(e) => setSessionLimit(Number(e.target.value))}
          >
            {[60000, 180000, 360000, 600000].map((value) => (
              <option key={value} value={value}>
                {value.toLocaleString()}
              </option>
            ))}
          </select>
          <input aria-label="自定义会话额度" type="number" min={60000} max={600000} step={1000} disabled={busy} value={sessionLimit} onChange={event=>setSessionLimit(Number(event.target.value))}/>
        </label>
      )}
      <p>跨轮累计的保守预算单位，不是实际账单 token；单轮最多 60,000。</p>
      <label>单次用量额度<input aria-label="单次用量额度" type="number" min={2000} max={60000} step={1000} disabled={busy} value={budgetPreferences.runLimit} onChange={e=>changeBudget({...budgetPreferences,runLimit:Number(e.target.value)})}/></label>
      {mode==='team'&&<>
        <label>角色用量分配<select aria-label="角色用量分配" disabled={busy} value={budgetPreferences.roles?'custom':'shared'} onChange={e=>changeBudget({...budgetPreferences,roles:e.target.value==='custom'?{coordinator:15,data:30,plotter:40,reviewer:15}:null})}><option value="shared">共同使用单次额度</option><option value="custom">自定义角色百分比</option></select></label>
        {budgetPreferences.roles&&(['coordinator','data','plotter','reviewer'] as const).map((role,i)=><label key={role}>{['协调者','数据专家','绘图专家','审稿专家'][i]}（%）<input aria-label={`${['协调者','数据专家','绘图专家','审稿专家'][i]}配额百分比`} type="number" min={1} max={100} disabled={busy} value={budgetPreferences.roles![role]} onChange={e=>changeBudget({...budgetPreferences,roles:{...budgetPreferences.roles!,[role]:Number(e.target.value)}})}/></label>)}
        <p>选择共同使用时，各角色共享单次额度；自定义比例按执行顺序累计，前序未用额度可留给后续角色。</p>
      </>}
      {!!budgetError&&<p role="alert">{budgetError}</p>}
      {session && (
        <p>
          已用 {session.used_budget.toLocaleString()} · 预留{" "}
          {session.reserved_budget.toLocaleString()} · 剩余{" "}
          {session.remaining_budget.toLocaleString()}。模型上报{" "}
          {session.reported_tokens.toLocaleString()} tokens。
        </p>
      )}
      {!!session?.uncertain_runs && (
        <p>有 {session.uncertain_runs} 次请求用量未明，已保留整轮额度。</p>
      )}
    </details>
  );
  const rejectProposal = async (reason: string) => {
    if (!pendingRun) return;
    setApplying(true);
    setError("");
    try {
      const decision = await api<AgentRun>(
        `${path}/${pendingRun.run_id}/decision`,
        send("POST", {
          outcome: "rejected",
          reason,
          proposal_hash: pendingRun.proposal_hash,
        }),
      );
      if (decision.outcome !== "rejected")
        throw new Error("拒绝记录未写入，请重试");
      setCandidate(null);
      setRun({ ...pendingRun, outcome: "rejected", proposal: undefined });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };
  const composerVisible = !result || composerExpanded;
  const composerView = (
    <div className="agent-composer">
      <label className="agent-prompt">
        希望怎样调整？
        <textarea
          ref={composer}
          value={prompt}
          maxLength={2000}
          rows={4}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            result
              ? "还有哪里不满意？例如：线再粗一点"
              : "例如：把图例放到右侧，字号改为 16，并将第一条曲线设为蓝色。"
          }
        />
      </label>

      <label className="agent-consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          {agentConsent}
          {mode==='team'&&' 协作审稿还会发送图表纯几何的边界框及数量摘要，不含文字内容或数据值。'}
        </span>
      </label>
      <div className="agent-controls">
        <Button
          onClick={start}
          disabled={
            busy ||
            !!budgetError ||
            disconnected ||
            (!!session && session.remaining_budget < 2000) ||
            !provider.data?.available ||
            (!!result && !trusted) ||
            p.config.datasetVersionId !== p.data.id ||
            !consent ||
            !prompt.trim()
          }
        >
          {busy ? (
            <Loader2 size={15} className="agent-spin" />
          ) : (
            <MessageSquare size={15} />
          )}
          {busy ? "正在生成提案…" : result ? "继续修改提案" : "生成调整提案"}
        </Button>
        {active(run) && (
          <Button variant="outline" onClick={cancel}>
            <Square size={13} />
            取消运行
          </Button>
        )}
      </div>
    </div>
  );
  const proposalActions = (
    <div
      className={`quick-result-footer${!result ? " is-idle" : ""}`}
      ref={proposalFooter}
    >
      <p>确认后只修改草稿，可一步撤销；是否保存正式版本由你决定。</p>
      {!!result && !composerExpanded && (
        <button
          type="button"
          className="agent-refine"
          disabled={busy}
          onClick={() => {
            setComposerExpanded(true);
            composer.current?.focus();
          }}
        >
          继续修改
        </button>
      )}
      {!!result && (
      <Button
        className="agent-apply"
        aria-label="应用这组调整"
        disabled={
          busy ||
          proposalReview.busy ||
          (!!proposalReview.report&&proposalReview.accepted.length>0&&!proposalReview.preview) ||
          disconnected ||
          !trusted ||
          !result?.changes.length ||
          snapshot?.token !== p.token
        }
        onClick={async () => {
          if (!result || !snapshot || !pendingRun) return;
          setApplying(true);
          try {
            // Re-check the persisted revision and run status immediately before applying.
            const latest = await api<AgentRun>(`${path}/${pendingRun.run_id}`);
            if (
              latest.status !== "proposed" ||
              latest.outcome !== "pending" ||
              !latest.persisted
            ) {
              setCandidate(null);
              setRun(latest);
              throw new Error("提案已失效，请重新生成");
            }
            if(!result.processing)await api(
              `/projects/${p.project}/figure-tools/lint`,
              send("POST", {
                protocol_version: 1,
                chart_id: p.chartId,
                base_revision: p.chartId ? p.revision : 0,
                config: displayResult!.config,
              }),
            ).then((lint) => {
              if (!lint.ok) throw new Error("提案未通过校验，请重新生成");
            });
            if (!mounted.current) return;
            if (current.current.token !== snapshot.token)
              throw new Error("画布已变化，请重新生成提案");
            // Acceptance records user approval, before applying to the local draft. It is not a chart save.
            const decision = await api<AgentRun & {config?:Config}>(
              `${path}/${pendingRun.run_id}/decision`,
              send("POST", {
                outcome: "accepted",
                proposal_hash: pendingRun.proposal_hash,
                ...(proposalReview.report?{accepted_fixes:proposalReview.accepted,review_hash:proposalReview.report.review_hash}:{}),
              }),
            );
            if (decision.outcome !== "accepted")
              throw new Error("确认记录未写入，请重试");
            if(result.processing)void queryClient.invalidateQueries({queryKey:['datasets',p.project]});
            if(decision.config&&!sameConfig(result.processing?{...decision.config,datasetVersionId:displayResult!.config.datasetVersionId}:decision.config,displayResult!.config))
              throw new Error('确认已记录，但修复预览已变化，本次未应用。请重新生成提案。');
            if (!mounted.current) return;
            setCandidate(null);
            setRun({ ...pendingRun, outcome: "accepted", proposal: undefined });
            if (current.current.token !== snapshot.token)
              throw new Error(
                "确认已记录，但画布已变化，本次未应用。请重新生成提案。",
              );
            if (
              !current.current.onApply(
                snapshot.token,
                decision.config||displayResult!.config,
                displayResult!.operation_count,
              )
            )
              throw new Error("画布已变化，请重新生成提案");
            if (!p.docked) current.current.onClose();
            else setPrompt("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setApplying(false);
          }
        }}
      >
        应用这组调整（{displayResult?.operation_count||0} 项）
        <ArrowRight size={15} />
      </Button>
      )}
      {canPreview&&p.onTogglePreview&&<Button variant="outline" className="agent-preview-toggle" onClick={p.onTogglePreview}>{p.previewVisible?'查看原图':'预览修改'}</Button>}
      {!!result && (
        <div className="agent-reject">
          <Button
            variant="ghost"
            size="sm"
            className="agent-reject-action"
            disabled={busy}
            onClick={() => void rejectProposal("")}
          >
            不采用这份提案
          </Button>
          {!reasonOpen && (
            <Button
              variant="ghost"
              size="sm"
              className="agent-reject-reason-toggle"
              disabled={busy}
              onClick={() => setReasonOpen(true)}
            >
              填写原因
            </Button>
          )}
          {reasonOpen && (
            <div className="agent-reject-reason">
              <label>
                拒绝原因（可选）
                <input
                  value={rejectionReason}
                  maxLength={500}
                  disabled={busy}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </label>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void rejectProposal(rejectionReason)}
              >
                拒绝提案
              </Button>
            </div>
          )}
        </div>
      )}
      {result && snapshot && snapshot.token !== p.token && (
        <p role="alert">画布已变化，请继续修改以合并手动编辑，再确认应用。</p>
      )}
    </div>
  );
  return (
    <AssistantSurface
      controls={<select className="agent-mode" aria-label="助手模式" value={mode} disabled={busy||!!result} onChange={event=>{const value=event.target.value==='team'?'team':'single';setMode(value);try{localStorage.setItem('figtide-agent-mode-v1',value)}catch{/* preference is optional */}}}><option value="single">单助手</option><option value="team">协作</option></select>}
      docked={p.docked}
      open={p.open !== false}
      locked={submitting || applying}
      onClose={p.onClose}
    >
      <div className="agent-tabs" role="tablist" aria-label="绘图助手功能">
        <button
          role="tab"
          aria-selected={tab === "edit"}
          onClick={() => setTab("edit")}
        >
          调整图表
        </button>
        <button
          role="tab"
          aria-selected={tab === "history"}
          disabled={busy}
          onClick={() => setTab("history")}
        >
          运行历史
        </button>
      </div>
      {tab === "history" ? (
        <AgentHistory
          project={p.project}
          chartId={p.chartId}
          onDecision={(record) => {
            if (candidate?.run.run_id === record.run_id) setCandidate(null);
            setRun((currentRun) =>
              currentRun?.run_id === record.run_id
                ? {
                    ...currentRun,
                    outcome: record.outcome,
                    proposal: undefined,
                  }
                : currentRun,
            );
          }}
        />
      ) : (
        <>
          {p.docked && (
            <div className="agent-dock-top">
              {providerRow}
              {budgetView}
            </div>
          )}
          <div className="quick-actions-body">
            <section
              className="quick-actions-builder agent-conversation"
              aria-label="绘图助手对话"
            >
              {!p.docked && providerRow}
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
                    <p>连接模型后即可通过对话调整图表。</p>
                    <Button
                      variant="outline"
                      onClick={() => setConnectionOpen(true)}
                    >
                      模型设置
                    </Button>
                  </div>
                )
              )}
              {!p.docked && budgetView}
              {!!session && session.remaining_budget < 2000 && !busy && (
                <p role="status" className="agent-context-note">
                  本次会话剩余额度不足；仍可查看或应用已有提案，开始新对话可重新设置额度。
                </p>
              )}
              {recovering && (
                <p role="status">正在恢复已有运行，不会重新调用模型…</p>
              )}
              {recoveryNote && (
                <p className="agent-context-note">{recoveryNote}</p>
              )}
              {storageNote && (
                <p role="status" className="agent-context-note">
                  {storageNote}
                </p>
              )}
              {disconnected && (
                <div className="agent-reconnect" role="status">
                  <p>连接中断。恢复只读取原运行，不会重复提交模型请求。</p>
                  <Button
                    variant="outline"
                    disabled={recovering || submitting || applying}
                    onClick={() => reconnect()}
                  >
                    重新连接
                  </Button>
                </div>
              )}
              <div
                className="agent-thread"
                role="log"
                aria-label="本次绘图对话"
                aria-live="polite"
              >
                {!turns.length && !busy && (
                  <div className="agent-welcome">
                    <strong>从一个具体的调整开始。</strong>
                    <p>说出想调整的地方，预览后再应用。</p>
                    <div className="agent-suggestions">
                      {agentSuggestions.map(
                        (text) => (
                          <button
                            key={text}
                            disabled={busy}
                            onClick={() => setPrompt(text)}
                          >
                            {text}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {turns.map((turn) => (
                  <article key={turn.id} className="agent-turn">
                    <p className="agent-user-message">{turn.prompt}</p>
                    <div className="agent-assistant-message">
                      <small>
                        绘图助手 · {outcomeLabels[turn.outcome] || "已回复"}
                      </small>
                      <p>{turn.text}</p>
                    </div>
                  </article>
                ))}
                {busy && (
                  <p role="status" className="agent-thinking">
                    <Loader2 size={14} className="agent-spin" />
                    {active(run) ? "正在检查图表并准备回复…" : "正在处理…"}
                  </p>
                )}
                <div ref={thread} />
                {busy&&<div className="agent-wait-skeleton" aria-hidden="true"><i/><i/><i/></div>}
              </div>
              {(!!turns.length || !!session || disconnected) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || !!result}
                  onClick={() => {
                    remember(null);
                    setSession(null);
                    setRecoveryNote("");
                    setDisconnected(false);
                    setError("");
                    setTurns([]);
                    setRun(null);
                    setPrompt("");
                    captured.current = null;
                  }}
                >
                  <Plus size={13} />
                  开始新对话
                </Button>
              )}
              {result &&
                run &&
                !active(run) &&
                run.run_id !== pendingRun?.run_id && (
                  <p className="agent-context-note">
                    上一份提案仍保留，可继续修改或确认应用。
                  </p>
                )}
              {!p.docked && composerView}
              {error && (
                <p role="alert" className="inline-error">
                  {error}
                </p>
              )}
              {run && (
                <div className="agent-reply" aria-live="polite" ref={reply}>
                  <TeamProgress run={run}/>
                  <div className="agent-run-status">
                    <strong>
                      {run.outcome &&
                      ["accepted", "rejected"].includes(run.outcome)
                        ? outcomeLabels[run.outcome]
                        : run.phase==='awaiting_render'?'等待提案渲染与审稿':statusNames[run.status]}
                    </strong>
                  </div>
                  {!turns.some((turn) => turn.id === run.run_id) &&
                    run.text && <p>{run.text}</p>}
                  {run.reason && <p>{run.reason}</p>}
                  {run.audit_error && (
                    <p role="alert">
                      审计记录暂时未写入，提案不能应用。
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            setRun(
                              await api<AgentRun>(`${path}/${run.run_id}`),
                            );
                            setError("");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        重试保存记录
                      </Button>
                    </p>
                  )}
                  {run.status === "proposed" &&
                    run.outcome === "pending" &&
                    !!result &&
                    !trusted && (
                      <p role="alert">提案来源或配置不一致，请重新生成。</p>
                    )}
                  <details>
                    <summary>运行记录</summary>
                    <small>
                      {run.steps}/{run.max_steps} 步 · {run.tokens} tokens
                    </small>
                    <code>{run.run_id}</code>
                    <AuditTrace trace={run.trace} />
                  </details>
                </div>
              )}
            </section>
            <aside className="quick-result" ref={proposalPreview}>
              {!!result&&<h3 className="proposal-user-heading">你要求的修改</h3>}
              {result?.processing&&<p className="proposal-processing">新建派生数据：{result.processing.name}。确认后才会创建独立数据集，原始数据保持只读；撤销只撤回草稿图表调整。</p>}
              {(!p.docked || !!result) && (
                <ProposalPreview
                  numbered
                  showPlot={!p.docked}
                  config={snapshot?.config || p.config}
                  data={result?.preview_dataset||p.data}
                  preview={trusted ? result : undefined}
                />
              )}
              {!!result&&proposalReview.busy&&<p className="tiny-note">正在生成确定性审稿与修复预览…</p>}
              {!!result&&proposalReview.error&&<p className="tiny-note">审稿未完成：{proposalReview.error}。{proposalReview.report?'取消全部审稿修复后可只确认原提案。':'可以只确认原提案，或重新预览。'}</p>}
              {!!result&&proposalReview.report&&<>
                <section className="proposal-review-group" aria-label="审稿修复"><h3>审稿修复 · 可逐条取消</h3>
                  <ReviewIssues showChecks={false} report={{...proposalReview.report,issues:proposalReview.report.issues.filter(issue=>issue.fixable)}} selected={proposalReview.selected} onSelect={proposalReview.toggle}/>
                  {!proposalReview.report.issues.some(issue=>issue.fixable)&&<p className="tiny-note">没有可自动修复的问题。</p>}
                </section>
                <section className="proposal-review-group" aria-label="审稿意见"><h3>审稿意见 · 不改图</h3>
                  {pendingRun?.deep_review&&<p>{pendingRun.deep_review}</p>}
                  <ReviewIssues report={{...proposalReview.report,issues:proposalReview.report.issues.filter(issue=>!issue.fixable)}} selected={proposalReview.selected} onSelect={proposalReview.toggle}/>
                </section>
                <p className="tiny-note">确定性检查 0 token{pendingRun?.mode==='team'?' · 深度审稿用量已计入本次协作预算':' · 没有调用模型'}</p>
              </>}
              {!p.docked && proposalActions}
            </aside>
          </div>
          {p.docked && composerVisible && composerView}
          {p.docked && proposalActions}
        </>
      )}
      {connectionOpen && (
        <ModelConnectionDialog onClose={() => setConnectionOpen(false)} />
      )}
    </AssistantSurface>
  );
}

function endpointHost(endpoint?: string) {
  if (!endpoint) return "";
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}
