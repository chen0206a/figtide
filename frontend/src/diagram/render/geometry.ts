import type { DiagramDoc, DiagramEdge, DiagramNode, DiagramRect } from "../model";
import {glyphBounds} from "./glyphs";
export type Point = {x: number; y: number};
export const ptToMm = (pt: number) => pt * 25.4 / 72;
export const overlap = (a: DiagramRect, b: DiagramRect) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
export const contains = (a: DiagramRect, b: DiagramRect) => b.x >= a.x && b.y >= a.y && b.x+b.w <= a.x+a.w+1e-7 && b.y+b.h <= a.y+a.h+1e-7;
export function nodeLayout(node:DiagramNode,fontMm=ptToMm(6.5)):{body:DiagramRect;label:DiagramRect;anchor:DiagramRect} {
  let body:DiagramRect={x:node.x,y:node.y,w:node.w,h:node.h},label={...body};
  if(node.kind!=="text") {
    const position=node.label_pos||"center",space=Math.min(4.4,node.h*.5);
    if(node.kind==="glyph"&&node.boxed){const size=Math.max(.1,Math.min(node.h-3,node.w-3.2));body={x:node.x+1.6,y:node.y+1.5,w:size,h:size};label={x:body.x+size+1.2,y:node.y,w:Math.max(.1,node.w-size-2.8),h:node.h};}
    else if(position==="below"){body.h=node.h-space;label={x:node.x,y:node.y+body.h+1,w:node.w,h:Math.max(.1,space-1)};}
    else if(position==="above"){body={x:node.x,y:node.y+node.h-2.2,w:node.w,h:Math.min(2.2,node.h)};label={x:node.x,y:node.y,w:node.w,h:Math.max(.1,node.h-2.2)};}
    else if(position==="left"||position==="right"){body.w=Math.min(node.h,node.w*.42);label={x:position==="right"?node.x+body.w+1.2:node.x,y:node.y,w:Math.max(.1,node.w-body.w-1.2),h:node.h};if(position==="left"){body.x=node.x+node.w-body.w;label.y=node.y+2.4;label.h=fontMm*1.3;}}

  }
  const bounds=node.kind==="glyph"&&!node.boxed?glyphBounds(node.glyph||"",body.w,body.h):node.kind==="icon"?{x:0,y:0,w:body.w,h:body.h}:{x:0,y:0,w:node.w,h:node.h};
  const anchor=node.boxed?{x:node.x,y:node.y,w:node.w,h:node.h}:{x:body.x+bounds.x,y:body.y+bounds.y,w:bounds.w,h:bounds.h};
  return {body,label,anchor};
}
function boundary(node: DiagramNode, toward: Point,fontMm:number): Point {
  const layout=nodeLayout(node,fontMm);const box=layout.anchor;
  const cx=box.x+box.w/2,cy=box.y+box.h/2,dx=toward.x-cx,dy=toward.y-cy;
  const factor=Math.min(dx?(box.w/2+.8)/Math.abs(dx):1e9,dy?(box.h/2+.8)/Math.abs(dy):1e9);
  return {x:cx+dx*factor,y:cy+dy*factor};
}
export function edgePoints(doc: DiagramDoc, edge: DiagramEdge,fontMm=ptToMm(6.5)): Point[] {
  const a=doc.nodes.find(n=>n.id===edge.from),b=doc.nodes.find(n=>n.id===edge.to);
  if(!a||!b)return [];
  const aa=nodeLayout(a,fontMm).anchor,bb=nodeLayout(b,fontMm).anchor;
  const start=boundary(a,{x:bb.x+bb.w/2,y:bb.y+bb.h/2},fontMm),end=boundary(b,{x:aa.x+aa.w/2,y:aa.y+aa.h/2},fontMm);
  if(edge.route==="orthogonal") {
    const ac={x:aa.x+aa.w/2,y:aa.y+aa.h/2},bc={x:bb.x+bb.w/2,y:bb.y+bb.h/2},dx=bc.x-ac.x,dy=bc.y-ac.y;
    if(Math.abs(dx)>Math.abs(dy)){
      const s={x:ac.x+Math.sign(dx)*(aa.w/2+.8),y:ac.y};
      if(Math.abs(dy)<2)return [s,{x:bc.x-Math.sign(dx)*(bb.w/2+.8),y:ac.y}];
      return [s,{x:bc.x,y:ac.y},{x:bc.x,y:bc.y-Math.sign(dy)*(bb.h/2+.8)}];
    }
    const s={x:ac.x,y:ac.y+Math.sign(dy)*(aa.h/2+.8)};
    if(Math.abs(dx)<2)return [s,{x:ac.x,y:bc.y-Math.sign(dy)*(bb.h/2+.8)}];
    return [s,{x:ac.x,y:bc.y},{x:bc.x-Math.sign(dx)*(bb.w/2+.8),y:bc.y}];
  }
  if(edge.route==="curved") {
    const control={x:(start.x+end.x)/2-(end.y-start.y)*.2,y:(start.y+end.y)/2+(end.x-start.x)*.2};
    return Array.from({length:17},(_,i)=>{const t=i/16;return {x:(1-t)**2*start.x+2*(1-t)*t*control.x+t*t*end.x,y:(1-t)**2*start.y+2*(1-t)*t*control.y+t*t*end.y};});
  }
  return [start,end];
}
export function wrapLabel(label:string,width:number,fontMm:number):string[]{
  const advance=(text:string)=>[...text].reduce((sum,char)=>sum+fontMm*(/[^\u0000-\u00ff]/u.test(char)?1:/[ilI., :;'!]/.test(char)?.3:/[MW@]/.test(char)?.85:.56),0);
  const limit=Math.max(width,fontMm),lines:string[]=[];
  for(const paragraph of label.split("\n")){
    let line="";
    for(const token of paragraph.match(/[^\s\u2e80-\u9fff]+|\s+|[\s\S]/gu)||[]){
      if(line&&advance(line+token)>limit){lines.push(line.trimEnd());line="";}
      if(line||token.trim())line+=token;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
