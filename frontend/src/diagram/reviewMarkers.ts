import type {DiagramDoc} from './model';
import type {ReviewIssue} from '../editor/review';
import type {CanvasMarker} from '../editor/workbench/proposalMarkers';
import {edgePoints} from './render/geometry';
export function diagramReviewMarker(doc:DiagramDoc,issue:ReviewIssue<any>,number:number,globalIndex:number):CanvasMarker{
  const ref=Number(issue.anchor.ref);let box={x:0,y:0,w:0,h:0},global=true;
  if(issue.anchor.kind==='node'&&doc.nodes[ref]){box=doc.nodes[ref];global=false;}
  if(issue.anchor.kind==='edge'&&doc.edges[ref]){const pts=edgePoints(doc,doc.edges[ref]),p=pts[Math.floor(pts.length/2)];if(p){box={...p,w:0,h:0};global=false;}}
  if(global){const columns=Math.max(1,Math.floor((doc.canvas.width_mm-28)/9));box={x:14+(globalIndex%columns)*9,y:8+Math.floor(globalIndex/columns)*9,w:0,h:0};}
  return {number,kind:global?'series':'title',x:box.x*4,y:box.y*4,width:box.w*4,height:box.h*4,paths:[]};
}
