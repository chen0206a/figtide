import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download } from "lucide-react";
import { Suspense,lazy,useEffect,useState } from "react";
import type { Config } from "../../editor/model";
import { api,type Dataset } from "../../lib/api";
import { toolValueNames } from "../../editor/figureTools";
import { stylePresets } from "../../editor/stylePresets";
import {loadEditor} from "../../lib/loadEditor";
import {localDraftInfo,relativeTime,type ChartSummary} from "./homeData";
const FigurePreview=lazy(()=>import('../../editor/FigurePreview'));
type ChartDetail={id:number;name:string;revision:number;updated_at:string;dataset_version_id:number;config:Config};
type Version={version:number;created_at:string};
export function ContinueCard({project,projectName,chart,onOpen,onExport,animateLines=false}:{project:number;projectName:string;chart:ChartSummary;onOpen:()=>void;onExport?:()=>void;animateLines?:boolean}){
  const qc=useQueryClient();
  const query={queryKey:['chart',project,chart.id],queryFn:()=>api<ChartDetail>(`/projects/${project}/charts/${chart.id}`)};
  const detail=useQuery(query),c=detail.data?.config;
  const versionId=c?.datasetVersionId||detail.data?.dataset_version_id;
  const dataQuery={queryKey:['data',project,versionId],queryFn:()=>api<Dataset>(`/projects/${project}/data/${versionId}`)};
  const data=useQuery({...dataQuery,enabled:!!versionId});
  const versions=useQuery({queryKey:['versions',project,chart.id,chart.revision],queryFn:()=>api<Version[]>(`/projects/${project}/charts/${chart.id}/versions`)});
  const readDraft=()=>{try{return localDraftInfo(localStorage,project,chart.id)}catch{return null}};
  const [draft,setDraft]=useState(readDraft),[opening,setOpening]=useState(false),[error,setError]=useState('');
  useEffect(()=>setDraft(readDraft()),[project,chart.id,chart.revision]);
  const prepare=async()=>{const loaded=await qc.ensureQueryData(query);await Promise.all([loadEditor(),qc.ensureQueryData({queryKey:['data',project,loaded.config.datasetVersionId],queryFn:()=>api<Dataset>(`/projects/${project}/data/${loaded.config.datasetVersionId}`)})]);};
  const open=async(pdf=false)=>{if(opening)return;setOpening(true);setError('');try{await prepare();(pdf?(onExport||onOpen):onOpen)()}catch(e){setError((e as Error).message)}finally{setOpening(false)}};
  const spec=c?`${toolValueNames[c.type]||c.type} · ${stylePresets.find(p=>p.key===c.style.preset)?.name||c.style.preset}`:'图表预览';
  return <article className="home-card home-continue home-stage" aria-label="继续上次的图表">
    <div className="home-stage-copy"><header className="home-continue-head"><span className="lf-kicker">{spec}</span></header>
      <div className="home-continue-meta"><h2 title={chart.name}>{chart.name}</h2><p>{projectName}</p>{data.data&&<p className="lf-mono">{data.data.filename} · v{data.data.version}</p>}</div>
      <ol className="home-timeline">{draft&&<li className="is-draft"><span className="lf-dot is-warning"/><span>本机草稿 · 有未保存修改<small>{relativeTime(draft.at)} · 预览为已保存版本</small></span></li>}{(Array.isArray(versions.data)?[...versions.data].sort((a,b)=>b.version-a.version).slice(0,2):[]).map(v=><li key={v.version}><span className="lf-dot"/><span>已保存 v{v.version}<small>{relativeTime(v.created_at)}</small></span></li>)}{versions.isError&&<li>版本记录暂不可读</li>}</ol>
      <div className="home-stage-actions"><button type="button" className="home-btn home-btn-inverse" disabled={opening||!c||!data.data} onMouseEnter={()=>void prepare().catch(()=>{})} onFocus={()=>void prepare().catch(()=>{})} onClick={()=>void open()}>继续编辑 <ArrowRight size={15}/></button><button type="button" className="home-stage-export" disabled={opening||!c||!data.data} onClick={()=>void open(true)}><Download size={14}/>导出 PDF</button></div>
      {error&&<p role="alert">{error}</p>}
    </div>
    <div className="home-continue-figure home-preview-paper">{detail.isError||data.isError?<p role="alert">预览暂时无法生成：{(detail.error||data.error)?.message}</p>:c&&data.data?<Suspense fallback={<div className="home-figure-skeleton"/>}><FigurePreview config={c} data={data.data} mode="fit" maxHeight={340} animateLines={animateLines} label={`${chart.name} 的预览`}/></Suspense>:<div className="home-figure-skeleton" role="status" aria-label="正在载入预览"/>}</div>
  </article>;
}
