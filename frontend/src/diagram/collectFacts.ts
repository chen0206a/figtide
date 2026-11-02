import {prepareDiagramIcons} from './iconCache';
import type {DiagramDoc,DiagramRect,DiagramStyle} from './model';
import {renderDiagram} from './render/renderDiagram';

export type DiagramFacts={kind:'diagram';version:1;canvas:{width:number;height:number};nodes:{index:number;box:DiagramRect}[];texts:{owner_kind:'node'|'zone'|'edge'|'annotation'|'legend';owner_index:number;box:DiagramRect;container:DiagramRect;font_pt:number;color:string}[];edges:{index:number;points:number[][];arrow:{x:number;y:number}}[]};
const rect=(r:DOMRect|SVGRect):DiagramRect=>({x:r.x,y:r.y,w:r.width,h:r.height});
/** Measure a fresh rendering, including a repair candidate, never editor overlays. Only numeric facts leave this function. */
export async function collectDiagramFacts(doc:DiagramDoc,style:DiagramStyle):Promise<DiagramFacts>{
  const icons=await prepareDiagramIcons(doc);
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px;top:0;pointer-events:none';host.innerHTML=renderDiagram(doc,style,false,icons);document.body.append(host);
  try{
    await document.fonts.ready;const svg=host.querySelector('svg')!;
    const box=(el:SVGGraphicsElement):DiagramRect=>{const b=el.getBBox(),m=svg.getCTM()!.inverse().multiply(el.getCTM()!);const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m)),xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};};
    const nodes=doc.nodes.map((n,index)=>{const el=[...svg.querySelectorAll('[data-node-id]')].find(el=>el.getAttribute('data-node-id')===n.id)!;return {index,box:{x:Number(el.getAttribute('data-body-x')),y:Number(el.getAttribute('data-body-y')),w:Number(el.getAttribute('data-body-w')),h:Number(el.getAttribute('data-body-h'))}};});
    let legend=0;
    const texts=[...svg.querySelectorAll<SVGTextElement>('text')].map(el=>{
      let owner_kind:DiagramFacts['texts'][number]['owner_kind']='legend',owner_index=legend;
      for(const [kind,field] of [['node','nodes'],['zone','zones'],['edge','edges'],['annotation','annotations']] as const){const owner=el.closest(`[data-${kind}-id]`);if(owner){owner_kind=kind;owner_index=doc[field].findIndex(n=>n.id===owner.getAttribute(`data-${kind}-id`));break;}}
      if(owner_kind==='legend')legend++;
      const marker=el.closest('[data-solid-marker]')?.querySelector<SVGCircleElement>('circle');
      const container=el.hasAttribute('data-container-x')?{x:Number(el.getAttribute('data-container-x')),y:Number(el.getAttribute('data-container-y')),w:Number(el.getAttribute('data-container-w')),h:Number(el.getAttribute('data-container-h'))}:marker?box(marker):rect(el.getBBox());
      const rgb=getComputedStyle(el).fill.match(/\d+/g),color=rgb?'#'+rgb.slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('').toUpperCase():'#000000';
      return {owner_kind,owner_index,box:box(el),container,font_pt:parseFloat(getComputedStyle(el).fontSize)*72/25.4,color};
    });
    const edges=doc.edges.map((_,index)=>{const el=svg.querySelectorAll<SVGPathElement>('[data-diagram-edge]')[index],values=el.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number),points:number[][]=[];for(let i=0;i<values.length;i+=2)points.push(values.slice(i,i+2));const arrow={x:Number(el.getAttribute('data-edge-tip-x')),y:Number(el.getAttribute('data-edge-tip-y'))};points[points.length-1]=[arrow.x,arrow.y];return {index,points,arrow};});
    return {kind:'diagram',version:1,canvas:{width:doc.canvas.width_mm,height:doc.canvas.height_mm},nodes,texts,edges};
  }finally{host.remove();}
}
