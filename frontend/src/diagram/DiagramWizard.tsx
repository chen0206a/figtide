import {PageHeader} from "../components/PageHeader";
import {PaletteSelect} from "./PaletteSelect";
import { useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import type { DiagramCatalog, DiagramDoc } from "./model";
import { renderDiagram } from "./render/renderDiagram";
import {api,send} from "../lib/api";
export function DiagramWizard({catalog,onClose,onCreate,initialTemplate}:{initialTemplate?:string;catalog:DiagramCatalog;onClose:()=>void;onCreate:(name:string,doc:DiagramDoc)=>Promise<void>}) {
  const [palette,setPalette]=useState("okabe-ito");
  const [template,setTemplate]=useState(initialTemplate||catalog.templates[0]?.id||""),[style,setStyle]=useState("nature-flat"),[language,setLanguage]=useState<"en"|"zh">("en");
  const [name,setName]=useState("新机制图"),[size,setSize]=useState("double"),[journal,setJournal]=useState("default"),[width,setWidth]=useState(180),[height,setHeight]=useState(110),[busy,setBusy]=useState(false),[error,setError]=useState(""),[skill,setSkill]=useState("all"),[galleryFallback,setGalleryFallback]=useState(false);
  const selected=catalog.templates.find(t=>t.id===template),doc=selected?.documents[language];
  const rule=catalog.journals.find(j=>j.id===journal),w=size==="single"?rule?.single_column_mm||88:size==="double"?rule?.double_column_mm||180:width;
  const preview=useMemo(()=>{if(!doc)return null;const copy=structuredClone(doc),sx=w/copy.canvas.width_mm,sy=height/copy.canvas.height_mm;copy.canvas.width_mm=w;copy.canvas.height_mm=height;copy.style.preset=style;copy.style.palette=palette;for(const n of [...copy.nodes,...copy.zones]){n.x*=sx;n.w*=sx;n.y*=sy;n.h*=sy;}return copy;},[doc,w,height,style,palette]);
  async function create(){if(!doc)return;setBusy(true);setError("");try{const copy=structuredClone(doc),sx=w/copy.canvas.width_mm,sy=height/copy.canvas.height_mm;copy.canvas.width_mm=w;copy.canvas.height_mm=height;copy.style.preset=style;copy.style.palette=palette;for(const n of [...copy.nodes,...copy.zones]){n.x*=sx;n.w*=sx;n.y*=sy;n.h*=sy;}await onCreate(name,copy);}catch(e){setError(e instanceof Error?e.message:"创建失败");}finally{setBusy(false);}}
  const skills=catalog.skills.length?catalog.skills.map(s=>({...s,english:s.id})): [{id:"bio-mechanism",name:"生物医学机制图",english:"Biomedicine"},{id:"ml-framework",name:"方法框架图",english:"Method framework"},{id:"workflow",name:"实验流程图",english:"Experimental workflow"},{id:"chem-materials",name:"化学 / 材料机理",english:"Chemistry & materials"},{id:"physics-device",name:"物理装置与光路",english:"Physics & devices"},{id:"concept-abstract",name:"概念图与图形摘要",english:"Concept & abstract"}];
  const templateSkill=(id:string)=>catalog.skills.find(s=>s.templates.includes(id))?.id||catalog.templates.find(t=>t.id===id)?.documents.en.meta.skill||"concept-abstract";
  return <section className="diagram-new-page" aria-label="新建机制图">
    <PageHeader title="新建机制图" description="选择科研图示类型与模板，预览风格、配色和成品尺寸。" actions={<Button variant="ghost" disabled={busy} onClick={onClose}>取消</Button>}/>
    <div className="diagram-wizard-layout">
      <aside className="diagram-template-filters"><h2 className="lf-kicker">科研图示 · SKILL</h2><button aria-pressed={skill==="all"} onClick={()=>setSkill("all")}>全部模板 <span className="lf-mono">{catalog.templates.length}</span></button>{skills.map(s=><button key={s.id} aria-pressed={skill===s.id} onClick={()=>setSkill(s.id)}><strong>{s.name}</strong><small>{s.english}</small><span className="lf-mono">{catalog.templates.filter(t=>templateSkill(t.id)===s.id).length}</span></button>)}<p className="tiny-note">自制科研模板与可编辑矢量图元。</p></aside>
      <section className="diagram-template-browser" aria-label="选择机制图模板"><label>示例语言<select aria-label="模板语言" value={language} onChange={e=>setLanguage(e.target.value as "en"|"zh")}><option value="en">English</option><option value="zh">中文</option></select></label><div className="diagram-thumbnail-grid">{catalog.templates.filter(t=>skill==="all"||templateSkill(t.id)===skill).map(t=><button key={t.id} aria-label={t.name} className="diagram-thumbnail" aria-pressed={template===t.id} onClick={()=>{setTemplate(t.id);}}><span dangerouslySetInnerHTML={{__html:renderDiagram(t.documents[language],catalog.styles.find(s=>s.id===style)!,true)}}/><strong>{t.name}</strong><small className="lf-mono">{t.pattern}</small></button>)}</div>
      <p className="tiny-note"><a href="https://github.com/qwdwqfwq/topconf-paper-figure-gallery" target="_blank" rel="noopener noreferrer" onClick={galleryFallback?undefined:event=>{event.preventDefault();void api('/desktop/diagram-gallery',send('POST',{})).catch(()=>{setGalleryFallback(true);window.open('https://github.com/qwdwqfwq/topconf-paper-figure-gallery','_blank','noopener,noreferrer');});}}>看看别人怎么画 ↗</a><br/>外部网站，图片版权归原作者；FigTide 不收录论文图片。</p></section>
      <aside className="diagram-wizard-preview" aria-label="机制图创建预览">
        <div className="diagram-wizard-preview-scroll">
          <label className="diagram-name-field">机制图名称<input aria-label="机制图名称" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
          {preview&&<div className="diagram-large-preview" aria-label={`${selected?.name}预览`} dangerouslySetInnerHTML={{__html:renderDiagram(preview,catalog.styles.find(s=>s.id===style)!,true)}}/>}
          <div className="diagram-style-group"><h3>风格</h3>{doc&&<div className="diagram-style-row">{catalog.styles.map(s=><button key={s.id} title={s.name} aria-label={s.name} className="diagram-thumbnail diagram-style-choice" aria-pressed={style===s.id} onClick={()=>setStyle(s.id)}><span dangerouslySetInnerHTML={{__html:renderDiagram({...catalog.templates.find(t=>t.id==="mechanism")!.documents.en,style:{preset:s.id,palette,overrides:{}}},s,true).replace(/viewBox="[^"]+"/,'viewBox="18 8 34 40"')}}/><strong>{({"nature-flat":"扁平","soft-illustration":"柔和","line-minimal":"线稿","conference-framework":"框架",isometric:"等距",sketch:"手绘"} as Record<string,string>)[s.id]}</strong></button>)}</div>}</div>
          <PaletteSelect compact doc={preview||undefined} value={palette} onChange={setPalette} audits={catalog.palette_audits}/>
          <div className="diagram-size-group"><div className="diagram-size-heading"><h3>成品尺寸</h3><label>期刊<select aria-label="期刊尺寸参考" value={journal} onChange={e=>setJournal(e.target.value)}>{catalog.journals.map(j=><option value={j.id} key={j.id}>{j.name}</option>)}</select></label></div>
            <div className="diagram-size-row"><select aria-label="成品规格" value={size} onChange={e=>setSize(e.target.value)}><option value="single">单栏</option><option value="double">双栏</option><option value="custom">自定义</option></select>
              {size==="custom"&&<label>宽<input aria-label="成品宽度" type="number" min="40" max="300" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label>}
              <label>高<input aria-label="成品高度" type="number" min="40" max="300" value={height} onChange={e=>setHeight(Number(e.target.value))}/><span>mm</span></label><span className="lf-mono">{w} × {height} mm</span>
            </div>
          </div>
          {error&&<p role="alert">{error}</p>}
        </div>
        <div className="diagram-create-actions"><span className="tiny-note">7 pt · 可编辑矢量</span><Button disabled={busy||!name.trim()||w<40||w>300||height<40||height>300} onClick={()=>void create()}>{busy?"正在创建…":"创建机制图"}</Button></div>
      </aside>
    </div>
  </section>;
}
