import type {CanvasMarker} from './proposalMarkers';
/** Shared proposal/review number, geometry and dashed-box presentation. */
export function NumberMarker({marker,width,height}:{marker:CanvasMarker;width:number;height:number}){
  const x=Math.min(width-12,Math.max(12,marker.x)),y=Math.min(height-12,Math.max(12,marker.y-10));
  return <g data-marker-kind={marker.kind} data-change-number={marker.number}>
    {marker.paths.map((path,i)=><path key={i} d={path.d} transform={path.matrix} fill="none" stroke={path.stroke} strokeWidth={path.width} opacity={.24}/>)}
    {marker.kind!=='series'&&<rect className="proposal-marker-box" x={marker.x-4} y={marker.y-4} width={marker.width+8} height={marker.height+8} rx={4}/>}
    <circle className="proposal-marker-number" cx={x} cy={y} r={10}/><text x={x} y={y+4} textAnchor="middle">{marker.number}</text>
  </g>;
}
