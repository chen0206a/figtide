import {lazy,Suspense,useCallback,useState} from 'react';
import type {Dataset} from '../../lib/api';
import type {CanvasProposal} from './useProposalCanvas';
import {measureMarkers,type CanvasMarker} from './proposalMarkers';
import {NumberMarker} from './NumberMarker';
import {ReviewMarkers} from './ReviewMarkers';
import {collectRenderFacts,type RenderFacts} from '../renderFacts';
const FigurePreview=lazy(()=>import('../FigurePreview'));
export function ProposalPaper({proposal,data,visible}:{proposal:CanvasProposal;data:Dataset;visible:boolean}){
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[markers,setMarkers]=useState<CanvasMarker[]>([]);
  const config=proposal.preview.config;
  const [facts,setFacts]=useState<RenderFacts|null>(null);
  const measured=useCallback((graph:HTMLDivElement)=>{setMarkers(measureMarkers(graph,proposal.preview));const next=collectRenderFacts(graph,config.style.width,config.style.height);setFacts(next);proposal.onRendered?.(next);setReady(true);setError('')},[proposal,config]);
  return <>
    <div className={`canvas-proposal-layer ${visible&&ready?'is-visible':''}`} data-testid="canvas-proposal" aria-hidden={!visible||!ready}>
      <Suspense fallback={null}><FigurePreview config={config} data={proposal.data||data} maxHeight={config.style.height} mode="exact" label="待确认的画布预览" onRendered={measured} onError={setError}/></Suspense>
      <svg className="proposal-markers" data-testid="proposal-markers" width={config.style.width} height={config.style.height} aria-hidden="true">
        {!proposal.reviewOnly&&markers.map(marker=><NumberMarker key={marker.number} marker={marker} width={config.style.width} height={config.style.height}/>)}
      </svg>
      {proposal.reviewIssues&&<ReviewMarkers config={config} issues={proposal.reviewIssues} facts={facts}/>}
    </div>
    {error&&<p className="canvas-proposal-error" role="alert">预览暂时无法显示：{error}</p>}
  </>;
}
