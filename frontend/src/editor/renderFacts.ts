export type Box = {x:number;y:number;width:number;height:number};
export type RenderFacts = {
  version:1; canvas:{width:number;height:number}; plot:Box; legend?:Box;
  texts:{role:'title'|'xTitle'|'yTitle'|'tick'|'legend'|'annotation';box:Box;fontPx:number}[];
  points:{trace:number;x:number;y:number}[];
  bands:{trace:number;polygon:[number,number][]}[];
};
const rounded = (value:number) => Math.round(value*1000)/1000;
export function sampleEvenly<T>(values:readonly T[],limit:number):T[] {
  if(values.length<=limit)return [...values];
  return Array.from({length:limit},(_,i)=>values[Math.floor(i*(values.length-1)/(limit-1))]);
}
/** Called only after Plotly finishes. Reads rendered SVG geometry, never trace values or textContent. */
export function collectRenderFacts(graph:HTMLDivElement,width:number,height:number):RenderFacts|null {
  const origin=graph.getBoundingClientRect(),sx=origin.width/width,sy=origin.height/height;
  if(!sx||!sy)return null;
  const box=(node:Element):Box=>{
    const b=node.getBoundingClientRect();
    return {x:rounded((b.left-origin.left)/sx),y:rounded((b.top-origin.top)/sy),width:rounded(b.width/sx),height:rounded(b.height/sy)};
  };
  const finiteBox=(b:Box)=>Object.values(b).every(Number.isFinite)&&b.width>0&&b.height>0;
  const plot=graph.querySelector('.nsewdrag, .plotbg, .bglayer .bg');
  const facts:RenderFacts={version:1,canvas:{width,height},plot:plot?box(plot):{x:0,y:0,width,height},texts:[],points:[],bands:[]};
  const legend=graph.querySelector('.legend');if(legend){const b=box(legend);if(finiteBox(b))facts.legend=b;}
  const selectors:[string,RenderFacts['texts'][number]['role']][]=[['.gtitle','title'],['.xtitle','xTitle'],['.ytitle','yTitle'],['.xtick text, .ytick text','tick'],['.legendtext','legend'],['.annotation-text','annotation']];
  for(const [selector,role] of selectors)for(const node of graph.querySelectorAll(selector)){
    if(facts.texts.length>=300)break;
    const b=box(node),fontPx=parseFloat(getComputedStyle(node).fontSize);
    if(finiteBox(b)&&Number.isFinite(fontPx)&&fontPx>0)facts.texts.push({role,box:b,fontPx:rounded(fontPx)});
  }
  const traces=[...graph.querySelectorAll('.scatterlayer .trace, .barlayer .trace, .boxlayer .trace, .violinlayer .trace')];
  traces.forEach((trace,index)=>{
    const nodes=[...trace.querySelectorAll('.point, .points path')];
    const points=sampleEvenly(nodes,200).map(node=>{const b=box(node);return {trace:index,x:rounded(b.x+b.width/2),y:rounded(b.y+b.height/2)}});
    // SVG line paths provide geometric locations even when Plotly does not draw markers.
    if(!points.length)for(const line of trace.querySelectorAll<SVGPathElement>('.js-line')){
      if(typeof line.getTotalLength!=='function')continue;
      const length=line.getTotalLength(),matrix=line.getScreenCTM();if(!length||!matrix)continue;
      for(let i=0;i<200;i++){
        const p=line.getPointAtLength(length*i/199);
        points.push({trace:index,x:rounded((matrix.a*p.x+matrix.c*p.y+matrix.e-origin.left)/sx),y:rounded((matrix.b*p.x+matrix.d*p.y+matrix.f-origin.top)/sy)});
      }
    }
    facts.points.push(...sampleEvenly(points,200).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).slice(0,Math.max(0,3000-facts.points.length)));
    for(const path of trace.querySelectorAll<SVGPathElement>('.js-fill')){
      if(facts.bands.length>=20||typeof path.getTotalLength!=='function')continue;
      const length=path.getTotalLength(),matrix=path.getScreenCTM();if(!length||!matrix)continue;
      const polygon:[number,number][]=Array.from({length:100},(_,i)=>{
        const p=path.getPointAtLength(length*i/99);
        return [rounded((matrix.a*p.x+matrix.c*p.y+matrix.e-origin.left)/sx),rounded((matrix.b*p.x+matrix.d*p.y+matrix.f-origin.top)/sy)];
      });
      if(polygon.every(p=>p.every(Number.isFinite)))facts.bands.push({trace:index,polygon});
    }
  });
  return facts;
}
