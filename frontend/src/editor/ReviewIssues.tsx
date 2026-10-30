import {Button} from '../components/ui/button';
import {toolFieldNames,toolValueNames} from './figureTools';
import type {ReviewResult} from './review';
export function ReviewIssues({report,selected,ignored=new Set(),onSelect,onIgnore,showChecks=true}:{report:ReviewResult;selected:ReadonlySet<string>;ignored?:ReadonlySet<string>;onSelect:(id:string)=>void;onIgnore?:(id:string)=>void;showChecks?:boolean}){
  return <div className="review-issues">
    {report.issues.map((issue,index)=><article className="review-issue" key={issue.id} data-issue-id={issue.id} data-ignored={ignored.has(issue.id)}>
      <header><span className="proposal-number">{issue.number??index+1}</span><strong>{issue.title}</strong><code>{issue.rule}</code></header>
      <small>{ignored.has(issue.id)?'已忽略':issue.fixable?'可自动修复':'需要你判断'}</small>
      <p>{issue.detail}</p>
      {issue.fixable&&<><p className="review-fix-description">{issue.fix.map(operation=>`${operation.tool} · ${Object.entries(operation.arguments).filter(([key])=>key!=='seriesId').map(([key,value])=>`${toolFieldNames[key]||key} → ${toolValueNames[String(value)]||String(value)}`).join('，')}`).join('；')}</p>
        <label><input type="checkbox" aria-label={`修复 ${issue.title}`} checked={selected.has(issue.id)&&!ignored.has(issue.id)} disabled={ignored.has(issue.id)} onChange={()=>onSelect(issue.id)}/>修复</label></>}
      {onIgnore&&<Button variant="ghost" size="sm" onClick={()=>onIgnore(issue.id)}>{ignored.has(issue.id)?'恢复':'忽略'}</Button>}
    </article>)}
    {showChecks&&<p className="tiny-note">已通过：{report.passed.join(' · ')||'无'}</p>}
    {showChecks&&report.skipped.length>0&&<div className="review-skipped">跳过的检查：{report.skipped.map(item=><p key={item.rule}>{item.rule} · {item.reason}</p>)}</div>}
  </div>;
}
