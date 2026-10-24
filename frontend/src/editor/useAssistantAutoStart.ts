import {useEffect,useRef} from 'react';
import type {AssistantSubmission} from './agentPresentation';
/** UI handoff only: delegates once to the existing start implementation. */
export function useAssistantAutoStart(p:{submission?:AssistantSubmission;autoStart?:boolean;initialConsent?:boolean;initialPrompt?:string;prompt:string;consent:boolean;ready:boolean;recoveringExisting:boolean;setPrompt:(value:string)=>void;setConsent:(value:boolean)=>void;start:()=>Promise<void>}){
  const seen=useRef(''),pending=useRef<AssistantSubmission|null>(null);
  useEffect(()=>{
    const next=p.submission || (p.autoStart&&p.initialConsent&&p.initialPrompt?{id:'initial',prompt:p.initialPrompt,consent:true}:null);
    if(!next||next.id===seen.current)return;
    seen.current=next.id;pending.current=next;p.setPrompt(next.prompt);p.setConsent(next.consent);
  },[p.submission,p.autoStart,p.initialConsent,p.initialPrompt]);
  useEffect(()=>{
    const next=pending.current;
    if(!next||!next.consent||!p.ready||!p.consent||p.prompt!==next.prompt)return;
    if(next.id==='initial'&&p.recoveringExisting){pending.current=null;return;}
    pending.current=null;
    void p.start();
  },[p.ready,p.consent,p.prompt,p.recoveringExisting,p.start]);
}
