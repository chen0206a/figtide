import {useEffect,useRef,useState} from 'react';
import {api,send} from '../lib/api';
import {Button} from '../components/ui/button';
import {ReviewIssues} from '../editor/ReviewIssues';
import {selectedOperations,type ReviewResult} from '../editor/review';
import {NumberMarker} from '../editor/workbench/NumberMarker';
import type {CanvasMarker} from '../editor/workbench/proposalMarkers';
import type {DiagramCatalog,DiagramDoc,DiagramRecord} from './model';
import {collectDiagramFacts} from './collectFacts';
import {makeDiagramOperation,type DiagramOperationCatalog,type DiagramOperation} from './operations';
import {edgePoints} from './render/geometry';
import '../editor/review.css';

type DiagramReviewResult=ReviewResult<DiagramOperation>;
type Change={path:string;before:unknown;after:unknown};
function changeDescription(change:Change):string{
  const parts=change.path.split('/'),field=parts.at(-1)||'',names:Record<string,string>={font_size_pt:'字号（pt）',line_width_pt:'轮廓线宽（pt）',palette:'配色',mode:'图例模式',route:'走线方式',w:'宽度（mm）',h:'高度（mm）'};
  const element=parts[1]==='nodes'?`节点 ${Number(parts[2])+1} · `:parts[1]==='edges'?`连线 ${Number(parts[2])+1} · `:'';
  const value=(v:unknown)=>v==='auto'?'自动':v==='orthogonal'?'直角':typeof v==='number'?String(Number(v.toFixed(3))):String(v??'未设置');
  return `${element}${names[field]||'属性'}：${value(change.before)} → ${value(change.after)}`;
}
export function useDiagramReview(doc:DiagramDoc,record:DiagramRecord,revision:number,catalog:DiagramCatalog,edit:(doc:DiagramDoc)=>void){
  const [open,setOpen]=useState(false),[journal,setJournal]=useState('default'),[width,setWidth]=useState(doc.canvas.width_mm),[report,setReport]=useState<DiagramReviewResult|null>(null),[selected,setSelected]=useState(new Set<string>()),[ignored,setIgnored]=useState(new Set<string>()),[candidate,setCandidate]=useState<{doc:DiagramDoc;base:DiagramDoc;changes:Change[]}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[labels,setLabels]=useState<Record<string,string>>({});
  const generation=useRef(0),current=useRef(doc);current.current=doc;
  useEffect(()=>{generation.current++;setReport(null);setCandidate(null);setError('');setBusy(false);},[doc,revision,journal,width]);
  useEffect(()=>()=>{generation.current++;},[]);
  const context={protocol_version:1,diagram_id:record.id,base_revision:revision,doc};
  async function review(){const token=++generation.current;setBusy(true);setError('');setCandidate(null);try{const style=catalog.styles.find(s=>s.id===doc.style.preset)!;const [render_facts,directory]=await Promise.all([collectDiagramFacts(doc,style),api<DiagramOperationCatalog>('/diagram-tools/catalog')]);if(token!==generation.current)return;setLabels(Object.fromEntries(directory.tools.map(t=>[t.name,t.label])));const result=await api<DiagramReviewResult>(`/projects/${record.project_id}/diagram-tools/review`,send('POST',{...context,render_facts,target:{journal,width_mm:width}}));if(token!==generation.current)return;setReport(result);setSelected(new Set(result.issues.filter(i=>i.fixable).map(i=>i.id)));setIgnored(new Set());}catch(e){if(token===generation.current)setError(e instanceof Error?e.message:'审稿失败');}finally{if(token===generation.current)setBusy(false);}}
  async function preview(){if(!report)return;const token=++generation.current;setBusy(true);setError('');try{const tools=await api<DiagramOperationCatalog>('/diagram-tools/catalog');const operations=selectedOperations(report,selected,ignored).map(op=>makeDiagramOperation(tools,op.tool,op.arguments));const result=await api<{doc:DiagramDoc;changes:Change[]}>(`/projects/${record.project_id}/diagram-tools/preview`,send('POST',{...context,operations}));if(token===generation.current)setCandidate({...result,base:doc});}catch(e){if(token===generation.current)setError(e instanceof Error?e.message:'修复预览失败');}finally{if(token===generation.current)setBusy(false);}}
  function toggle(set:React.Dispatch<React.SetStateAction<Set<string>>>,id:string){generation.current++;setBusy(false);setCandidate(null);set(s=>{const next=new Set(s);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  function close(){generation.current++;setBusy(false);setCandidate(null);setOpen(false);}
  const panel=open?<section aria-label="机制图审稿" className="diagram-review-panel">
    <header><h2>审稿这张图</h2><Button size="sm" variant="ghost" onClick={close}>返回属性</Button></header>
    <label>目标期刊<select aria-label="审稿目标期刊" value={journal} onChange={e=>setJournal(e.target.value)}>{catalog.journals.map(j=><option key={j.id} value={j.id}>{j.name}</option>)}</select></label>
    <label>成品宽度（mm）<input aria-label="审稿成品宽度" type="number" min="40" max="300" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label>
    <Button disabled={busy||width<40||width>300} onClick={()=>void review()}>{busy?'正在检查…':'运行审稿'}</Button>
    <p className="tiny-note">确定性规则检查，不调用模型。修复先预览，确认后手动保存。</p>
    {error&&<p role="alert">{error}</p>}
    {report&&<p role="status">{report.issues.filter(i=>i.severity==='error').length} 个 error · {report.issues.filter(i=>i.severity==='warning').length} 个 warning</p>}
    <div className="diagram-review-scroll">{report&&<ReviewIssues report={report} selected={selected} ignored={ignored} onSelect={id=>toggle(setSelected,id)} onIgnore={id=>toggle(setIgnored,id)} describeOperation={op=>labels[op.tool]?.replace(/[（(].*$/,'')||"调整机制图"}/>}</div>
    {report&&<footer>{candidate?<div className="diagram-repair-confirm"><strong>修复预览 · {candidate.changes.length} 项变化</strong><p className="tiny-note">画布显示候选结果，尚未应用或保存。</p><ul>{candidate.changes.map(change=><li key={change.path}>{changeDescription(change)}</li>)}</ul><Button onClick={()=>{if(current.current===candidate.base){edit(candidate.doc);setCandidate(null);setReport(null);}}}>应用修复</Button><Button variant="outline" onClick={()=>setCandidate(null)}>取消预览</Button></div>:<Button disabled={busy||!selectedOperations(report,selected,ignored).length} onClick={()=>void preview()}>预览选中修复</Button>}</footer>}
  </section>:null;
  return {open:()=>setOpen(true),panel,candidate:candidate?.doc||null,report,ignored,reviewErrors:report?report.issues.filter(i=>i.severity==='error').length:undefined};
}

/** NumberMarker is shared with chart review; the scale converts its pixel vocabulary to mm. */
export function DiagramReviewMarkers({doc,report,ignored}:{doc:DiagramDoc;report:DiagramReviewResult|null;ignored:Set<string>}){
  if(!report)return null;
  return <g className="review-markers diagram-review-markers" transform="scale(.25)">{report.issues.map((issue,index)=>{
    if(ignored.has(issue.id))return null;const ref=Number(issue.anchor.ref);let box={x:3+(index%8)*6,y:7,w:0,h:0};
    if(issue.anchor.kind==='node'&&doc.nodes[ref])box=doc.nodes[ref];
    if(issue.anchor.kind==='edge'&&doc.edges[ref]){const points=edgePoints(doc,doc.edges[ref]),p=points[Math.floor(points.length/2)];if(p)box={...p,w:0,h:0};}
    const marker:CanvasMarker={number:index+1,kind:'title',x:box.x*4,y:box.y*4,width:box.w*4,height:box.h*4,paths:[]};
    return <NumberMarker key={issue.id} marker={marker} width={doc.canvas.width_mm*4} height={doc.canvas.height_mm*4}/>;
  })}</g>;
}
