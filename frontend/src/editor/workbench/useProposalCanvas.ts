import {useCallback,useEffect,useState} from 'react';
import type {ToolPreview} from '../figureTools';
import type {ReviewIssue} from '../review';
import type {RenderFacts} from '../renderFacts';
export type CanvasProposal={preview:ToolPreview;token:string;data?:import('../../lib/api').Dataset;reviewIssues?:ReviewIssue[];reviewOnly?:boolean;onRendered?:(facts:RenderFacts|null)=>void};
/** Presentation-only state. Never dispatches history, writes storage or saves. */
export function useProposalCanvas(token:string,open:boolean){
  const [stored,setStored]=useState<CanvasProposal|null>(null),[visible,setVisible]=useState(true);
  const receive=useCallback((value:CanvasProposal|null)=>{setStored(value);setVisible(true)},[]);
  useEffect(()=>{setStored(current=>!open||current?.token!==token?null:current)},[token,open]);
  const proposal=open&&stored?.token===token?stored:null;
  return {proposal,visible,receive,toggle:()=>setVisible(v=>!v)};
}
