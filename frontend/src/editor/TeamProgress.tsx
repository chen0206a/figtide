import type {AgentRun} from './AgentAssistant';
import {AuditTrace} from './AuditTrace';
export const teamRoleNames:Record<string,string>={coordinator:'协调者',data:'数据专家',plotter:'绘图专家',reviewer:'审稿专家'};
export function TeamProgress({run}:{run:AgentRun}){
  if(run.mode!=='team'&&run.mode!=='review')return null;
  return <section className="team-progress" aria-label="协作进度"><p className="tiny-note">{run.phase==='awaiting_render'?'正在渲染提案，采集纯几何供审稿':run.phase==='budget_limited'?'预算已用尽，未交付半成品':'各角色共用本次预算'}</p>
    {(run.mode==='review'?['reviewer']:['coordinator','data','plotter','reviewer']).map(role=>{const state=run.roles?.find(item=>item.role===role);return <details key={role} data-team-role={role} open={state?.status==='running'}><summary>{teamRoleNames[role]} · {state?.status==='complete'?'已完成':state?.status==='failed'?'未完成':state?.status==='running'?'处理中':'等待'} · <span className="lf-mono">{state?.tokens??0} token</span></summary><p>{state?.summary||'等待前一阶段完成'}</p><AuditTrace trace={run.trace.filter(event=>event.role===role).map(({role:_,...event})=>event)}/></details>})}
  </section>;
}
