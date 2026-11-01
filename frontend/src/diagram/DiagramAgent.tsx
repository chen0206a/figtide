import {useEffect,useRef,useState} from 'react';
import {api,send} from '../lib/api';
import {Button} from '../components/ui/button';
import {ReviewIssues} from '../editor/ReviewIssues';
import {selectedOperations,type ReviewResult} from '../editor/review';
import {NumberMarker} from '../editor/workbench/NumberMarker';
import {collectDiagramFacts} from './collectFacts';
import {layoutDiagram} from './layout';
import type {DiagramOperation} from './operations';
import type {DiagramCatalog,DiagramDoc,DiagramRecord} from './model';

type Fact={text:string;quote:string};
type Proposal={doc:DiagramDoc;review:ReviewResult<DiagramOperation>;changes:{path:string}[]};
type Run={run_id:string;session_id:string;status:string;phase:string;reason:string;text:string;historical?:boolean;persisted:boolean;proposal_hash?:string;proposal?:Proposal;review?:ReviewResult<DiagramOperation>;diagram?:{kind:string;brief:string;facts:Fact[];question?:string}};
export function useDiagramAgent(doc:DiagramDoc,record:DiagramRecord,revision:number,catalog:DiagramCatalog,edit:(d:DiagramDoc)=>void){
  const [opened,setOpened]=useState(false),[skill,setSkill]=useState(doc.meta.skill||catalog.skills[0]?.id||'workflow'),[prompt,setPrompt]=useState(''),[shared,setShared]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[run,setRun]=useState<Run|null>(null),[brief,setBrief]=useState(''),[facts,setFacts]=useState<Fact[]>([]),[source,setSource]=useState(''),[selected,setSelected]=useState(new Set<string>()),[ignored,setIgnored]=useState(new Set<string>()),[preview,setPreview]=useState<DiagramDoc|null>(null),[ready,setReady]=useState(false),[maxTokens,setMaxTokens]=useState(60000),[sessionBudget,setSessionBudget]=useState(180000);
  const current=useRef({doc,revision});current.current={doc,revision};
  const baseline=useRef({doc,revision}),epoch=useRef(0),rendered=useRef(new Set<string>()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),mounted=useRef(true);
  const storageKey=`figtide-diagram-agent:last:${record.project_id}:${record.id}`;
  const endpoint=`/projects/${record.project_id}/agent/runs`;
  const active=!!run&&['queued','running'].includes(run.status),proposal=run?.status==='proposed'?run.proposal:undefined,report=run?.review||proposal?.review;
  const matches=()=>JSON.stringify(current.current.doc)===JSON.stringify(baseline.current.doc)&&current.current.revision===baseline.current.revision;
  function remember(id:string){try{localStorage.setItem(storageKey,id);}catch{/* A run remains reconnectable without browser preferences. */}}
  async function poll(id:string,token:number){
    try{
      const next=await api<Run>(`${endpoint}/${id}`);if(!mounted.current||token!==epoch.current)return;setRun(next);
      if(next.phase==='awaiting_render'&&next.proposal&&!rendered.current.has(id)){
        rendered.current.add(id);if(!matches())throw new Error('画布已变化，请按当前草稿重新生成。');
        const laid=layoutDiagram(next.proposal.doc),style=catalog.styles.find(s=>s.id===laid.style.preset)!;
        const render_facts=await collectDiagramFacts(laid,style);if(token!==epoch.current)return;
        await api(`${endpoint}/${id}/review`,send('POST',{doc:laid,render_facts,target:{journal:'default',width_mm:laid.canvas.width_mm}}));
      }
      if(['queued','running'].includes(next.status)){timer.current=setTimeout(()=>void poll(id,token),350);return;}
      setBusy(false);
      if(next.diagram?.kind==='brief'){setBrief(next.diagram.brief);setFacts(next.diagram.facts);}
      if(next.status==='proposed'&&next.proposal){const report=next.review||next.proposal.review;setSelected(new Set(report.issues.filter(i=>i.fixable).map(i=>i.id)));setIgnored(new Set());setPreview(next.proposal.doc);setReady(false);}
      if(['failed','incomplete','cancelled'].includes(next.status))setError(next.reason||'本轮未生成可应用提案。');
    }catch(e){if(token!==epoch.current||!mounted.current)return;setBusy(false);setError(e instanceof Error?e.message:'读取运行失败');void api(`${endpoint}/${id}/cancel`,send('POST',{})).catch(()=>undefined);}
  }
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;clearTimeout(timer.current);};},[]);
  useEffect(()=>{if(!run||matches())return;epoch.current++;clearTimeout(timer.current);setBusy(false);setPreview(null);setReady(false);setRun(null);setError('画布已变化，旧提案保留在审计中；请按当前草稿重新生成。');if(active)void api(`${endpoint}/${run.run_id}/cancel`,send('POST',{})).catch(()=>undefined);},[doc,revision]);
  async function start(stage:'brief'|'structure'){
    if(!shared||!prompt.trim())return;const token=++epoch.current;clearTimeout(timer.current);setBusy(true);setError('');setPreview(null);setReady(false);baseline.current={doc:structuredClone(doc),revision};
    try{
      const request={protocol_version:1,mode:'diagram',diagram_id:record.id,base_revision:revision,doc,skill_id:skill,diagram_stage:stage,share_metadata:shared,prompt,request_id:crypto.randomUUID(),max_tokens:maxTokens,timeout_seconds:120,...(run?.session_id?{session_id:run.session_id}:{session_budget:sessionBudget}),...(stage==='structure'?{facts_confirmed:true,brief,facts,source_prompt:source}:{})};
      if(stage==='brief'){setSource([doc.meta.source_text||'',prompt].filter(Boolean).join('\n'));setFacts([]);setBrief('');}
      const started=await api<Run>(endpoint,send('POST',request));if(token!==epoch.current)return;remember(started.run_id);setRun(started);await poll(started.run_id,token);
    }catch(e){if(token===epoch.current){setBusy(false);setError(e instanceof Error?e.message:'请求失败');}}
  }
  async function reconnect(){
    const id=localStorage.getItem(storageKey);if(!id)return;const token=++epoch.current;setError('');
    try{const restored=await api<{run:Run;baseline?:{config:DiagramDoc;base_revision:number};candidate?:{run:Run;baseline:{config:DiagramDoc;base_revision:number}};input_text?:string;recovery_note?:string}>(`${endpoint}/${id}/resume`);if(token!==epoch.current)return;
      const base=restored.candidate?.baseline||restored.baseline;
      if(!base||JSON.stringify(base.config)!==JSON.stringify(doc)||base.base_revision!==revision){setError(restored.recovery_note||'运行的画布基线已变化，历史提案只能追溯，请重新生成。');return;}
      baseline.current={doc:structuredClone(base.config),revision:base.base_revision};setPrompt(restored.input_text||prompt);setSource([base.config.meta.source_text||'',restored.input_text||prompt].filter(Boolean).join('\n'));setShared(true);setBusy(true);await poll(restored.run.run_id,token);
    }catch(e){setError(e instanceof Error?e.message:'恢复失败');}
  }
  async function previewFixes(){if(!proposal||!report||!matches())return;const token=++epoch.current;setBusy(true);setError('');try{const operations=selectedOperations(report,selected,ignored);const result=await api<{doc:DiagramDoc}>(`/projects/${record.project_id}/diagram-tools/preview`,send('POST',{protocol_version:1,diagram_id:record.id,base_revision:revision,doc:proposal.doc,operations}));if(token===epoch.current&&matches()){setPreview(result.doc);setReady(true);}}catch(e){setError(e instanceof Error?e.message:'预览失败');}finally{if(token===epoch.current)setBusy(false);}}
  async function apply(){if(!run||!proposal||!report||!ready||!matches())return;const token=++epoch.current;setBusy(true);setError('');try{const result=await api<{doc:DiagramDoc}>(`${endpoint}/${run.run_id}/decision`,send('POST',{outcome:'accepted',proposal_hash:run.proposal_hash,review_hash:report.review_hash,accepted_fixes:[...selected].filter(id=>!ignored.has(id)).sort()}));if(token!==epoch.current)return;if(!matches())throw new Error('确认期间画布已变化，未替换当前草稿。');setPreview(null);setReady(false);setRun(null);edit(result.doc);}catch(e){setError(e instanceof Error?e.message:'应用失败');}finally{if(token===epoch.current)setBusy(false);}}
  async function end(){if(!run)return;epoch.current++;clearTimeout(timer.current);setBusy(true);try{if(run.status==='proposed')await api(`${endpoint}/${run.run_id}/decision`,send('POST',{outcome:'rejected',reason:'用户结束机制图提案',proposal_hash:run.proposal_hash}));else await api(`${endpoint}/${run.run_id}/cancel`,send('POST',{}));setRun(null);setPreview(null);setReady(false);}catch(e){setError(e instanceof Error?e.message:'结束失败');}finally{setBusy(false);}}
  const chosen=catalog.skills.find(s=>s.id===skill);
  const panel=opened?<section className="diagram-agent-panel" aria-label="机制图绘图助手">
    <header><h2>绘图助手</h2><Button variant="ghost" size="sm" onClick={()=>setOpened(false)}>返回属性</Button></header>
    <div className="diagram-agent-scroll">
      <label>绘图方案<select aria-label="绘图方案" value={skill} disabled={busy||active} onChange={e=>{setSkill(e.target.value);setFacts([]);setBrief('');setRun(null);setPreview(null);}}>{catalog.skills.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><p className="tiny-note">{chosen?.description} 推荐风格：{catalog.styles.find(s=>s.id===chosen?.recommended_styles[0])?.name}。</p>
      <label>描述这张图<textarea aria-label="机制图绘图需求" maxLength={2000} rows={5} value={prompt} disabled={active} onChange={e=>{setPrompt(e.target.value);setFacts([]);setBrief('');}}/></label>
      <label className="diagram-agent-consent"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/>同意将当前文档和描述发送至已配置的模型服务</label>
      <details><summary>用量设置</summary><label>单次用量上限<input aria-label="机制图单次用量" type="number" min={2000} max={60000} step={1000} value={maxTokens} onChange={e=>setMaxTokens(Number(e.target.value))}/></label><label>新会话用量上限<input aria-label="机制图会话用量" type="number" min={60000} max={600000} step={10000} disabled={!!run?.session_id} value={sessionBudget} onChange={e=>setSessionBudget(Number(e.target.value))}/></label></details>
      {run&&<p role="status">{({queued:'排队中',briefing:'整理简报',awaiting_facts:'请确认事实',structuring:'生成结构',awaiting_render:'排版与几何检查',reviewing:'审稿中',proposed:'结构提案待确认'} as Record<string,string>)[run.phase]||run.reason||'本轮已结束'}</p>}
      {error&&<p role="alert">{error}</p>}
      {brief&&<section aria-label="简报与事实"><h3>简报</h3><label>一句话要点<textarea aria-label="机制图简报" value={brief} onChange={e=>setBrief(e.target.value)} maxLength={1000}/></label><h3>事实列表</h3>{facts.map((fact,index)=><div className="diagram-agent-fact" key={index}><label>事实 {index+1}<textarea aria-label={`事实 ${index+1}`} value={fact.text} maxLength={1000} onChange={e=>setFacts(old=>old.map((f,i)=>i===index?{...f,text:e.target.value}:f))}/></label><small>出处：{fact.quote}</small><Button variant="ghost" size="sm" onClick={()=>setFacts(old=>old.filter((_,i)=>i!==index))}>删除事实 {index+1}</Button></div>)}{run?.diagram?.question&&<p>{run.diagram.question}</p>}<Button disabled={busy||active||!facts.length||facts.some(f=>!f.text.trim())||!shared||!!proposal} onClick={()=>void start('structure')}>确认事实，生成结构提案</Button></section>}
      {proposal&&report&&<section aria-label="机制图结构提案"><h3>结构提案</h3><p>{run?.text||'请核对画布中的结构预览。'}</p><p className="tiny-note">蓝色编号是提案涉及的节点，尚未应用；审稿修复可逐项取消。</p><ReviewIssues report={report} selected={selected} ignored={ignored} onSelect={id=>{setSelected(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;});setReady(false);setPreview(proposal.doc);}} onIgnore={id=>{setIgnored(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;});setReady(false);setPreview(proposal.doc);}} describeOperation={op=>({set_style:'调整字号或线宽',set_legend:'显示图例',update_node:'调整节点',update_edge:'调整走线'} as Record<string,string>)[op.tool]||'调整机制图'}/></section>}
    </div>
    <footer>{proposal?<><Button variant="outline" disabled={busy} onClick={()=>void previewFixes()}>预览这组调整</Button><Button disabled={busy||!ready} onClick={()=>void apply()}>应用这组调整</Button><p className="tiny-note">应用进入草稿，可一次撤销；保存需另行执行。</p></>:<Button disabled={busy||active||!shared||!prompt.trim()||maxTokens<2000||maxTokens>60000} onClick={()=>void start('brief')}>{busy?'正在处理…':'生成简报与事实'}</Button>}{run&&<Button variant="ghost" disabled={busy&&!active} onClick={()=>void end()}>{active?'取消运行':'结束本轮'}</Button>}<Button variant="ghost" disabled={busy||active} onClick={()=>void reconnect()}>恢复上次对话</Button></footer>
  </section>:null;
  return {open:()=>setOpened(true),close:()=>setOpened(false),panel,candidate:preview,markers:proposal&&preview?<g className="diagram-agent-markers" transform="scale(.25)">{preview.nodes.filter(n=>proposal.changes.some(c=>c.path.startsWith(`/nodes/${preview.nodes.indexOf(n)}/`))).map((n,i)=><NumberMarker key={n.id} marker={{number:i+1,kind:'title',x:n.x*4,y:n.y*4,width:n.w*4,height:n.h*4,paths:[]}} width={preview.canvas.width_mm*4} height={preview.canvas.height_mm*4}/>)}</g>:null};
}
