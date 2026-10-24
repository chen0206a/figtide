import type {Config} from '../model';
import type {ToolPreview} from '../figureTools';
export type MarkerTarget={kind:'legend'}|{kind:'axis';axis:'x'|'y'}|{kind:'series';index:number}|{kind:'title'};
export function markerTarget(path:string,count:number):MarkerTarget|null{
  if(!path.startsWith('/'))return null;
  const parts=path.split('/').slice(1).map(p=>p.replaceAll('~1','/').replaceAll('~0','~'));
  if(parts[0]==='legend')return {kind:'legend'};
  if(parts[0]==='title'||(parts[0]==='style'&&parts[1]==='title'))return {kind:'title'};
  if(parts[0]==='axes'&&(parts[1]==='x'||parts[1]==='y'))return {kind:'axis',axis:parts[1]};
  if(parts[0]==='series'&&/^(0|[1-9]\d*)$/.test(parts[1]||'')&&Number(parts[1])<count)return {kind:'series',index:Number(parts[1])};
  return null;
}
export type CanvasMarker={number:number;kind:MarkerTarget['kind'];x:number;y:number;width:number;height:number;paths:{d:string;matrix:string;stroke:string;width:number}[]};
const selector=(target:MarkerTarget)=>target.kind==='legend'?'.legend':target.kind==='title'?'.gtitle':target.kind==='axis'?`.${target.axis}tick`:null;
export function measureMarkers(graph:HTMLDivElement,preview:ToolPreview):CanvasMarker[]{
  const config:Config=preview.config,base=graph.getBoundingClientRect();
  const sx=base.width/config.style.width,sy=base.height/config.style.height;
  if(!sx||!sy)return [];
  const gd=graph as HTMLDivElement & {_fullData?:any[];data?:any[]};
  const all=gd._fullData||gd.data||[];
  return preview.changes.flatMap((change,index):CanvasMarker[]=>{
    const target=markerTarget(change.path,config.series.length);if(!target)return [];
    if(target.kind==='series'){
      // A series can bend across the plot, so its box would swallow the figure.
      // Mark the middle of the drawn line instead and keep the glow along the path.
      const sid=config.series[target.index]?.id;
      const traces=all.filter(trace=>{const v=trace.customdata?.[0];return (Array.isArray(v)?v[0]:v)===sid});
      const nodes:SVGPathElement[]=[];
      for(const trace of traces){if(!trace.uid)continue;const group=[...graph.querySelectorAll('.scatterlayer .trace')].find(el=>el.classList.contains('trace'+trace.uid));if(!group)continue;nodes.push(...[...group.querySelectorAll('.js-line')] as SVGPathElement[]);}
      const line=nodes.find(node=>typeof node.getTotalLength==='function'&&node.getTotalLength()>0);
      if(!line)return [];
      const ctm=line.getScreenCTM(),point=line.getPointAtLength(line.getTotalLength()/2);
      // matrixTransform is missing in jsdom and in some SVG shims; apply the matrix by hand.
      const screen=ctm?{x:ctm.a*point.x+ctm.c*point.y+ctm.e,y:ctm.b*point.x+ctm.d*point.y+ctm.f}:point;
      const stroke=(path:SVGPathElement)=>{try{const style=getComputedStyle(path);return {paint:style.stroke,width:(parseFloat(style.strokeWidth)||2)+6};}catch{return {paint:path.getAttribute('stroke')||'currentColor',width:(parseFloat(path.getAttribute('stroke-width')||'')||2)+6};}};
      const paths=nodes.flatMap(path=>{const m=path.getScreenCTM?.(),d=path.getAttribute('d');if(!m||!d)return [];const paint=stroke(path);return [{d,matrix:`matrix(${m.a/sx} ${m.b/sy} ${m.c/sx} ${m.d/sy} ${(m.e-base.x)/sx} ${(m.f-base.y)/sy})`,stroke:paint.paint,width:paint.width}]});
      return [{number:index+1,kind:target.kind,x:(screen.x-base.left)/sx,y:(screen.y-base.top)/sy,width:0,height:0,paths}];
    }
    const nodes=[...graph.querySelectorAll(selector(target)!)];
    const rects=nodes.map(node=>node.getBoundingClientRect()).filter(r=>r.width>0||r.height>0);
    if(!rects.length)return [];
    const x=(Math.min(...rects.map(r=>r.left))-base.left)/sx,y=(Math.min(...rects.map(r=>r.top))-base.top)/sy;
    const right=(Math.max(...rects.map(r=>r.right))-base.left)/sx,bottom=(Math.max(...rects.map(r=>r.bottom))-base.top)/sy;
    return [{number:index+1,kind:target.kind,x,y,width:right-x,height:bottom-y,paths:[]}];
  });
}