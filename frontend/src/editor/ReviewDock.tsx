import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {api,send,type Dataset} from '../lib/api';
import {Button} from '../components/ui/button';
import type {Config} from './model';
import {sameProtectedFigure,type ToolPreview} from './figureTools';
import {journalRule,journalRules} from './journals';
import type {RenderFacts} from './renderFacts';
import {selectedOperations,type ReviewIssue,type ReviewResult} from './review';
import {ReviewIssues} from './ReviewIssues';
import type {CanvasProposal} from './workbench/useProposalCanvas';
import './review.css';
import {DeepReview} from './DeepReview';

export function ReviewDock(p:{open:boolean;project:number;chartId:number|null;revision:number;config:Config;data:Dataset;token:string;facts?:RenderFacts|null;
  onClose:()=>void;onPreview:(proposal:CanvasProposal|null)=>void;onIssues:(issues:ReviewIssue[])=>void;onApply:(token:string,config:Config,count:number)=>boolean;onPhysicalWidth:(width:number)=>void}){
  const [report,setReport]=useState<ReviewResult|null>(null),[selected,setSelected]=useState<Set<string>>(new Set()),[ignored,setIgnored]=useState<Set<string>>(new Set());
  const [journal,setJournal]=useState(p.config.publication?.journal||'default'),[width,setWidth]=useState(88),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<ToolPreview|null>(null);
  const current=useRef(p);current.current=p;
  const effectiveWidth=p.config.publication?.enabled?p.config.publication.widthMm:width;
  const factsKey=JSON.stringify(p.facts??null);
  useEffect(()=>{const id=p.config.publication?.journal||'default';setJournal(id);setWidth(journalRule(id).single_column_mm??88)},[p.config.publication?.journal]);
  useEffect(()=>{
    if(!p.open)return;
    let active=true;setBusy(true);setError('');setReport(null);setPreview(null);p.onPreview(null);
    api<ReviewResult>(`/projects/${p.project}/figure-tools/review`,send('POST',{protocol_version:1,chart_id:p.chartId,config:p.config,
      ...(p.facts?{render_facts:p.facts}:{}),target:{width_mm:effectiveWidth,journal}}))
      .then(result=>{if(active){setReport({...result,issues:result.issues.map((issue,index)=>({...issue,number:index+1}))});setSelected(new Set(result.issues.filter(issue=>issue.fixable).map(issue=>issue.id)))}})
      .catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setBusy(false)});
    return()=>{active=false};
  },[p.open,p.token,factsKey,effectiveWidth,journal,p.project]);
  useEffect(()=>{p.onIssues(p.open&&report?report.issues.filter(issue=>!ignored.has(issue.id)&&(!preview||!selected.has(issue.id))):[]);
    return()=>p.onIssues([]);
  },[p.open,report,ignored,selected,preview,p.onIssues]);
  useEffect(()=>()=>current.current.onPreview(null),[]);
  const invalidate=()=>{setPreview(null);p.onPreview(null)};
  const toggle=(id:string)=>{invalidate();setSelected(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next})};
  const ignore=(id:string)=>{invalidate();setIgnored(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next})};
  const operations=selectedOperations(report,selected,ignored);
  const calculate=async()=>{
    const token=p.token;
    const result=await api<ToolPreview>(`/projects/${p.project}/figure-tools/preview`,send('POST',{protocol_version:1,chart_id:p.chartId,base_revision:p.chartId?p.revision:0,config:p.config,operations}));
    if(current.current.token!==token||result.source.dataset_version_id!==p.data.id||result.source.sha256!==p.data.sha256||!sameProtectedFigure(p.config,result.config))throw new Error('画布或数据来源已变化，请重新审稿');
    return result;
  };
  if(!p.open)return null;
  return <aside className="agent-dock review-dock" aria-label="审稿报告" hidden={!p.open}>
    <header className="agent-dock-heading"><h2>审稿报告</h2><Button variant="ghost" size="icon" aria-label="收起审稿报告" onClick={()=>{invalidate();p.onClose()}}><X size={17}/></Button></header>
    <div className="review-toolbar"><strong>{report?.issues.length??0} 个问题 · {report?.issues.filter(issue=>issue.fixable).length??0} 个可自动修复</strong>
      <label>目标期刊<select aria-label="审稿目标期刊" value={journal} onChange={event=>{invalidate();setJournal(event.target.value);const rule=journalRule(event.target.value);setWidth(rule.single_column_mm??88)}}>{journalRules.map(rule=><option key={rule.id} value={rule.id}>{rule.name}</option>)}</select></label>
      <div role="group" aria-label="审稿成品尺寸">{[['单栏',journalRule(journal).single_column_mm??88],['双栏',journalRule(journal).double_column_mm??180]].map(([label,mm])=><Button key={label} variant="outline" size="sm" aria-pressed={effectiveWidth===mm} onClick={()=>{invalidate();if(p.config.publication?.enabled)p.onPhysicalWidth(Number(mm));else setWidth(Number(mm))}}>{label} · {mm} mm</Button>)}</div>
      <small>{p.config.publication?.enabled?'物理模式：尺寸切换会调整草稿成品宽度，可撤销。':'未开启论文尺寸：此处尺寸仅用于审稿换算。'}</small>
      <DeepReview project={p.project} chartId={p.chartId} revision={p.revision} config={p.config} facts={p.facts} target={{journal,width_mm:effectiveWidth}}/>
    </div>
    <div className="review-scroll">{busy&&<p role="status">正在执行确定性检查…</p>}{error&&<p role="alert">{error}</p>}
      {report&&<ReviewIssues report={report} selected={selected} ignored={ignored} onSelect={toggle} onIgnore={ignore}/>}</div>
    <footer><p>以上是确定性检查 · 没有调用模型 · 0 token</p>
      <Button disabled={busy||!operations.length} onClick={async()=>{setBusy(true);setError('');try{const result=await calculate();setPreview(result);p.onPreview({preview:result,token:p.token,reviewOnly:true,reviewIssues:report!.issues.filter(issue=>!selected.has(issue.id)&&!ignored.has(issue.id))})}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>预览修复所选（{report?.issues.filter(issue=>issue.fixable&&selected.has(issue.id)&&!ignored.has(issue.id)).length??0}）</Button>
      {preview&&<><p>预览中 · 尚未应用</p><Button disabled={busy} onClick={async()=>{setBusy(true);try{const result=await calculate();if(!current.current.onApply(p.token,result.config,operations.length))throw new Error('画布已变化，请重新审稿');invalidate();setReport(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>应用到草稿</Button></>}
    </footer>
  </aside>;
}
