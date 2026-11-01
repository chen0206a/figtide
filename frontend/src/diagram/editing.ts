import {builtinIcons} from "./builtinIcons";
import type { DiagramDoc, DiagramRect } from "./model";
import { contains } from "./render/geometry";
import {glyphKinds} from "./render/glyphs";
export type DiagramHistory = {past: DiagramDoc[]; present: DiagramDoc; future: DiagramDoc[]};
export function history(doc: DiagramDoc): DiagramHistory {return {past:[],present:structuredClone(doc),future:[]};}
export function commit(h: DiagramHistory, doc: DiagramDoc): DiagramHistory {return JSON.stringify(h.present)===JSON.stringify(doc)?h:{past:[...h.past.slice(-99),h.present],present:structuredClone(doc),future:[]};}
export function undo(h: DiagramHistory): DiagramHistory {return h.past.length?{past:h.past.slice(0,-1),present:h.past[h.past.length-1],future:[h.present,...h.future]}:h;}
export function redo(h: DiagramHistory): DiagramHistory {return h.future.length?{past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h;}
export const diagramDraftKey=(project: number,id: number)=>`figtide-diagram-draft-v1:${project}:${id}`;
export function readDiagramDraft(storage: Pick<Storage,"getItem">, key: string): {doc:DiagramDoc;revision:number}|null {
  try {
    const draft=JSON.parse(storage.getItem(key)||"null"),d=draft?.doc;
    if(d?.schema_version!==1||!Number.isSafeInteger(draft.revision)||draft.revision<1||!d.canvas||!d.style?.overrides||!d.legend||!d.meta||![d.nodes,d.zones,d.edges,d.annotations].every(Array.isArray)||!withinBounds(d))return null;
    if(d.nodes.length>120||d.zones.length>30||d.edges.length>200||d.annotations.length>120)return null;
    if([...d.nodes,...d.zones].some(n=>typeof n.id!=="string"||typeof n.label!=="string")||d.edges.some((e:any)=>typeof e.label!=="string")||d.annotations.some((a:any)=>typeof a.text!=="string"))return null;
    if(d.nodes.some((n:any)=>!["box","pill","ellipse","text","glyph","icon"].includes(n.kind)||n.kind==="icon"&&!builtinIcons[n.icon]||n.kind==="glyph"&&!glyphKinds.includes(n.glyph)||n.badges&&(!Array.isArray(n.badges)||n.badges.some((b:any)=>typeof b!=="string"||!(["phospho","frozen","trainable"].includes(b)||/^number:([1-9]|[1-9][0-9])$/.test(b))))))return null;
    for(const k of ["zone_colors","accent_colors"])if(k in d.style.overrides&&(!Array.isArray(d.style.overrides[k])||!d.style.overrides[k].length||d.style.overrides[k].some((c:any)=>typeof c!=="string"||!/^#[\da-f]{6}$/i.test(c))))return null;
    for(const k of ["font_size_pt","line_width_pt","radius_mm"])if(k in d.style.overrides&&!Number.isFinite(d.style.overrides[k]))return null;
    return draft;
  }catch{return null;}
}
export function freshId(doc: DiagramDoc,prefix: string): string {
  const ids=new Set([...doc.nodes,...doc.zones,...doc.edges,...doc.annotations].map(n=>n.id));let i=1;while(ids.has(prefix+i))i++;return prefix+i;
}
export function withinBounds(doc: DiagramDoc): boolean {
  const canvas={x:0,y:0,w:doc.canvas.width_mm,h:doc.canvas.height_mm};
  return [...doc.zones,...doc.nodes].every(n=>[n.x,n.y,n.w,n.h].every(Number.isFinite)&&n.w>=.1&&n.h>=.1&&contains(canvas,n))&&doc.nodes.every(n=>!n.zone||doc.zones.some(z=>z.id===n.zone&&contains(z,n)));
}
export function moveSelection(doc: DiagramDoc, ids: ReadonlySet<string>, dx: number, dy: number): DiagramDoc {
  const next=structuredClone(doc),movingZones=new Set(doc.zones.filter(z=>ids.has(z.id)).map(z=>z.id));
  const moving=[...next.zones.filter(z=>ids.has(z.id)),...next.nodes.filter(n=>ids.has(n.id)||!!n.zone&&movingZones.has(n.zone))];
  if(!moving.length)return next;
  let x=dx,y=dy;
  for(const n of moving) {
    const parent="zone" in n&&n.zone&&!movingZones.has(n.zone)?doc.zones.find(z=>z.id===n.zone):null;
    const box:DiagramRect=parent||{x:0,y:0,w:doc.canvas.width_mm,h:doc.canvas.height_mm};
    x=Math.max(box.x-n.x,Math.min(x,box.x+box.w-n.x-n.w));y=Math.max(box.y-n.y,Math.min(y,box.y+box.h-n.y-n.h));
  }
  for(const n of moving){n.x=Number((n.x+x).toFixed(4));n.y=Number((n.y+y).toFixed(4));}
  return next;
}
export function removeSelection(doc: DiagramDoc, ids: ReadonlySet<string>): DiagramDoc {
  const next=structuredClone(doc);next.nodes=next.nodes.filter(n=>!ids.has(n.id));next.zones=next.zones.filter(z=>!ids.has(z.id));
  const nodes=new Set(next.nodes.map(n=>n.id)),zones=new Set(next.zones.map(z=>z.id));
  next.edges=next.edges.filter(e=>!ids.has(e.id)&&nodes.has(e.from)&&nodes.has(e.to));
  next.annotations=next.annotations.filter(a=>!ids.has(a.id)&&(nodes.has(a.target)||zones.has(a.target)));
  next.nodes.forEach(n=>{if(n.zone&&!zones.has(n.zone))n.zone=null;});next.zones.forEach(z=>{if(z.zoom_of&&!zones.has(z.zoom_of)&&!nodes.has(z.zoom_of))z.zoom_of=null;});return next;
}
export function duplicateSelection(doc: DiagramDoc, ids: ReadonlySet<string>): DiagramDoc {
  let next=structuredClone(doc);const remap=new Map<string,string>();
  for(const z of doc.zones.filter(z=>ids.has(z.id))){const id=freshId(next,"z");remap.set(z.id,id);next.zones.push({...z,id});}
  for(const n of doc.nodes.filter(n=>ids.has(n.id)||!!n.zone&&ids.has(n.zone))){const id=freshId(next,"n");remap.set(n.id,id);next.nodes.push({...n,id,zone:remap.get(n.zone||"")||n.zone});}
  for(const z of next.zones)if(remap.has(z.zoom_of||"")&&[...remap.values()].includes(z.id))z.zoom_of=remap.get(z.zoom_of!)!;
  for(const e of doc.edges.filter(e=>remap.has(e.from)&&remap.has(e.to))){const id=freshId(next,"e");next.edges.push({...e,id,from:remap.get(e.from)!,to:remap.get(e.to)!});}
  for(const a of doc.annotations.filter(a=>remap.has(a.target))){next.annotations.push({...a,id:freshId(next,"a"),target:remap.get(a.target)!});}
  next=moveSelection(next,new Set(remap.values()),3,3);return next;
}
export function alignSelection(doc: DiagramDoc, ids: ReadonlySet<string>, mode: "left"|"top"|"horizontal"|"vertical"): DiagramDoc {
  const next=structuredClone(doc),nodes=next.nodes.filter(n=>ids.has(n.id));if(nodes.length<2)return next;
  if(mode==="left"||mode==="top"){const axis=mode==="left"?"x":"y",value=Math.min(...nodes.map(n=>n[axis]));nodes.forEach(n=>n[axis]=value);}
  else {const axis=mode==="horizontal"?"x":"y",size=mode==="horizontal"?"w":"h";nodes.sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id));const start=nodes[0][axis],end=nodes[nodes.length-1][axis]+nodes[nodes.length-1][size];const gap=(end-start-nodes.reduce((s,n)=>s+n[size],0))/(nodes.length-1);let pos=start;nodes.forEach(n=>{n[axis]=pos;pos+=n[size]+gap;});}
  if(!withinBounds(next))throw new Error("这些节点跨越分区边界，请在同一分区内选择后整理。");return next;
}
