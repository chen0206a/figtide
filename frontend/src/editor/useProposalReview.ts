import {useCallback,useEffect,useMemo,useState} from 'react';
import {api,send} from '../lib/api';
import {sameProtectedFigure,type ToolPreview} from './figureTools';
import type {RenderFacts} from './renderFacts';
import {selectedOperations,type ReviewResult} from './review';

/** Only deterministic local HTTP work. Never starts/retries a model run or writes a chart. */
export function useProposalReview(p:{project:number;runId?:string;chartId:number|null;revision:number;proposal?:ToolPreview;enabled:boolean;awaitGeometry?:boolean}){
  const [report,setReport]=useState<ReviewResult|null>(null),[selected,setSelected]=useState<Set<string>>(new Set()),[preview,setPreview]=useState<ToolPreview|null>(null);
  const [facts,setFacts]=useState<RenderFacts|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const identity=p.enabled?p.runId:undefined,config=p.proposal?.config,factsKey=JSON.stringify(facts);
  useEffect(()=>{setFacts(null);setReport(null);setPreview(null);setError('');setSelected(new Set())},[identity]);
  useEffect(()=>{
    if(!identity||!config)return;
    let active=true;setBusy(true);setError('');
    api<ReviewResult>(`/projects/${p.project}/agent/runs/${identity}/review`,send('POST',facts?{render_facts:facts}:{}))
      .then(result=>{if(active){setReport({...result,issues:result.issues.map((issue,index)=>({...issue,number:index+1}))});setSelected(new Set(result.issues.filter(issue=>issue.fixable).map(issue=>issue.id)))}})
      .catch(e=>{if(active){setReport(null);setPreview(null);setError(e.message)}}).finally(()=>{if(active)setBusy(false)});
    return()=>{active=false};
  },[identity,config,factsKey,p.project]);
  const selectionKey=[...selected].sort().join('|');
  useEffect(()=>{
    setPreview(null);
    if(!identity||!report||!config)return;
    if(p.awaitGeometry&&!facts)return;
    const operations=selectedOperations(report,selected);if(!operations.length)return;
    let active=true;setBusy(true);setError('');
    api<ToolPreview>(`/projects/${p.project}/figure-tools/preview`,send('POST',{protocol_version:1,chart_id:p.chartId,base_revision:p.chartId?p.revision:0,config,operations,...(p.proposal?.processing?{agent_run_id:identity}:{})}))
      .then(result=>{if(active){if(!sameProtectedFigure(config,result.config)||result.source.dataset_version_id!==p.proposal?.source.dataset_version_id||result.source.sha256!==p.proposal?.source.sha256)throw new Error('审稿修复来源不一致');setPreview(result)}})
      .catch(e=>{if(active){setPreview(null);setError(e.message)}}).finally(()=>{if(active)setBusy(false)});
    return()=>{active=false};
  },[identity,report,selectionKey,config,p.project,p.chartId,p.revision,p.awaitGeometry,factsKey]);
  const toggle=useCallback((id:string)=>{setSelected(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next})},[]);
  // Review geometry must describe the user's original proposal, never the repaired preview.
  const rendered=useCallback((value:RenderFacts|null)=>{if(!preview)setFacts(old=>JSON.stringify(old)===JSON.stringify(value)?old:value)},[preview]);
  const result=useMemo(()=>p.proposal&&preview?{...p.proposal,config:preview.config,operation_count:p.proposal.operation_count+selectedOperations(report,selected).length}:p.proposal,[p.proposal,preview,report,selected]);
  const remaining=useMemo(()=>report?.issues.filter(issue=>!preview||!selected.has(issue.id))||[],[report,preview,selected]);
  const accepted=useMemo(()=>report?.issues.filter(issue=>issue.fixable&&selected.has(issue.id)).map(issue=>issue.id)||[],[report,selected]);
  return {report,selected,preview,result,remaining,accepted,toggle,rendered,busy,error};
}
