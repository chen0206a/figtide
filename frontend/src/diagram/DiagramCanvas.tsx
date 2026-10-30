import { useEffect,useMemo, useRef, useState, type PointerEvent } from "react";
import type { DiagramDoc, DiagramRect, DiagramStyle } from "./model";
import { contains,nodeLayout,ptToMm } from "./render/geometry";
import {effectiveStyle} from "./model";
import { renderDiagram } from "./render/renderDiagram";
import { moveSelection } from "./editing";

type Drag={kind:"move"|"box"|"connect"|"pan";x:number;y:number;doc:DiagramDoc;ids:Set<string>;source?:string;scrollX?:number;scrollY?:number;clientX?:number;clientY?:number};
export function DiagramCanvas({doc,style,selected,onSelect,onEdit,onConnect,zoom,onZoom,onDropGlyph,children}:{doc:DiagramDoc;style:DiagramStyle;selected:Set<string>;onSelect:(s:Set<string>)=>void;onEdit:(d:DiagramDoc)=>void;onConnect:(from:string,to:string)=>void;zoom:number;onZoom:(n:number)=>void;onDropGlyph?:(id:string,point:{x:number;y:number})=>void;children?:React.ReactNode}) {
  const scroll=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null);
  const [preview,setPreview]=useState<DiagramDoc|null>(null),[box,setBox]=useState<DiagramRect|null>(null);
  const shown=preview||doc,svg=useMemo(()=>renderDiagram(shown,style),[shown,style]);
  useEffect(()=>{const element=scroll.current;if(!element)return;const wheel=(e:WheelEvent)=>{if(e.ctrlKey){e.preventDefault();onZoom(Math.max(.25,Math.min(10,zoom*(e.deltaY>0?.9:1.1))));}};element.addEventListener("wheel",wheel,{passive:false});return()=>element.removeEventListener("wheel",wheel);},[zoom,onZoom]);
  const point=(e:PointerEvent)=>{const r=surface.current!.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*doc.canvas.width_mm,y:(e.clientY-r.top)/r.height*doc.canvas.height_mm};};
  const down=(e:PointerEvent<HTMLDivElement>)=>{
    if(e.button!==0&&e.button!==1)return;
    const p=point(e),target=e.target as Element,connector=target.closest("[data-connect-node]");
    if(e.button===1||e.altKey){drag.current={kind:"pan",...p,doc,ids:selected,scrollX:scroll.current!.scrollLeft,scrollY:scroll.current!.scrollTop,clientX:e.clientX,clientY:e.clientY};}
    else if(connector){drag.current={kind:"connect",...p,doc,ids:selected,source:connector.getAttribute("data-connect-node")!};}
    else {
      const item=target.closest("[data-node-id],[data-zone-id],[data-edge-id],[data-annotation-id]");
      const id=item?.getAttribute("data-node-id")||item?.getAttribute("data-zone-id")||item?.getAttribute("data-edge-id")||item?.getAttribute("data-annotation-id");
      if(id){const ids=e.shiftKey?new Set(selected):selected.has(id)?new Set(selected):new Set<string>();if(e.shiftKey&&ids.has(id))ids.delete(id);else ids.add(id);onSelect(ids);drag.current={kind:"move",...p,doc,ids};}
      else {if(!e.shiftKey)onSelect(new Set());drag.current={kind:"box",...p,doc,ids:e.shiftKey?new Set(selected):new Set()};setBox({x:p.x,y:p.y,w:0,h:0});}
    }
    e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();scroll.current?.focus();
  };
  const move=(e:PointerEvent<HTMLDivElement>)=>{
    const d=drag.current;if(!d)return;
    if(d.kind==="pan"){scroll.current!.scrollLeft=d.scrollX!+d.clientX!-e.clientX;scroll.current!.scrollTop=d.scrollY!+d.clientY!-e.clientY;return;}
    const p=point(e);
    if(d.kind==="move")setPreview(moveSelection(d.doc,d.ids,Math.round(p.x-d.x),Math.round(p.y-d.y)));
    if(d.kind==="box")setBox({x:Math.min(p.x,d.x),y:Math.min(p.y,d.y),w:Math.abs(p.x-d.x),h:Math.abs(p.y-d.y)});
  };
  const up=(e:PointerEvent<HTMLDivElement>)=>{
    const d=drag.current;if(!d)return;
    if(d.kind==="move"){const p=point(e);onEdit(moveSelection(d.doc,d.ids,Math.round(p.x-d.x),Math.round(p.y-d.y)));}
    if(d.kind==="box"&&box){const ids=new Set(d.ids);[...doc.nodes,...doc.zones].filter(n=>contains(box,n)).forEach(n=>ids.add(n.id));onSelect(ids);}
    if(d.kind==="connect"){const p=point(e),target=[...doc.nodes].reverse().find(n=>p.x>=n.x&&p.x<=n.x+n.w&&p.y>=n.y&&p.y<=n.y+n.h);if(target&&target.id!==d.source)onConnect(d.source!,target.id);}
    drag.current=null;setPreview(null);setBox(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <div className="diagram-canvas-scroll" ref={scroll} tabIndex={0} aria-label="机制图画布，方向键移动，Alt拖动平移">
    <div className="diagram-surface" data-testid="diagram-canvas" ref={surface} style={{width:doc.canvas.width_mm*96/25.4*zoom,height:doc.canvas.height_mm*96/25.4*zoom}} onDragOver={e=>{if(e.dataTransfer.types.includes("application/x-figtide-glyph")){e.preventDefault();e.dataTransfer.dropEffect="copy";}}} onDrop={e=>{const id=e.dataTransfer.getData("application/x-figtide-glyph");if(!id)return;e.preventDefault();const r=surface.current!.getBoundingClientRect();onDropGlyph?.(id,{x:(e.clientX-r.left)/r.width*doc.canvas.width_mm,y:(e.clientY-r.top)/r.height*doc.canvas.height_mm});}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;setPreview(null);setBox(null);}}>
      <div className="diagram-svg" dangerouslySetInnerHTML={{__html:svg}}/>
      <svg className="diagram-overlay" viewBox={`0 0 ${doc.canvas.width_mm} ${doc.canvas.height_mm}`} aria-hidden="true">
        {[...shown.nodes,...shown.zones].filter(n=>selected.has(n.id)).map(n=><rect key={n.id} className="diagram-selection" x={n.x} y={n.y} width={n.w} height={n.h}/>)}
        {shown.nodes.filter(n=>selected.has(n.id)).map(n=>{const body=nodeLayout(n,ptToMm(effectiveStyle(doc,style).font_size_pt)).anchor;return <circle key={n.id} className="diagram-connector" data-connect-node={n.id} cx={body.x+body.w} cy={body.y+body.h/2} r={1.4}/>;})}
        {box&&<rect className="diagram-selection" x={box.x} y={box.y} width={box.w} height={box.h}/>}
        {children}
      </svg>
    </div>
  </div>;
}
