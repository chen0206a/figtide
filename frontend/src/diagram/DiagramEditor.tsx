import {DiagramReferenceStyle} from "./DiagramReferenceStyle";
import {DiagramIconPanel} from "./DiagramIconPanel";
import {useDiagramAgent} from "./DiagramAgent";
import {useDiagramReview,DiagramReviewMarkers} from "./DiagramReview";
import {PaletteSelect} from "./PaletteSelect";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, send } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { useConfirm } from "../components/useConfirm";
import type { DiagramCatalog, DiagramDoc, DiagramRecord, DiagramNode, DiagramEdge, DiagramZone } from "./model";
import { alignSelection, duplicateSelection, freshId, moveSelection, removeSelection } from "./editing";
import { layoutDiagram } from "./layout";
import { DiagramExport } from "./DiagramExport";
import { DiagramCanvas } from "./DiagramCanvas";
import { DiagramProperties, edgeKinds, nodeKinds, zoneKinds } from "./DiagramProperties";
import { useDiagramDocument } from "./useDiagramDocument";
import {glyphMarkup,type GlyphKind} from "./render/glyphs";

export function DiagramEditor({record,catalog,onLeaveGuard,notify}:{record:DiagramRecord;catalog:DiagramCatalog;onLeaveGuard:(g:(()=>boolean)|null)=>void;notify:(s:string)=>void}) {
  const state=useDiagramDocument(record,onLeaveGuard,notify),{doc,edit}=state;
  const [selected,setSelected]=useState(new Set<string>()),[zoom,setZoom]=useState(1),[nodeKind,setNodeKind]=useState<DiagramNode["kind"]>("box"),[zoneKind,setZoneKind]=useState<DiagramZone["kind"]>("panel"),[edgeKind,setEdgeKind]=useState<DiagramEdge["kind"]>("flow"),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const [assetTab,setAssetTab]=useState("glyphs");
  const [glyphCategory,setGlyphCategory]=useState(doc.meta.skill==="bio-mechanism"||doc.meta.template?.includes("mechanism")?"biology":["physics-device","chem-materials","workflow"].includes(doc.meta.skill||"")||["workflow","zoom-workflow"].includes(doc.meta.template||"")?"experiment":doc.meta.skill==="ml-framework"||["framework","pipeline"].includes(doc.meta.template||"")?"ml":"all");
  const review=useDiagramReview(doc,record,state.revision,catalog,edit);
  const agent=useDiagramAgent(doc,record,state.revision,catalog,edit);
  const [exportOpen,setExportOpen]=useState(false),[referenceOpen,setReferenceOpen]=useState(false);
  const [versionsOpen,setVersionsOpen]=useState(false),[restoring,setRestoring]=useState(false);
  const {confirm,dialog}=useConfirm(),canvasHost=useRef<HTMLDivElement>(null),inspector=useRef<HTMLDivElement>(null);
  const fitEnabled=useRef(true);
  function fitWidth(){const width=canvasHost.current?.clientWidth;if(width)setZoom(Math.max(4,width*.9/doc.canvas.width_mm)/(96/25.4));}
  function changeZoom(value:number){fitEnabled.current=false;setZoom(value);}
  useEffect(()=>{const host=canvasHost.current;if(!host)return;const observer=new ResizeObserver(()=>{if(fitEnabled.current)fitWidth();});observer.observe(host);return()=>observer.disconnect();},[doc.canvas.width_mm]);
  const selectedKey=[...selected].join(',');
  useEffect(()=>{if(inspector.current)inspector.current.scrollTop=0;},[selectedKey]);
  const versions=useQuery({queryKey:["diagram-versions",record.project_id,record.id,state.revision],queryFn:()=>api<{version:number;doc:DiagramDoc;created_at:string}[]>(`/projects/${record.project_id}/diagrams/${record.id}/versions`),enabled:versionsOpen});
  const style=catalog.styles.find(s=>s.id===doc.style.preset)||catalog.styles[0];
  const mutate=(action:(d:DiagramDoc)=>DiagramDoc)=>{edit(action);};
  const connect=(source:string,target:string)=>mutate(d=>{if(source&&target&&source!==target&&d.edges.length<200){d.edges.push({id:freshId(d,"e"),from:source,to:target,kind:edgeKind,label:"",route:"straight"});}return d;});
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const command=e.ctrlKey||e.metaKey,typing=(e.target as HTMLElement)?.matches?.("input,textarea,select,[contenteditable=true]");
      if(command&&e.key.toLowerCase()==="s"){e.preventDefault();void state.save();return;}
      if(typing||state.pendingDraft||review.candidate||agent.candidate)return;
      if(command&&e.key.toLowerCase()==="z"){e.preventDefault();if(e.shiftKey)state.redo();else state.undo();return;}
      if(command&&e.key.toLowerCase()==="y"){e.preventDefault();state.redo();return;}
      if(command&&e.key.toLowerCase()==="d"&&selected.size){e.preventDefault();mutate(d=>duplicateSelection(d,selected));return;}
      if((e.key==="Delete"||e.key==="Backspace")&&selected.size){e.preventDefault();mutate(d=>removeSelection(d,selected));setSelected(new Set());return;}
      const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(delta[e.key]&&selected.size){e.preventDefault();const [x,y]=delta[e.key],scale=e.shiftKey?5:1;mutate(d=>moveSelection(d,selected,x*scale,y*scale));}
      if(e.key==="Escape")setSelected(new Set());
    };window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  });
  function addNode(glyph?:string,point?:{x:number;y:number}){mutate(d=>{
    if(d.nodes.length>=120){notify("最多120个节点");return d;}
    const id=freshId(d,"n"),w=Math.min(28,d.canvas.width_mm-4),h=Math.min(glyph?24:14,d.canvas.height_mm-4),cx=point?.x??d.canvas.width_mm/2,cy=point?.y??d.canvas.height_mm/2;
    const x=Math.max(0,Math.min(d.canvas.width_mm-w,cx-w/2)),y=Math.max(0,Math.min(d.canvas.height_mm-h,cy-h/2));
    d.nodes.push({id,kind:glyph?"glyph":nodeKind,...(glyph||nodeKind==="glyph"?{glyph:glyph||"protein",label_pos:"below" as const,boxed:false,badges:[]}:{}),x,y,w,h,label:glyph?(catalog.glyphs.find(g=>g.id===glyph)?.name||"New glyph"):"New node",zone:null,icon:null,role:"process",style_ref:null});setSelected(new Set([id]));return d;
  });}
  function addIcon(id:string,point?:{x:number;y:number}){const icon=catalog.icons.find(i=>i.id===id);if(!icon)return;mutate(d=>{if(d.nodes.length>=120){notify("最多120个节点");return d;}const w=Math.min(52,d.canvas.width_mm-4),h=Math.min(30,d.canvas.height_mm-4),x=Math.max(0,Math.min(d.canvas.width_mm-w,(point?.x??d.canvas.width_mm/2)-w/2)),y=Math.max(0,Math.min(d.canvas.height_mm-h,(point?.y??d.canvas.height_mm/2)-h/2)),node=freshId(d,"n");d.nodes.push({id:node,kind:"icon",icon:id,label:doc.label_language==="zh"?icon.name.zh:icon.name.en,x,y,w,h,zone:null,role:"actor",style_ref:null,label_pos:"right"});setSelected(new Set([node]));return d;});}
  function addZone(){mutate(d=>{if(d.zones.length>=30){notify("最多30个分区");return d;}const id=freshId(d,"z");d.zones.push({id,kind:zoneKind,label:"New zone",x:5,y:5,w:Math.min(zoneKind==="membrane"?120:60,d.canvas.width_mm-10),h:Math.min(zoneKind==="membrane"?8:40,d.canvas.height_mm-10),zoom_of:null});setSelected(new Set([id]));return d;});}
  async function restore(version:number){
    if(!await confirm(`将第 ${version} 版恢复为新版本？${state.dirty?"当前尚未保存的修改将被替换。":""}`))return;
    setRestoring(true);try{const next=await api<DiagramRecord>(`/projects/${record.project_id}/diagrams/${record.id}/restore`,send("POST",{base_revision:state.revision,version}));state.loadRecord(next);setSelected(new Set());setVersionsOpen(false);notify("已恢复为新版本");}catch(e){notify(e instanceof Error?e.message:"恢复失败");}finally{setRestoring(false);}
  }
  async function reload(){if(!await confirm("重新载入将替换当前草稿。继续？"))return;try{state.loadRecord(await api<DiagramRecord>(`/projects/${record.project_id}/diagrams/${record.id}`));setSelected(new Set());}catch(e){notify(e instanceof Error?e.message:"读取失败");}}
  return <main className="diagram-workbench" aria-label="机制图编辑器">
    <header className="diagram-toolbar"><Link to={`/projects/${record.project_id}/diagrams`}>机制图列表</Link><strong>{record.name}</strong><span className="lf-mono">v{state.revision}</span><span role="status">{state.dirty?state.draftStatus||"有未保存修改":"已保存"}</span>
      <div className="diagram-toolbar-actions"><Button variant="ghost" onClick={()=>{agent.close();review.open();}}>审稿这张图</Button><Button variant="ghost" onClick={()=>{review.close();agent.open();}}>绘图助手</Button><Button variant="ghost" onClick={()=>setExportOpen(true)}>导出机制图</Button><Button variant="ghost" onClick={()=>setReferenceOpen(true)}>参考风格</Button><Button variant="ghost" onClick={state.undo} disabled={!state.canUndo}>撤销</Button><Button variant="ghost" onClick={state.redo} disabled={!state.canRedo}>重做</Button><Button variant="ghost" onClick={()=>setVersionsOpen(true)}>版本历史</Button><Button variant="outline" disabled={state.saving||!!state.pendingDraft} onClick={()=>void state.save()}>保存机制图</Button></div>
    </header>
    {state.conflict&&<div className="diagram-conflict" role="alert">机制图已被更新，本机草稿仍保留。<Button variant="outline" onClick={()=>void reload()}>重新载入最新版本</Button></div>}
    <div className="diagram-body">
      <aside className="diagram-tools" aria-label="机制图工具">
        <h2>{assetTab==="glyphs"?"科学图元":"科研图标"}</h2><div className="diagram-asset-tabs"><Button size="sm" variant="ghost" aria-pressed={assetTab==="glyphs"} onClick={()=>setAssetTab("glyphs")}>图元</Button><Button size="sm" variant="ghost" aria-pressed={assetTab==="icons"} onClick={()=>setAssetTab("icons")}>图标库</Button></div>
        {assetTab==="icons"?<DiagramIconPanel catalog={catalog} doc={doc} style={style} onAdd={addIcon}/>:<><label>图元分类<select aria-label="图元分类" value={glyphCategory} onChange={e=>setGlyphCategory(e.target.value)}><option value="all">全部</option><option value="biology">细胞与分子</option><option value="ml">方法框架</option><option value="experiment">实验与装置</option><option value="markers">标记</option></select></label>
        <div className="diagram-glyph-grid">{catalog.glyphs.filter(g=>glyphCategory==="all"||g.category===glyphCategory).map(g=><button key={g.id} draggable onDragStart={e=>{e.dataTransfer.setData("application/x-figtide-glyph",g.id);e.dataTransfer.effectAllowed="copy";}} title={g.name} aria-label={`插入${g.name}`} onClick={()=>addNode(g.id)}><svg viewBox="0 0 16 14" aria-hidden="true" dangerouslySetInnerHTML={{__html:glyphMarkup(g.id as GlyphKind,16,14,style)}}/><span>{({"input-frames":"视频帧",dna:"双螺旋",ligand:"配体",llm:"语言模型",attention:"注意力",tokens:"Token",layers:"堆叠层",dataset:"数据集","result-bars":"结果柱图","text-input":"文字输入"} as Record<string,string>)[g.id]||g.name.replace(/（.*）/,"")}</span></button>)}</div><p className="tiny-note">图元均为示意，不代表真实测量数据。</p>
        <p className="tiny-note">点击图元添加到画布中心，或拖到画布指定位置。选择节点后，从连接点拖出连线。</p></>}
      </aside>
      <section className="diagram-stage" ref={canvasHost}><div className="diagram-stage-toolbar"><span className="lf-mono">{doc.canvas.width_mm} × {doc.canvas.height_mm} mm · 1 mm 网格</span><Button size="sm" variant="ghost" aria-label="缩小机制图" onClick={()=>changeZoom(Math.max(.25,zoom-.1))}>−</Button><span className="lf-mono">{Math.round(zoom*100)}%</span><Button size="sm" variant="ghost" aria-label="放大机制图" onClick={()=>changeZoom(Math.min(10,zoom+.1))}>＋</Button><Button size="sm" variant="ghost" onClick={()=>{fitEnabled.current=true;fitWidth();}}>适应宽度</Button></div>
        <div className="diagram-stylebar" aria-label="机制图风格">{catalog.styles.map(preset=><button key={preset.id} aria-label={`选择风格 ${preset.name}`} aria-pressed={doc.style.preset===preset.id} onClick={()=>edit(d=>{d.style.preset=preset.id;return d;})}>{preset.name}</button>)}</div>
        <DiagramCanvas readOnly={!!review.candidate||!!agent.candidate} doc={agent.candidate||review.candidate||doc} style={catalog.styles.find(s=>s.id===(agent.candidate||review.candidate||doc).style.preset)||style} selected={selected} onSelect={setSelected} onEdit={edit} onConnect={connect} zoom={zoom} onZoom={changeZoom} onDropIcon={addIcon} onDropGlyph={(id,point)=>{if(catalog.glyphs.some(g=>g.id===id))addNode(id,point);}}>{agent.markers}{!agent.candidate&&!review.candidate&&<DiagramReviewMarkers doc={doc} report={review.report} ignored={review.ignored}/>}</DiagramCanvas>
        {review.candidate&&<p role="status" className="diagram-conflict">修复预览 · 尚未应用；请在右栏确认或取消。</p>}
        <p className="diagram-keyboard-help">方向键 1 mm · Shift 5 mm · Ctrl+D 复制 · Delete 删除 · Alt 拖动平移</p>
      </section>
      <div className="diagram-inspector" ref={inspector}>{agent.panel||review.panel||<><DiagramProperties doc={doc} selected={selected} edit={edit} journals={catalog.journals}/><PaletteSelect project={record.project_id} doc={doc} value={doc.style.palette} onChange={id=>mutate(d=>{d.style.palette=id;delete d.style.role_colors;return d;})} audits={catalog.palette_audits}/><details className="diagram-extra-tools"><summary>结构与连接</summary>        <h2>结构</h2><label>新节点类型<select aria-label="新节点类型" value={nodeKind} onChange={e=>setNodeKind(e.target.value as DiagramNode["kind"])}>{Object.entries(nodeKinds).filter(([kind])=>kind!=="icon").map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label><Button variant="outline" onClick={()=>addNode()}>添加节点</Button>
        <label>新分区类型<select aria-label="新分区类型" value={zoneKind} onChange={e=>setZoneKind(e.target.value as DiagramZone["kind"])}>{Object.entries(zoneKinds).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label><Button variant="outline" onClick={addZone}>添加分区</Button>
        <h3>连线</h3><label>新连线类型<select aria-label="新连线类型" value={edgeKind} onChange={e=>setEdgeKind(e.target.value as DiagramEdge["kind"])}>{Object.entries(edgeKinds).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
        <p className="tiny-note">选择节点，从右侧连接点拖至目标节点；也可选择起终点。</p>
        <label>起点<select aria-label="新连线起点" value={from} onChange={e=>setFrom(e.target.value)}><option value="">选择节点</option>{doc.nodes.map(n=><option key={n.id} value={n.id}>{n.label||n.id}</option>)}</select></label><label>终点<select aria-label="新连线终点" value={to} onChange={e=>setTo(e.target.value)}><option value="">选择节点</option>{doc.nodes.map(n=><option key={n.id} value={n.id}>{n.label||n.id}</option>)}</select></label><Button variant="outline" disabled={!from||!to||from===to} onClick={()=>connect(from,to)}>添加连线</Button>
        <Button variant="ghost" disabled={!selected.size} onClick={()=>mutate(d=>{const target=d.nodes.find(n=>selected.has(n.id))||d.zones.find(z=>selected.has(z.id));if(target&&d.annotations.length<120)d.annotations.push({id:freshId(d,"a"),kind:"note",target:target.id,text:"Note"});return d;})}>添加注释</Button>
        <h3>排版</h3><Button variant="outline" onClick={()=>mutate(layoutDiagram)}>整理排版</Button><div className="diagram-button-grid">{([['left','左对齐'],['top','顶对齐'],['horizontal','水平等距'],['vertical','垂直等距']] as const).map(([mode,name])=><Button variant="ghost" size="sm" key={mode} onClick={()=>mutate(d=>alignSelection(d,selected,mode))}>{name}</Button>)}</div>
        <Button variant="ghost" disabled={!selected.size} onClick={()=>mutate(d=>duplicateSelection(d,selected))}>复制选中</Button><Button variant="ghost" disabled={!selected.size} onClick={()=>{mutate(d=>removeSelection(d,selected));setSelected(new Set());}}>删除选中</Button>
        <h3>风格</h3><label>风格预设<select aria-label="风格预设" value={doc.style.preset} onChange={e=>edit(d=>{d.style.preset=e.target.value;return d;})}>{catalog.styles.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        <label>字号（pt）<input type="number" min="1" max="72" step="0.5" aria-label="机制图字号" value={doc.style.overrides.font_size_pt??style.font_size_pt} onChange={e=>edit(d=>{d.style.overrides.font_size_pt=Number(e.target.value);return d;})}/></label><label>线宽（pt）<input type="number" min="0.1" max="12" step="0.1" aria-label="机制图线宽" value={doc.style.overrides.line_width_pt??style.line_width_pt} onChange={e=>edit(d=>{d.style.overrides.line_width_pt=Number(e.target.value);return d;})}/></label>
        <Button variant="ghost" onClick={()=>edit(d=>{d.style.overrides={};return d;})}>重置风格覆盖</Button>
</details><details className="diagram-layers"><summary>图层</summary><div className="diagram-element-list" aria-label="机制图元素">{[...doc.zones,...doc.nodes,...doc.edges,...doc.annotations,...(doc.artworks||[])].map(n=><button key={n.id} aria-pressed={selected.has(n.id)} onClick={()=>{setSelected(new Set([n.id]));canvasHost.current?.querySelector<HTMLElement>('.diagram-canvas-scroll')?.focus();}}>{n.id} · {"from" in n?n.label||`${n.from} → ${n.to}`:"label" in n?n.label:"name" in n?`${n.name}${n.locked?" · 已锁定":""}${n.hidden?" · 已隐藏":""}`:n.text}</button>)}</div></details></>}</div>
    </div>
    {state.pendingDraft&&<Dialog open onOpenChange={()=>{}} title="发现机制图本机草稿" description={state.pendingDraft.revision===record.revision?"可以恢复上次未保存的编辑。":"草稿基于旧版本，恢复后保存可能遇到版本冲突；也可以使用当前已保存版本。"}><div className="dialog-actions"><Button variant="outline" onClick={state.discardDraft}>使用已保存版本</Button><Button onClick={state.restoreDraft}>恢复本机草稿</Button></div></Dialog>}
    <Dialog open={versionsOpen} onOpenChange={setVersionsOpen} title="机制图版本历史" description="恢复会创建一个新版本，原来的版本仍然保留。">{versions.isPending?<p>正在读取…</p>:versions.isError?<p role="alert">{versions.error.message}</p>:versions.data?.map(v=><div className="diagram-version" key={v.version}><span className="lf-mono">第 {v.version} 版 · {v.created_at}</span><Button variant="outline" disabled={restoring} onClick={()=>void restore(v.version)}>恢复第 {v.version} 版</Button></div>)}</Dialog>
    {referenceOpen&&<DiagramReferenceStyle project={record.project_id} doc={doc} catalog={catalog} edit={edit} onClose={()=>setReferenceOpen(false)}/>}
    {exportOpen&&<DiagramExport icons={catalog.icons} reviewErrors={review.reviewErrors} doc={doc} style={style} name={record.name} onClose={()=>setExportOpen(false)}/>}
    {dialog}
  </main>;
}
