import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, send } from "../lib/api";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/PageHeader";
import { DiagramWizard } from "./DiagramWizard";
import { DiagramEditor } from "./DiagramEditor";
import type { DiagramCatalog, DiagramDoc, DiagramRecord } from "./model";
import {renderDiagram} from "./render/renderDiagram";
import "./diagram.css";

export default function DiagramWorkspace({project,id,onLeaveGuard,notify}:{project:number;id:number|null;onLeaveGuard:(g:(()=>boolean)|null)=>void;notify:(s:string)=>void}) {
  const qc=useQueryClient(),go=useNavigate(),[wizard,setWizard]=useState(false),[starter,setStarter]=useState<string|undefined>(),[archived,setArchived]=useState(false),[busy,setBusy]=useState(false);
  const catalog=useQuery({queryKey:["diagram-catalog"],queryFn:()=>api<DiagramCatalog>("/diagram-catalog")});
  const diagrams=useQuery({queryKey:["diagrams",project],queryFn:()=>api<DiagramRecord[]>(`/projects/${project}/diagrams`),enabled:!id});
  const record=useQuery({queryKey:["diagram",project,id],queryFn:()=>api<DiagramRecord>(`/projects/${project}/diagrams/${id}`),enabled:!!id});
  if(catalog.isPending||id&&record.isPending)return <p role="status">正在读取机制图…</p>;
  if(catalog.isError||id&&record.isError)return <p role="alert">{catalog.error?.message||record.error?.message}</p>;
  if(!catalog.data)return null;
  if(id&&record.data)return <DiagramEditor key={`${project}-${id}`} record={record.data} catalog={catalog.data} onLeaveGuard={onLeaveGuard} notify={notify}/>;
  async function create(name:string,doc:DiagramDoc){const result=await api<DiagramRecord>(`/projects/${project}/diagrams`,send("POST",{name,doc}));await qc.invalidateQueries({queryKey:["diagrams",project]});setWizard(false);void go(`/projects/${project}/diagrams/${result.id}`);}
  async function archive(row:DiagramRecord){setBusy(true);try{await api(`/projects/${project}/diagrams/${row.id}/archive`,send("PUT",{base_revision:row.revision,archived:!row.archived}));await qc.invalidateQueries({queryKey:["diagrams",project]});}catch(e){notify(e instanceof Error?e.message:"操作失败");}finally{setBusy(false);}}
  if(wizard)return <main><DiagramWizard initialTemplate={starter} catalog={catalog.data} onClose={()=>setWizard(false)} onCreate={create}/></main>;
  return <main className="page-content diagram-list-page"><PageHeader title="机制图" description="用可编辑的矢量元素表达机制、方法和实验流程。" actions={<Button disabled={!catalog.data.templates.length} onClick={()=>{setStarter(undefined);setWizard(true);}}>新建机制图</Button>}/>
    <label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>显示已归档</label>
    {diagrams.isPending?<p role="status">正在读取列表…</p>:diagrams.isError?<p role="alert">{diagrams.error.message}</p>:<div className="diagram-list">{diagrams.data?.filter(d=>archived||!d.archived).map(row=><article key={row.id}><div><Link to={`/projects/${project}/diagrams/${row.id}`}>{row.name}</Link><p className="lf-mono">{row.version_count} 个版本{row.archived?" · 已归档":""}</p></div><Button variant="ghost" disabled={busy} onClick={()=>void archive(row)}>{row.archived?"取消归档":"归档"}</Button></article>)}{!diagrams.data?.filter(d=>archived||!d.archived).length&&<div className="diagram-start"><h2>从模板开始</h2><div className="diagram-start-grid">{["mechanism","framework","workflow"].map(id=>{const template=catalog.data!.templates.find(t=>t.id===id)!;return <button key={id} aria-label={`从${template.name}开始`} onClick={()=>{setStarter(id);setWizard(true);}}><span dangerouslySetInnerHTML={{__html:renderDiagram(template.documents.en,catalog.data!.styles[0],true)}}/><strong>{template.name}</strong><small>选择模板并开始编辑 →</small></button>;})}</div></div>}</div>}
  </main>;
}
