import dagre from "@dagrejs/dagre";
import type { DiagramDoc, DiagramNode, DiagramRect } from "./model";
/** Stable insertion order and no random tie-breaking. Each compartment is laid out independently. */
export function layoutDiagram(doc: DiagramDoc): DiagramDoc {
  const next=structuredClone(doc);
  const layout=(nodes: DiagramNode[], bounds: DiagramRect)=>{
    if(!nodes.length)return;
    const ids=new Set(nodes.map(n=>n.id));
    for(const rankdir of ["LR","TB"]){
      const graph=new dagre.graphlib.Graph({multigraph:true}).setGraph({rankdir,nodesep:5,ranksep:6,marginx:2,marginy:3}).setDefaultEdgeLabel(()=>({}));
      [...nodes].sort((a,b)=>a.id.localeCompare(b.id)).forEach(n=>graph.setNode(n.id,{width:n.w,height:n.h}));
      [...doc.edges].sort((a,b)=>a.id.localeCompare(b.id)).filter(e=>ids.has(e.from)&&ids.has(e.to)).forEach(e=>graph.setEdge(e.from,e.to,{},e.id));
      dagre.layout(graph);const size=graph.graph();
      if((size.width||0)>bounds.w||(size.height||0)>bounds.h)continue;
      const offsetX=bounds.x+(bounds.w-(size.width||0))/2,offsetY=bounds.y+(bounds.h-(size.height||0))/2;
      nodes.forEach(n=>{const point=graph.node(n.id);n.x=Number((point.x-n.w/2+offsetX).toFixed(4));n.y=Number((point.y-n.h/2+offsetY).toFixed(4));});return;
    }
    throw new Error("当前区域放不下这些节点，请增大成品尺寸或分区后再整理。");
  };
  for(const z of next.zones)layout(next.nodes.filter(n=>n.zone===z.id),{x:z.x,y:z.y+4,w:z.w,h:z.h-4});
  layout(next.nodes.filter(n=>!n.zone),{x:0,y:0,w:next.canvas.width_mm,h:next.canvas.height_mm});return next;
}
