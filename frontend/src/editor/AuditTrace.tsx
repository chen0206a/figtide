import type { AgentRun } from "./AgentAssistant";
export const outcomeLabels: Record<string, string> = {
  running: "运行中",
  pending: "待决定",
  accepted: "已接受",
  rejected: "已拒绝",
  superseded: "已由续改替代",
  answered: "助手回复",
  cancelled: "已取消",
  failed: "失败",
  incomplete: "未完成",
  interrupted: "服务中断",
};
export type AgentAudit = AgentRun & {
  outcome: string;
  endpoint: string;
  created_at: string;
  finished_at: string | null;
  decision_at: string | null;
  decision_reason: string;
  chart_id: number | null;
  base_revision: number;
  dataset_version_id: number;
  source_sha256: string;
  usage_complete: boolean;
  proposal_summary?: { operation_count: number; change_count: number };
};
const names: Record<string, string> = {
  set_style: "文字与字体",
  set_axis: "坐标轴",
  set_legend: "图例",
  set_series: "序列外观",
  set_canvas: "画布",
  set_chart: "图表类型",
  set_mapping: "字段映射",
  map_series: "序列映射",
  add_series: "添加序列",
  remove_series: "移除序列",
  get_figure_spec: "图型规范",
  get_dataset_profile: "字段摘要",
  lint_figure: "配置校验",
  unknown_tool: "未允许的工具",
  propose_processing: "派生数据处理预览",
  get_current_config: "当前图表配置",
};
export function AuditTrace({ trace }: { trace: AgentRun["trace"] }) {
  if(trace.some(event=>event.role)){
    const labels:Record<string,string>={coordinator:'协调者',data:'数据专家',plotter:'绘图专家',reviewer:'审稿专家'};
    return <div className="agent-role-audit">{[...new Set(trace.map(event=>event.role).filter(Boolean))].map(role=><details key={role}><summary>{labels[role!]||role} · {trace.filter(event=>event.role===role&&event.event==='model_response').reduce((total,event)=>total+(event.tokens||0),0)} token</summary><AuditTrace trace={trace.filter(event=>event.role===role).map(({role:_,...event})=>event)}/></details>)}</div>;
  }
  return (
    <ol className="agent-audit-trace">
      {trace.map((event, i) => (
        <li key={i}>
          {event.event === "tool_call" || event.event === "tool" ? (
            <details>
              <summary>
                第 {event.step} 步 · {names[event.name || ""] || "工具"} ·{" "}
                {event.event === "tool_call"
                  ? "调用"
                  : event.ok
                    ? "通过"
                    : "已撤回"}
              </summary>
              <pre>
                {JSON.stringify(event.arguments ?? event.result ?? {}, null, 2)}
              </pre>
            </details>
          ) : (
            <span>
              第 {event.step} 步 ·{" "}
              {event.event === "refinement"
                ? "基于上一份提案继续调整"
                : event.event === "model_request"
                  ? "请求模型"
                  : event.event==='model_response'?`模型响应 · ${event.tokens} tokens`:event.event==='role_start'?'开始阶段':event.event==='role_end'?'阶段结束':event.event==='render_wait'?'等待渲染几何':event.event==='run_end'?'运行结束':'运行事件'}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
