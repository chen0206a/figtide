import type {Config} from '../model';
import type {RenderFacts,Box} from '../renderFacts';
import type {ReviewIssue} from '../review';
import {NumberMarker} from './NumberMarker';
import type {CanvasMarker} from './proposalMarkers';
export function ReviewMarkers({config,issues,facts}:{config:Config;issues:ReviewIssue[];facts:RenderFacts|null|undefined}){
  if(!facts)return null;
  const plot=facts.plot;
  const locate=(issue:ReviewIssue):Box=>{
    const {kind,ref}=issue.anchor;
    if(kind==='legend'&&facts.legend)return facts.legend;
    if(kind==='title')return facts.texts.find(text=>text.role==='title')?.box||{x:plot.x,y:12,width:0,height:0};
    if(kind==='text')return facts.texts[Number(ref)]?.box||plot;
    if(kind==='axis')return ref==='x'?{x:plot.x+plot.width/2,y:plot.y+plot.height+16,width:0,height:0}:{x:Math.max(12,plot.x-16),y:plot.y+plot.height/2,width:0,height:0};
    const trace=config.series.findIndex(series=>series.id===ref),last=facts.points.filter(point=>point.trace===trace).at(-1);
    return {x:last?.x??plot.x+plot.width,y:last?.y??plot.y+plot.height/2,width:0,height:0};
  };
  return <svg className="proposal-markers review-markers" data-testid="review-markers" width={config.style.width} height={config.style.height} aria-label="审稿问题标记">
    {issues.map((issue,index)=>{const marker:CanvasMarker={number:issue.number??index+1,kind:issue.anchor.kind==='series'?'series':issue.anchor.kind==='legend'?'legend':issue.anchor.kind==='axis'?'axis':'title',...locate(issue),paths:[]};
      return <g key={issue.id} data-review-issue={issue.id}><NumberMarker marker={marker} width={config.style.width} height={config.style.height}/></g>;
    })}
  </svg>;
}
