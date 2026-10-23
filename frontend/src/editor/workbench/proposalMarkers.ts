import type {Config} from '../model';
import type {ToolPreview} from '../figureTools';
export type MarkerTarget={kind:'legend'}|{kind:'axis';axis:'x'|'y'}|{kind:'series';index:number};
export function markerTarget(path:string,count:number):MarkerTarget|null{
  if(!path.startsWith('/'))return null;
  const parts=path.split('/').slice(1).map(p=>p.replaceAll('~1','/').replaceAll('~0','~'));
  if(parts[0]==='legend')return {kind:'legend'};
  if(parts[0]==='axes'&&(parts[1]==='x'||parts[1]==='y'))return {kind:'axis',axis:parts[1]};
  if(parts[0]==='series'&&/^(0|[1-9]\d*)$/.test(parts[1]||'')&&Number(parts[1])<count)return {kind:'series',index:Number(parts[1])};
  return null;
}
export type CanvasMarker={number:number;kind:MarkerTarget['kind'];x:number;y:number;width:number;height:number;paths:{d:string;matrix:string;stroke:string;width:number}[]};
export function measureMarkers(graph:HTMLDivElement,preview:ToolPreview):CanvasMarker[]{
  const config:Config=preview.config,base=graph.getBoundingClientRect();
  const sx=base.width/config.style.width,sy=base.height/config.style.height;
  if(!sx||!sy)return [];
  const gd=graph as HTMLDivElement & {_fullData?:any[];data?:any[]};
  const all=gd._fullData||gd.data||[];
  return preview.changes.flatMap((change,index)=>{
    const target=markerTarget(change.path,config.series.length);if(!target)return [];
    let nodes:Element[]=[];
    if(target.kind==='legend')nodes=[...graph.querySelectorAll('.legend')];
    if(target.kind==='axis')nodes=[...graph.querySelectorAll(`.${target.axis}tick`)];
    if(target.kind==='series'){
      const sid=config.series[target.index]?.id;
      const traces=all.filter(trace=>{const v=trace.customdata?.[0];return (Array.isArray(v)?v[0]:v)===sid});
      for(const trace of traces){if(!trace.uid)continue;const group=[...graph.querySelectorAll('.scatterlayer .trace')].find(el=>el.classList.contains('trace'+trace.uid));if(group)nodes.push(...group.querySelectorAll('.js-line'));}
    }
    const rects=nodes.map(node=>node.getBoundingClientRect()).filter(r=>r.width>0||r.height>0);
    if(!rects.length)return [];
    const x=(Math.min(...rects.map(r=>r.left))-base.left)/sx,y=(Math.min(...rects.map(r=>r.top))-base.top)/sy;
    const right=(Math.max(...rects.map(r=>r.right))-base.left)/sx,bottom=(Math.max(...rects.map(r=>r.bottom))-base.top)/sy;
    const paths=target.kind==='series'?nodes.flatMap(node=>{const path=node as SVGPathElement,m=path.getScreenCTM?.(),d=path.getAttribute('d');if(!m||!d)return [];return [{d,matrix:`matrix(${m.a/sx} ${m.b/sy} ${m.c/sx} ${m.d/sy} ${(m.e-base.x)/sx} ${(m.f-base.y)/sy})`,stroke:getComputedStyle(path).stroke,width:(parseFloat(getComputedStyle(path).strokeWidth)||2)+6}]}):[];
    return [{number:index+1,kind:target.kind,x,y,width:right-x,height:bottom-y,paths}];
  });
}
