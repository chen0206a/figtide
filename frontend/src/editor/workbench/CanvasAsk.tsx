import {useState} from 'react';
import {ArrowUp,Sparkles} from 'lucide-react';
import {agentConsent,agentSuggestions,type AssistantSubmission} from '../agentPresentation';
export function CanvasAsk({onSend}:{onSend:(submission:AssistantSubmission)=>void}){
  const [prompt,setPrompt]=useState(''),[consent,setConsent]=useState(false);
  return <form className="canvas-ask" aria-label="画布绘图助手" onSubmit={event=>{event.preventDefault();if(consent&&prompt.trim())onSend({id:crypto.randomUUID(),prompt:prompt.trim(),consent})}}>
    <div className="canvas-ask-suggestions">{agentSuggestions.map(text=><button type="button" key={text} onClick={()=>setPrompt(text)}>{text}</button>)}</div>
    <div className="canvas-ask-field"><Sparkles size={16}/><input aria-label="描述绘图调整" value={prompt} maxLength={2000} placeholder="描述你想调整的地方，先预览，再应用" onChange={event=>setPrompt(event.target.value)}/><button type="submit" aria-label="发送给绘图助手" disabled={!consent||!prompt.trim()}><ArrowUp size={17}/></button></div>
    <label className="canvas-ask-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>{agentConsent}</span></label>
  </form>;
}
