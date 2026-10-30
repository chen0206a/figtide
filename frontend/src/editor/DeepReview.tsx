import {useEffect,useRef,useState} from 'react';
import {api,send} from '../lib/api';
import {Button} from '../components/ui/button';
import type {Config} from './model';
import type {RenderFacts} from './renderFacts';
import type {AgentRun} from './AgentAssistant';
import {TeamProgress} from './TeamProgress';
export function DeepReview(p:{project:number;chartId:number|null;revision:number;config:Config;facts?:RenderFacts|null;target:{journal:string;width_mm:number}}){
  const [enabled,setEnabled]=useState(false),[consent,setConsent]=useState(false),[run,setRun]=useState<AgentRun|null>(null),[starting,setStarting]=useState(false),[error,setError]=useState('');
  const path=`/projects/${p.project}/agent/runs`,owned=useRef<string|null>(null);
  const [runLimit,setRunLimit]=useState(32000);
  const validLimit=Number.isInteger(runLimit)&&runLimit>=2000&&runLimit<=60000;
  const busy=starting||!!run&&['queued','running'].includes(run.status);
  useEffect(()=>{if(!run||!['queued','running'].includes(run.status))return;let alive=true;const timer=setTimeout(()=>api<AgentRun>(`${path}/${run.run_id}`).then(next=>{if(alive){setRun(next);if(!['queued','running'].includes(next.status))owned.current=null}}).catch(e=>{if(alive)setError(e.message)}),600);return()=>{alive=false;clearTimeout(timer)}},[run,path,error]);
  useEffect(()=>()=>{if(owned.current)void api(`${path}/${owned.current}/cancel`,send('POST',{})).catch(()=>{})},[path]);
  return <div className="deep-review"><label><input type="checkbox" checked={enabled} disabled={busy} onChange={event=>setEnabled(event.target.checked)}/>深度审稿 · 调用所配置的模型，可能计费</label>
    {enabled&&<><p className="tiny-note">只发送当前图表配置、字段摘要和纯几何摘要，不发送原始行。单次用量额度可调整，另受会话额度约束。</p><label>审稿单次用量额度<input aria-label="审稿单次用量额度" type="number" min={2000} max={60000} step={1000} disabled={busy} value={runLimit} onChange={event=>setRunLimit(Number(event.target.value))}/></label>{!validLimit&&<p role="alert">单次用量额度须为 2,000–60,000 的整数。</p>}<label><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/>同意将上述信息发送至所配置的模型服务</label>
      <Button size="sm" disabled={!consent||busy||!validLimit} onClick={async()=>{setStarting(true);setError('');try{const next=await api<AgentRun>(path,send('POST',{protocol_version:1,mode:'review',request_id:crypto.randomUUID(),...(run?.session_id?{session_id:run.session_id}:{}),chart_id:p.chartId,base_revision:p.chartId?p.revision:0,config:p.config,prompt:'依据确定性检查审查物理量单位和误差图注，不修改图表。',share_metadata:consent,max_tokens:runLimit,...(p.facts?{render_facts:p.facts}:{}),target:p.target}));owned.current=['queued','running'].includes(next.status)?next.run_id:null;setRun(next)}catch(e){setError((e as Error).message)}finally{setStarting(false)}}}>开始深度审稿</Button>
      {busy&&run&&<Button variant="outline" size="sm" onClick={async()=>{try{setRun(await api(`${path}/${run.run_id}/cancel`,send('POST',{})));owned.current=null}catch(e){setError((e as Error).message)}}}>取消深度审稿</Button>}
      {run&&<><TeamProgress run={run}/>{run.deep_review&&<p role="status">{run.deep_review}</p>}{run.reason&&<p>{run.reason}</p>}<p className="lf-mono">本次模型用量：{run.tokens} token · {run.status}</p></>}{error&&<p role="alert">{error}</p>}
    </>}
  </div>;
}
