import {useEffect,useMemo,useRef,useState} from 'react';
import {api,send} from '../lib/api';
import {Button} from '../components/ui/button';
import {selectedOperations,type ReviewResult} from '../editor/review';
import {NumberMarker} from '../editor/workbench/NumberMarker';
import {collectDiagramFacts} from './collectFacts';
import {layoutDiagram} from './layout';
import type {DiagramOperation} from './operations';
import {selectProposalFacts,structureItems,applicableOperation,type Fact,type DiagramAgentProposal} from './agentProposal';
import {diagramReviewMarker} from './reviewMarkers';
import {edgePoints} from './render/geometry';
import type {DiagramCatalog,DiagramDoc,DiagramRecord} from './model';

type Proposal=DiagramAgentProposal;
type Run={run_id:string;session_id:string;status:string;phase:string;reason:string;text:string;historical?:boolean;persisted:boolean;proposal_hash?:string;proposal?:Proposal;review?:ReviewResult<DiagramOperation>;diagram?:{kind:string;brief:string;facts:Fact[];cannot_imply?:string;question?:string}};
export function useDiagramAgent(doc:DiagramDoc,record:DiagramRecord,revision:number,catalog:DiagramCatalog,edit:(d:DiagramDoc)=>void){
  const [opened,setOpened]=useState(false),[skill,setSkill]=useState(doc.meta.skill||catalog.skills[0]?.id||'workflow'),[prompt,setPrompt]=useState(''),[shared,setShared]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[run,setRun]=useState<Run|null>(null),[brief,setBrief]=useState(''),[facts,setFacts]=useState<Fact[]>([]),[source,setSource]=useState(''),[cannot,setCannot]=useState('不暗示未提供的分子、数值或因果关系'),[chosenFacts,setChosenFacts]=useState(new Set<number>()),[allowSmall,setAllowSmall]=useState(false),[applied,setApplied]=useState(false),[selected,setSelected]=useState(new Set<string>()),[ignored,setIgnored]=useState(new Set<string>()),[preview,setPreview]=useState<DiagramDoc|null>(null),[ready,setReady]=useState(false),[maxTokens,setMaxTokens]=useState(60000),[sessionBudget,setSessionBudget]=useState(180000);
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
      if(next.diagram?.kind==='brief'){setBrief(next.diagram.brief);setFacts(next.diagram.facts);setChosenFacts(new Set(next.diagram.facts.map((_,i)=>i)));setCannot(next.diagram.cannot_imply||'不暗示未提供的分子、数值或因果关系');}
      if(next.status==='proposed'&&next.proposal){setBrief(next.proposal.doc.meta.brief);setCannot(next.proposal.doc.meta.cannot_imply||'不暗示未提供的分子、数值或因果关系');if(next.proposal.facts){setFacts(next.proposal.facts);setChosenFacts(new Set(next.proposal.selected_facts||next.proposal.facts.map((_,i)=>i)));}const report=next.review||next.proposal.review;setSelected(new Set(report.issues.filter(i=>i.fixable).map(i=>i.id)));setIgnored(new Set());setPreview(next.proposal.doc);setReady(false);}
      if(['failed','incomplete','cancelled'].includes(next.status))setError(next.reason||'本轮未生成可应用提案。');
    }catch(e){if(token!==epoch.current||!mounted.current)return;setBusy(false);setError(e instanceof Error?e.message:'读取运行失败');void api(`${endpoint}/${id}/cancel`,send('POST',{})).catch(()=>undefined);}
  }
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;clearTimeout(timer.current);};},[]);
  useEffect(()=>{if(!run||matches())return;epoch.current++;clearTimeout(timer.current);setBusy(false);setPreview(null);setReady(false);setRun(null);setError('画布已变化，旧提案保留在审计中；请按当前草稿重新生成。');if(active)void api(`${endpoint}/${run.run_id}/cancel`,send('POST',{})).catch(()=>undefined);},[doc,revision]);
  async function start(stage:'brief'|'structure'){
    if(!shared||!prompt.trim())return;const token=++epoch.current;clearTimeout(timer.current);setBusy(true);setApplied(false);setError('');setPreview(null);setReady(false);baseline.current={doc:structuredClone(doc),revision};
    try{
      const request={protocol_version:1,mode:'diagram',diagram_id:record.id,base_revision:revision,doc,skill_id:skill,diagram_stage:stage,share_metadata:shared,prompt,request_id:crypto.randomUUID(),max_tokens:maxTokens,timeout_seconds:120,allow_below_style_defaults:allowSmall,...(run?.session_id?{session_id:run.session_id}:{session_budget:sessionBudget}),...(stage==='structure'?{facts_confirmed:true,brief,facts,cannot_imply:cannot,selected_facts:[...chosenFacts].sort((a,b)=>a-b),source_prompt:source}:{})};
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
  const filtered=useMemo(()=>proposal?selectProposalFacts(proposal,chosenFacts):null,[proposal,chosenFacts]);
  const items=useMemo(()=>filtered?structureItems(baseline.current.doc,filtered):[],[filtered]);
  const enabledFixIds=report?.issues.filter(i=>i.fixable&&i.fix.some(op=>filtered&&applicableOperation(filtered,op))).map(i=>i.id)||[];
  const acceptedFixIds=[...selected].filter(id=>!ignored.has(id)&&enabledFixIds.includes(id)).sort();
  useEffect(()=>{
    if(!proposal||!report||!filtered||!matches())return;
    const token=++epoch.current;setReady(false);setPreview(filtered);
    const operations=selectedOperations(report,new Set(acceptedFixIds)).filter(op=>applicableOperation(filtered,op));
    void api<{doc:DiagramDoc}>(`/projects/${record.project_id}/diagram-tools/preview`,send('POST',{protocol_version:1,diagram_id:record.id,base_revision:revision,doc:filtered,operations})).then(result=>{if(token===epoch.current&&matches()){setPreview(result.doc);setReady(true);}}).catch(e=>{if(token===epoch.current)setError(e instanceof Error?e.message:'预览失败');});
  },[proposal,filtered,[...selected].sort().join('|'),[...ignored].sort().join('|')]);
  async function apply(){if(!run||!proposal||!report||!ready||!matches())return;const token=++epoch.current;setBusy(true);setError('');try{const result=await api<{doc:DiagramDoc}>(`${endpoint}/${run.run_id}/decision`,send('POST',{outcome:'accepted',proposal_hash:run.proposal_hash,review_hash:report.review_hash,accepted_fixes:acceptedFixIds,accepted_facts:[...chosenFacts].sort((a,b)=>a-b)}));if(token!==epoch.current)return;if(!matches())throw new Error('确认期间画布已变化，未替换当前草稿。');setPreview(null);setReady(false);setRun(null);setFacts([]);setBrief('');setPrompt('');setApplied(true);edit(result.doc);}catch(e){setError(e instanceof Error?e.message:'应用失败');}finally{if(token===epoch.current)setBusy(false);}}
  async function end(){if(!run)return;epoch.current++;clearTimeout(timer.current);setBusy(true);try{if(run.status==='proposed')await api(`${endpoint}/${run.run_id}/decision`,send('POST',{outcome:'rejected',reason:'用户结束机制图提案',proposal_hash:run.proposal_hash}));else await api(`${endpoint}/${run.run_id}/cancel`,send('POST',{}));setRun(null);setPreview(null);setReady(false);}catch(e){setError(e instanceof Error?e.message:'结束失败');}finally{setBusy(false);}}
  const chosen=catalog.skills.find(s=>s.id===skill);
  const invalidate=()=>{setReady(false);setPreview(null);if(proposal){setRun(null);setError('事实或简报已编辑，请重新生成结构提案。');}};
  function toggleFact(index:number){if(proposal?.selected_facts&&!proposal.selected_facts.includes(index)&&!chosenFacts.has(index)){setRun(null);setError('此事实未用于当前提案，请重新生成结构。');}setReady(false);setPreview(null);setChosenFacts(old=>{const next=new Set(old);next.has(index)?next.delete(index):next.add(index);return next;});}
  const visibleIssue=(issue:NonNullable<typeof report>['issues'][number])=>{
    const field=issue.anchor.kind==='node'?'nodes':issue.anchor.kind==='edge'?'edges':null;if(!field||!filtered||!proposal)return true;
    const owner=proposal.doc[field][Number(issue.anchor.ref)];return !owner||filtered[field].some(n=>n.id===owner.id);
  };
  const fixes=report?.issues.filter(i=>i.fixable&&enabledFixIds.includes(i.id))||[],opinions=report?.issues.filter(i=>!i.fixable&&visibleIssue(i))||[];
  const shown=ready&&preview?preview:filtered;
  const panel=opened?<section className="diagram-agent-panel" aria-label="机制图绘图助手">
    <header><h2>绘图助手</h2><button type="button" className="diagram-text-link" onClick={()=>setOpened(false)}>返回属性</button></header>
    <div className="diagram-agent-scroll">
      <label className="diagram-agent-skill">绘图方案<select aria-label="绘图方案" value={skill} disabled={busy||active} onChange={e=>{setSkill(e.target.value);setFacts([]);setBrief('');setRun(null);setPreview(null);}}>{catalog.skills.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><p className="tiny-note diagram-agent-rule">简报 → 事实 → 结构 · 推荐{catalog.styles.find(s=>s.id===chosen?.recommended_styles[0])?.name}</p>
      <details open={!brief&&!proposal} className="diagram-agent-input"><summary>{prompt?'查看或修改用户描述':'描述这张图'}</summary>
        <textarea aria-label="机制图绘图需求" maxLength={2000} rows={3} value={prompt} disabled={active} onChange={e=>{setPrompt(e.target.value);setFacts([]);setBrief('');setRun(null);setPreview(null);setApplied(false);}}/>
        <label className="diagram-agent-consent"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/>同意将当前文档和描述发送至已配置的模型服务</label>
        <details><summary>用量与样式设置</summary><label>单次用量上限<input aria-label="机制图单次用量" type="number" min={2000} max={60000} step={1000} value={maxTokens} onChange={e=>setMaxTokens(Number(e.target.value))}/></label><label>新会话用量上限<input aria-label="机制图会话用量" type="number" min={60000} max={600000} step={10000} disabled={!!run?.session_id} value={sessionBudget} onChange={e=>setSessionBudget(Number(e.target.value))}/></label><label><input type="checkbox" checked={allowSmall} onChange={e=>{setAllowSmall(e.target.checked);invalidate();}}/>我明确要求低于风格默认的字号或线宽</label><p className="tiny-note">默认至少7 pt、1 pt；只有你明确勾选允许后，模型才能提出更小的值。</p></details>
      </details>
      {active&&<p role="status">{({queued:'排队中',briefing:'整理简报',structuring:'生成结构',awaiting_render:'排版与几何检查',reviewing:'审稿中'} as Record<string,string>)[run?.phase||'']||'正在处理…'}</p>}
      {applied&&<p role="status">已应用到草稿，可一次撤销；保存需另行执行。</p>}
      {error&&<p role="alert">{error}</p>}
      {brief&&<section className="diagram-agent-summary" aria-label="简报与事实"><h3 className="sr-only">简报</h3><SummaryLine label="要点" value={brief} disabled={active} onChange={value=>{setBrief(value);invalidate();}}/><SummaryLine label="不能暗示" value={cannot} disabled={active} onChange={value=>{setCannot(value);invalidate();}}/></section>}
      {facts.length>0&&<section className="diagram-agent-facts" aria-label="事实列表"><header><h3>事实列表</h3><small>取消勾选即从提案中去掉</small></header>{facts.map((fact,index)=><FactLine key={index} fact={fact} index={index} checked={chosenFacts.has(index)} disabled={active} onToggle={()=>toggleFact(index)} onChange={value=>{setFacts(old=>old.map((f,i)=>i===index?{...f,text:value}:f));invalidate();}}/>)}{run?.diagram?.question&&<p className="tiny-note">{run.diagram.question}</p>}</section>}
      {proposal&&report&&<section className="diagram-agent-proposal" aria-label="机制图结构提案"><header><h3>结构提案</h3><small>{items.length}项结构 · {fixes.length}项修复</small></header>
        <section aria-label="按事实生成的结构"><h4>按事实生成的结构</h4><ol className="diagram-structure-list">{items.map(item=><li key={item.field+item.id}><span className="diagram-item-number">{item.number}</span><span>{item.text}</span></li>)}</ol>{!items.length&&<p className="tiny-note">当前事实选择没有新增结构。</p>}</section>
        <section aria-label="审稿修复"><h4>审稿修复 · 可逐条取消</h4>{fixes.map((issue,index)=><div className="diagram-agent-fix" key={issue.id}><label><input type="checkbox" aria-label={`修复 ${issue.title}`} checked={selected.has(issue.id)&&!ignored.has(issue.id)} disabled={busy||ignored.has(issue.id)} onChange={()=>{setSelected(old=>{const n=new Set(old);n.has(issue.id)?n.delete(issue.id):n.add(issue.id);return n;});setReady(false);}}/><span className="diagram-item-number repair">{items.length+index+1}</span><span>{issue.title}<small>{issue.fix.map(op=>op.tool==='set_style'?`${op.arguments.overrides?JSON.stringify(op.arguments.overrides).replace(/[{}"]/g,''):'风格默认'}`:op.tool==='set_legend'?'补上连线图例':'检查预览后的几何位置').join('；')}</small></span></label><button type="button" className="diagram-text-link" onClick={()=>{setIgnored(old=>{const n=new Set(old);n.has(issue.id)?n.delete(issue.id):n.add(issue.id);return n;});setReady(false);}}>{ignored.has(issue.id)?'恢复':'忽略'}</button></div>)}{!fixes.length&&<p className="tiny-note">没有可自动修复项。</p>}</section>
        <section aria-label="需要你确认"><h4>需要你确认</h4>{opinions.map(issue=><details key={issue.id} className="diagram-agent-opinion"><summary><span>{issue.severity==='info'?'参考':'需确认'} · {issue.title}</span><small>{issue.rule}</small></summary><p className="tiny-note">{issue.detail}</p></details>)}{!opinions.length&&<p className="tiny-note">暂无额外确认项。</p>}</section>
      </section>}
    </div>
    <footer><p className="tiny-note">{proposal?'确认后进入草稿，可一步撤销；不会自动保存。':'先确认有原文出处的事实，再生成结构。'}</p>
      {proposal?<Button disabled={busy||!ready||!shared} onClick={()=>void apply()}>{ready?`应用这组调整（${items.length+acceptedFixIds.length}项）`:'正在更新预览…'}</Button>:brief?<Button disabled={busy||active||!chosenFacts.size||[...chosenFacts].some(i=>!facts[i]?.text.trim())||!shared} onClick={()=>void start('structure')}>确认事实，生成结构提案</Button>:<Button disabled={busy||active||!shared||!prompt.trim()||maxTokens<2000||maxTokens>60000} onClick={()=>void start('brief')}>{busy?'正在处理…':'生成简报与事实'}</Button>}
      <div className="diagram-agent-links">{run&&<button type="button" className="diagram-text-link" disabled={busy&&!active} onClick={()=>void end()}>{active?'取消运行':'结束本轮'}</button>}<button type="button" className="diagram-text-link" disabled={busy||active} onClick={()=>void reconnect()}>恢复上次对话</button></div>
    </footer>
  </section>:null;
  let global=0;
  const markers=proposal&&shown?<g className="diagram-agent-markers" transform="scale(.25)">{items.filter(i=>!i.removed).map(item=>{const node=item.field==='nodes'?shown.nodes.find(n=>n.id===item.id):item.field==='zones'?shown.zones.find(n=>n.id===item.id):undefined;let box=node||{x:8,y:8,w:0,h:0};if(item.field==='edges'){const edge=shown.edges.find(e=>e.id===item.id),points=edge?edgePoints(shown,edge):[],point=points[Math.floor(points.length/2)];if(point)box={...point,w:0,h:0};}return <NumberMarker key={item.field+item.id} marker={{number:item.number,kind:node?'title':'series',x:box.x*4,y:box.y*4,width:box.w*4,height:box.h*4,paths:[]}} width={shown.canvas.width_mm*4} height={shown.canvas.height_mm*4}/>;})}{fixes.filter(i=>selected.has(i.id)&&!ignored.has(i.id)).map(issue=>{const number=items.length+fixes.indexOf(issue)+1;const marker=diagramReviewMarker(proposal.doc,issue,number,global++);return <g className="diagram-agent-repair-marker" key={issue.id}><NumberMarker marker={marker} width={shown.canvas.width_mm*4} height={shown.canvas.height_mm*4}/></g>;})}</g>:null;
  return {open:()=>setOpened(true),close:()=>setOpened(false),panel,candidate:proposal?shown:preview,markers};
}
function SummaryLine({label,value,onChange,disabled}:{label:string;value:string;onChange:(s:string)=>void;disabled:boolean}){
 const [editing,setEditing]=useState(false);return <div className="diagram-brief-line"><span>{label}</span>{editing?<textarea autoFocus aria-label={label==='要点'?'机制图简报':'机制图不能暗示'} rows={2} maxLength={label==='要点'?1000:500} value={value} onChange={e=>onChange(e.target.value)} onBlur={()=>setEditing(false)}/>:<button type="button" className="diagram-inline-edit" disabled={disabled} title="点击编辑" onClick={()=>setEditing(true)}>{value||'点击填写'}</button>}</div>;
}
function FactLine({fact,index,checked,disabled,onToggle,onChange}:{fact:Fact;index:number;checked:boolean;disabled:boolean;onToggle:()=>void;onChange:(v:string)=>void}){
 const [editing,setEditing]=useState(false);return <div className={`diagram-agent-fact ${checked?'':'excluded'}`}><input type="checkbox" aria-label={`使用事实 ${index+1}`} checked={checked} disabled={disabled} onChange={onToggle}/><div>{editing?<textarea autoFocus aria-label={`事实 ${index+1}`} value={fact.text} maxLength={1000} rows={2} onChange={e=>onChange(e.target.value)} onBlur={()=>setEditing(false)}/>:<button type="button" className="diagram-inline-edit" aria-label={`编辑事实 ${index+1}`} disabled={disabled} onClick={()=>setEditing(true)}>{fact.text}</button>}<small>原文「{fact.quote}」</small></div></div>;
}
