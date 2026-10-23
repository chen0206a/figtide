import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { api, send } from "../lib/api";
import { Button } from "../components/ui/button";
import { AuditTrace, outcomeLabels, type AgentAudit } from "./AuditTrace";

export function AgentHistory(p: {
  project: number;
  chartId: number | null;
  onDecision?: (record: AgentAudit) => void;
}) {
  const [scope, setScope] = useState(p.chartId ? "chart" : "project");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const root = `/projects/${p.project}/agent`;
  const list = useQuery({
    queryKey: ["agent-history", p.project, scope, p.chartId, filter, page],
    queryFn: () =>
      api<{
        items: Pick<
          AgentAudit,
          "run_id" | "model" | "created_at" | "outcome" | "status" | "tokens"
        >[];
        has_more: boolean;
      }>(
        `${root}/history?page=${page}&size=10${scope === "chart" ? `&chart_id=${p.chartId}` : ""}${filter ? `&outcome=${filter}` : ""}`,
      ),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["agent-audit", p.project, selected],
    enabled: !!selected,
    queryFn: () => api<AgentAudit>(`${root}/runs/${selected}/audit`),
    retry: false,
  });
  return (
    <div className="agent-history-body">
      <section className="agent-history-list" aria-label="运行历史列表">
        <div className="agent-history-filters">
          <select
            aria-label="历史范围"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setPage(0);
            }}
          >
            {p.chartId && <option value="chart">当前图表</option>}
            <option value="project">整个项目</option>
          </select>
          <select
            aria-label="历史结果"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">全部结果</option>
            {Object.entries(outcomeLabels)
              .filter(([key]) => key !== "running")
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </div>
        {list.isPending ? (
          <p role="status">正在读取运行历史…</p>
        ) : list.isError ? (
          <div role="alert">
            {list.error.message}
            <Button variant="outline" onClick={() => list.refetch()}>
              重试
            </Button>
          </div>
        ) : !list.data.items.length ? (
          <div className="agent-history-empty">
            <strong>还没有符合条件的记录</strong>
            <p>运行结束后，模型版本、工具过程和你的决策会保存在这里。</p>
          </div>
        ) : (
          <ul>
            {list.data.items.map((row) => (
              <li key={row.run_id}>
                <button
                  aria-pressed={selected === row.run_id}
                  onClick={() => {
                    setSelected(row.run_id);
                    setReason("");
                    setError("");
                  }}
                >
                  <span>
                    <strong>{row.model}</strong>
                    <small>
                      {new Date(row.created_at).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </small>
                  </span>
                  <span className="agent-outcome">
                    {outcomeLabels[row.outcome] || row.outcome}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="agent-history-pagination">
          <Button
            variant="ghost"
            size="sm"
            aria-label="上一页运行"
            disabled={page === 0 || list.isPending}
            onClick={() => setPage((v) => v - 1)}
          >
            <ChevronLeft size={15} />
          </Button>
          <span>第 {page + 1} 页</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="下一页运行"
            disabled={!list.data?.has_more || list.isPending}
            onClick={() => setPage((v) => v + 1)}
          >
            <ChevronRight size={15} />
          </Button>
        </div>
      </section>
      <section className="agent-history-detail" aria-label="历史运行详情">
        {!selected ? (
          <div className="agent-history-empty">
            <ArrowLeft size={23} />
            <h3>选择一次运行</h3>
            <p>
              查看工具过程与最终决策。历史提案仅用于追溯，不会重新应用到画布。
            </p>
          </div>
        ) : detail.isPending ? (
          <p role="status">正在读取运行详情…</p>
        ) : detail.isError ? (
          <div role="alert">
            {detail.error.message}
            <Button variant="outline" onClick={() => detail.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          detail.data && (
            <>
              <div className="agent-history-heading">
                <h3>
                  {outcomeLabels[detail.data.outcome] || detail.data.outcome}
                </h3>
                <span>
                  {detail.data.tokens} tokens ·{" "}
                  {(detail.data.latency_ms / 1000).toFixed(1)} s
                </span>
              </div>
              <dl className="agent-audit-meta">
                {detail.data.parent_run_id && (
                  <>
                    <dt>续改来源</dt>
                    <dd>
                      <button
                        className="agent-lineage-link"
                        onClick={() => {
                          setSelected(detail.data.parent_run_id!);
                          setReason("");
                          setError("");
                        }}
                      >
                        查看上一轮提案
                      </button>
                    </dd>
                  </>
                )}
                <dt>模型</dt>
                <dd>{detail.data.model}</dd>
                <dt>服务</dt>
                <dd>{detail.data.endpoint}</dd>
                <dt>提示词版本</dt>
                <dd>{detail.data.prompt_version}</dd>
                <dt>工具目录</dt>
                <dd title={detail.data.catalog_hash}>
                  {detail.data.catalog_hash.slice(0, 16)}
                </dd>
                <dt>数据版本</dt>
                <dd>
                  <span title={detail.data.source_sha256}>
                    {detail.data.source_sha256.slice(0, 12)}
                  </span>
                </dd>
                <dt>保存基准</dt>
                <dd>
                  {detail.data.chart_id
                    ? `图表 · v${detail.data.base_revision}`
                    : "尚未保存的草稿"}
                </dd>
              </dl>
              {!detail.data.usage_complete && (
                <p className="agent-history-note">
                  这次运行被中断或未收到完整用量，用量记录可能不完整。
                </p>
              )}
              {detail.data.reason && <p>{detail.data.reason}</p>}
              {detail.data.proposal_summary && (
                <p className="agent-history-note">
                  最终提案：{detail.data.proposal_summary.operation_count}{" "}
                  项操作，{detail.data.proposal_summary.change_count}{" "}
                  处变化。文本内容已脱敏。
                </p>
              )}
              {detail.data.decision_reason && (
                <p>拒绝原因：{detail.data.decision_reason}</p>
              )}
              <AuditTrace trace={detail.data.trace} />
              <small className="agent-history-note">
                运行 ID：{detail.data.run_id}
              </small>
              {detail.data.outcome === "pending" && (
                <div className="agent-history-decision">
                  <p>
                    这份历史提案尚未作出决策。要应用调整，请回到编辑器重新生成。
                  </p>
                  <label>
                    拒绝原因（可选）
                    <input
                      value={reason}
                      maxLength={500}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        const decision = await api<AgentAudit>(
                          `${root}/runs/${selected}/decision`,
                          send("POST", {
                            outcome: "rejected",
                            reason,
                            proposal_hash: detail.data.proposal_hash,
                          }),
                        );
                        p.onDecision?.(decision);
                        await client.invalidateQueries({
                          queryKey: ["agent-history", p.project],
                        });
                        await detail.refetch();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    拒绝此提案
                  </Button>
                  {error && <p role="alert">{error}</p>}
                </div>
              )}
            </>
          )
        )}
      </section>
    </div>
  );
}
