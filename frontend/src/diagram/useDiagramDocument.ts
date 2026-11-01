import { useCallback, useEffect, useRef, useState } from "react";
import { api, send } from "../lib/api";
import { DraftWriter } from "../lib/draftWriter";
import { commit, diagramDraftKey, history, readDiagramDraft, redo, undo, withinBounds } from "./editing";
import type { DiagramDoc, DiagramRecord } from "./model";

export function useDiagramDocument(record: DiagramRecord, onLeaveGuard: (guard:(()=>boolean)|null)=>void, notify:(s:string)=>void) {
  const [state,setState]=useState(()=>history(record.doc));
  const [revision,setRevision]=useState(record.revision),[saved,setSaved]=useState(JSON.stringify(record.doc));
  const [pendingDraft,setPendingDraft]=useState(()=>{const d=readDiagramDraft(localStorage,diagramDraftKey(record.project_id,record.id));return d&&JSON.stringify(d.doc)!==JSON.stringify(record.doc)?d:null;});
  const [draftStatus,setDraftStatus]=useState(""),[saving,setSaving]=useState(false),[conflict,setConflict]=useState(false);
  const writer=useRef<DraftWriter|null>(null),current=useRef(state.present),rev=useRef(revision);
  const key=diagramDraftKey(record.project_id,record.id),dirty=JSON.stringify(state.present)!==saved;
  current.current=state.present;rev.current=revision;
  if(!writer.current)writer.current=new DraftWriter(localStorage,()=>setDraftStatus("本机草稿已保存"),()=>setDraftStatus("本机草稿暂时无法保存"));
  const flush=useCallback(()=>writer.current!.flush(),[]);
  useEffect(()=>{
    if(dirty&&!pendingDraft)writer.current!.schedule(key,JSON.stringify({doc:state.present,revision,at:new Date().toISOString()}));
  },[dirty,key,state.present,revision,pendingDraft]);
  useEffect(()=>{
    onLeaveGuard(flush);
    const unload=(e:BeforeUnloadEvent)=>{if(!flush()){e.preventDefault();e.returnValue="";}};
    window.addEventListener("beforeunload",unload);return()=>{flush();onLeaveGuard(null);window.removeEventListener("beforeunload",unload);};
  },[onLeaveGuard,flush]);
  const edit=useCallback((next:DiagramDoc|((doc:DiagramDoc)=>DiagramDoc))=>{
    try {const value=typeof next==="function"?next(structuredClone(current.current)):next;if(!withinBounds(value)){notify("元素不能超出画布或所属分区。");return;}current.current=value;setState(old=>commit(old,value));}
    catch(e){notify(e instanceof Error?e.message:"修改失败");}
  },[notify]);
  const save=useCallback(async()=>{
    if(saving||pendingDraft)return;
    setSaving(true);const snapshot=structuredClone(current.current);
    try {
      const result=await api<DiagramRecord>(`/projects/${record.project_id}/diagrams/${record.id}`,send("PUT",{base_revision:rev.current,doc:snapshot}));
      setRevision(result.revision);setSaved(JSON.stringify(snapshot));setConflict(false);notify("机制图版本已保存");
      if(JSON.stringify(current.current)===JSON.stringify(snapshot)){writer.current!.clear(key);setDraftStatus("");}
    }catch(e){if(e&&typeof e==="object"&&"status" in e&&e.status===409)setConflict(true);notify(e instanceof Error?e.message:"保存失败");}
    finally{setSaving(false);}
  },[saving,pendingDraft,record.project_id,record.id,key,notify]);
  return {doc:state.present,edit,dirty,revision,saving,save,conflict,draftStatus,pendingDraft,
    canUndo:!!state.past.length,canRedo:!!state.future.length,
    undo:()=>setState(undo),redo:()=>setState(redo),
    restoreDraft:()=>{if(pendingDraft){setState(history(pendingDraft.doc));setRevision(pendingDraft.revision);setConflict(pendingDraft.revision!==record.revision);setPendingDraft(null);}},
    discardDraft:()=>{writer.current!.clear(key);setPendingDraft(null);},
    loadRecord:(next:DiagramRecord)=>{setState(history(next.doc));setRevision(next.revision);setSaved(JSON.stringify(next.doc));setConflict(false);writer.current!.clear(key);},
  };
}
