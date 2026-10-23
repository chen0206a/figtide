import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ChartNoAxesCombined, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import "./home.css";
import {useReducedMotion} from "../../lib/useMotion";
import { relativeTime, type ChartSummary } from "./homeData";

type Provider = { available: boolean; model: string };
export function RecentCharts({
  charts,
  total,
  enabled,
  onChart,
}: {
  charts: ChartSummary[];
  total: number;
  enabled: boolean;
  onChart: (id: number) => void;
}) {
  const [limit, setLimit] = useState(4);
  return (
    <section
      className="home-card home-recents"
      aria-labelledby="home-recents-title"
    >
      <div className="home-card-head">
        <h2 id="home-recents-title">最近图表</h2>
        {total > 0 && <span className="home-meta">共 {total} 张</span>}
      </div>
      {!enabled ? (
        <p className="home-muted">创建项目并保存图表后显示在这里。</p>
      ) : charts.length ? (
        <ul className="home-list">
          {charts.slice(0, limit).map((chart) => (
            <li key={chart.id}>
              <button
                type="button"
                className="home-list-item"
                onClick={() => onChart(chart.id)}
              >
                <span className="home-list-icon" aria-hidden="true">
                  <ChartNoAxesCombined size={18} />
                </span>
                <span className="home-list-text">
                  <strong title={chart.name}>{chart.name}</strong>
                  <small>
                    v{chart.revision} · {relativeTime(chart.updated_at)}
                  </small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-muted">
          {total === 1 ? "目前只有左侧这一张图表。" : "还没有保存的图表。"}
        </p>
      )}
      {charts.length > limit && (
        <button
          type="button"
          className="home-more"
          onClick={() => setLimit((n) => n + 8)}
        >
          显示更多图表（剩余 {charts.length - limit}）
        </button>
      )}
    </section>
  );
}

export function AssistantCard({chartId,onAssistant,onModelConnection}:{chartId?:number;onAssistant?:(id:number,prompt:string)=>void;onModelConnection?:()=>void}) {
  const provider=useQuery({queryKey:["agent-provider"],queryFn:()=>api<Provider>("/agent/provider")});
  const [prompt,setPrompt]=useState(""),[focused,setFocused]=useState(false),[example,setExample]=useState(0);
  const input=useRef<HTMLInputElement>(null);
  const reduced=useReducedMotion(),ready=!!provider.data?.available&&!!chartId&&!!onAssistant;
  const examples=["把图例放到右侧，字号改为 16","隐藏网格线，让趋势更清晰","第一条曲线加粗，保留原始数据"];
  useEffect(()=>{if(reduced||focused||!ready)return;const timer=setInterval(()=>setExample(i=>(i+1)%3),3200);return()=>clearInterval(timer)},[reduced,focused,ready]);
  useEffect(()=>{if(reduced||focused||prompt)return;const animation=input.current?.animate?.([{opacity:.4,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)'});return()=>animation?.cancel()},[example,reduced,focused,prompt]);
  useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();input.current?.focus()}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut)},[]);
  const submit=(event:FormEvent)=>{event.preventDefault();if(ready&&prompt.trim())onAssistant!(chartId!,prompt.trim())};
  return <section className="home-assistant home-command" aria-labelledby="home-assistant-title">
    <div className="home-card-head"><h2 id="home-assistant-title">绘图助手</h2><span className="home-assistant-model lf-mono"><span className={`lf-dot ${provider.data?.available?'is-live':'is-off'}`}/>{provider.data?.available?provider.data.model:'未连接模型'}</span></div>
    <form onSubmit={submit} className="home-assistant-form"><label htmlFor="home-assistant-input">让绘图助手修改最近的图，先在编辑器中预览</label>
      <div className="home-assistant-field"><input ref={input} id="home-assistant-input" value={prompt} maxLength={2000} disabled={!ready} placeholder={examples[example]} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={e=>setPrompt(e.target.value)}/><kbd className="lf-mono">⌘ / Ctrl K</kbd><button type="submit" aria-label="在编辑器中打开助手" disabled={!ready||!prompt.trim()}><ArrowUp size={17}/></button></div>
      <div className="home-command-notes">{!chartId?<p>保存第一张图表后，就可以在这里描述修改。</p>:!provider.data?.available?<p>配置模型连接后，即可向绘图助手描述调整。</p>:<div className="home-assistant-chips">{['图例放到右侧','隐藏网格线','整体字号改为 18'].map(text=><button key={text} type="button" onClick={()=>{setPrompt(text);input.current?.focus()}}>{text}</button>)}</div>}{onModelConnection&&<button type="button" className="home-link" onClick={onModelConnection}>配置模型连接</button>}</div>
    </form>
  </section>;
}
