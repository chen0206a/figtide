import {lazy,Suspense,useCallback,useState} from 'react';
import type {Dataset} from '../../lib/api';
import type {CanvasProposal} from './useProposalCanvas';
import {measureMarkers,type CanvasMarker} from './proposalMarkers';
const FigurePreview=lazy(()=>import('../FigurePreview'));
export function ProposalPaper({proposal,data,visible}:{proposal:CanvasProposal;data:Dataset;visible:boolean}){
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[markers,setMarkers]=useState<CanvasMarker[]>([]);
  const config=proposal.preview.config;
  const measured=useCallback((graph:HTMLDivElement)=>{setMarkers(measureMarkers(graph,proposal.preview));setReady(true);setError('')},[proposal]);
  return <>
    <div className={`canvas-proposal-layer ${visible&&ready?'is-visible':''}`} data-testid="canvas-proposal" aria-hidden={!visible||!ready}>
      <Suspense fallback={null}><FigurePreview config={config} data={data} maxHeight={config.style.height} mode="exact" label="待确认的画布预览" onRendered={measured} onError={setError}/></Suspense>
      <svg className="proposal-markers" data-testid="proposal-markers" width={config.style.width} height={config.style.height} aria-hidden="true">
        {markers.map(marker=><g key={marker.number} data-marker-kind={marker.kind} data-change-number={marker.number}>
          {marker.paths.map((path,i)=><path key={i} d={path.d} transform={path.matrix} fill="none" stroke={path.stroke} strokeWidth={path.width} opacity={.24}/>)}
          {marker.kind!=='series'&&<rect className="proposal-marker-box" x={marker.x-4} y={marker.y-4} width={marker.width+8} height={marker.height+8} rx={4}/>}
          <circle className="proposal-marker-number" cx={Math.min(config.style.width-12,Math.max(12,marker.x))} cy={Math.max(12,marker.y-10)} r={10}/><text x={Math.min(config.style.width-12,Math.max(12,marker.x))} y={Math.max(12,marker.y-10)+4} textAnchor="middle">{marker.number}</text>
        </g>)}
      </svg>
    </div>
    {error&&<p className="canvas-proposal-error" role="alert">预览暂时无法显示：{error}</p>}
  </>;
}
