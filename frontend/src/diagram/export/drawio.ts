import {effectiveStyle,type DiagramDoc,type DiagramStyle} from '../model';
import {nodeLayout,ptToMm,edgePoints} from '../render/geometry';
import {roleColor} from '../palettes';
import {renderDiagram} from '../render/renderDiagram';
import {artworkMarkup} from '../artwork';

const xml=(value:unknown)=>String(value).replace(/[&<>"'\r\n]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;','\r':'&#13;','\n':'&#10;'}[c]!));
const px=(mm:number)=>Number((mm*96/25.4).toFixed(4));
const geom=(x:number,y:number,w:number,h:number)=>`<mxGeometry x="${px(x)}" y="${px(y)}" width="${px(w)}" height="${px(h)}" as="geometry"/>`;
const image=(svg:string)=>'data:image/svg+xml,'+encodeURIComponent(svg);
/** Uncompressed draw.io XML. Native structures remain distinct cells; labels are editable text. */
export function diagramDrawio(doc:DiagramDoc,preset:DiagramStyle,name='FigTide mechanism'):string {
  const style=effectiveStyle(doc,preset),font=ptToMm(style.font_size_pt),fontPx=style.font_size_pt*96/72,line=style.line_width_pt*96/72;
  const cells=['<mxCell id="0"/>','<mxCell id="1" parent="0"/>'];
  const add=(id:string,value:string,skin:string,parent:string,geometry:string,kind:string,extra='')=>cells.push(`<mxCell id="${xml(id)}" value="${xml(value)}" style="${xml(skin)}" parent="${xml(parent)}" data-kind="${kind}" ${extra}>${geometry}</mxCell>`);
  const textStyle=`text;html=0;whiteSpace=wrap;overflow=visible;align=center;verticalAlign=middle;strokeColor=none;fillColor=none;fontFamily=${style.font_family};fontSize=${fontPx};fontColor=${style.text_color};`;
  for(const z of doc.zones){
    const shape=z.kind==='nucleus'?'shape=doubleEllipse;':'rounded=1;';
    add('zone-'+z.id,z.label,`${shape}container=1;collapsible=0;recursiveResize=1;whiteSpace=wrap;html=0;verticalAlign=top;align=left;spacingLeft=6;fontFamily=${style.font_family};fontSize=${fontPx};fontColor=${style.text_color};fillColor=${style.zone_colors[0]};strokeColor=${style.line_color};strokeWidth=${line*.75};${z.kind==='zoom'?'dashed=1;':''}`,'1',geom(z.x,z.y,z.w,z.h),'zone','vertex="1"');
  }
  for(const n of doc.nodes){
    const parent=doc.zones.find(z=>z.id===n.zone),layout=nodeLayout(n,font),body=layout.body,label=layout.label,role=n.style_ref||n.role,resolved=roleColor(role,doc.style.palette),ink=doc.style.role_colors?.[role]||(style.id==='line-minimal'?'#0E1116':resolved.stroke),fill=style.fill==='outline'?'none':resolved.fill;
    add('node-'+n.id,'','group;html=0;container=0;resizeChildren=1;',parent?'zone-'+parent.id:'1',geom(n.x-(parent?.x||0),n.y-(parent?.y||0),n.w,n.h),'node','vertex="1"');
    if(n.kind==='glyph'||n.kind==='icon'){
      const isolated:DiagramDoc={...doc,nodes:[{...n,label:''}],zones:[],edges:[],annotations:[],legend:{...doc.legend,mode:'off'},artworks:[]};
      const svg=renderDiagram(isolated,preset).replace(/width="[^"]*" height="[^"]*"/,`width="${n.w}mm" height="${n.h}mm"`).replace(/viewBox="[^"]*"/,`viewBox="${n.x} ${n.y} ${n.w} ${n.h}"`).replace(/<rect width="100%" height="100%"[^>]*\/>/,'');
      add('visual-'+n.id,'',`shape=image;imageAspect=0;image=${image(svg)};`,'node-'+n.id,geom(0,0,n.w,n.h),'visual','vertex="1"');
    }else if(n.kind!=='text')add('visual-'+n.id,'',`${n.kind==='ellipse'?'ellipse;':n.kind==='pill'?'rounded=1;arcSize=50;':'rounded=1;'}strokeColor=${ink};fillColor=${fill};strokeWidth=${line};`,'node-'+n.id,geom(body.x-n.x,body.y-n.y,body.w,body.h),'visual','vertex="1"');
    add('label-'+n.id,n.label,textStyle,'node-'+n.id,geom(label.x-n.x,label.y-n.y,label.w,label.h),'label','vertex="1"');
  }
  for(const e of doc.edges){
    const pts=edgePoints(doc,e,font),start=pts[0],end=pts[pts.length-1],a=doc.nodes.find(n=>n.id===e.from),b=doc.nodes.find(n=>n.id===e.to);if(!a||!b||!start||!end)continue;
    const terminal=e.kind==='inhibit'?'ERone':e.kind==='bind'?'oval':'block';
    const waypoints=pts.length>2?`<Array as="points">${pts.slice(1,-1).map(p=>`<mxPoint x="${px(p.x)}" y="${px(p.y)}"/>`).join('')}</Array>`:'';
    const connection=`exitX=${(start.x-a.x)/a.w};exitY=${(start.y-a.y)/a.h};exitPerimeter=0;entryX=${(end.x-b.x)/b.w};entryY=${(end.y-b.y)/b.h};entryPerimeter=0;`;
    add('edge-'+e.id,e.label,`html=0;${connection}endArrow=${terminal};endFill=${e.kind==='inhibit'?0:1};endSize=8;strokeWidth=${line*1.25};strokeColor=${style.line_color};fontFamily=${style.font_family};fontSize=${fontPx};${['indirect','transport'].includes(e.kind)?'dashed=1;':''}`,'1',`<mxGeometry relative="1" as="geometry">${waypoints}</mxGeometry>`,'edge',`edge="1" source="${xml('node-'+e.from)}" target="${xml('node-'+e.to)}"`);
  }
  for(const a of doc.annotations){const target=[...doc.nodes,...doc.zones].find(n=>n.id===a.target);if(target)add('annotation-'+a.id,a.text,textStyle,'1',geom(target.x,Math.max(0,target.y-font*2),target.w,font*1.4),'annotation','vertex="1"');}
  for(const layer of doc.artworks||[]){const svg=artworkMarkup({...layer,x:0,y:0},'drawio-'+layer.id);if(svg)add('artwork-'+layer.id,layer.name,`shape=image;imageAspect=1;image=${image(svg)};verticalLabelPosition=bottom;verticalAlign=top;${layer.locked?'movable=0;resizable=0;deletable=0;':''}`,'1',geom(layer.x,layer.y,layer.w,layer.h),'artwork',`vertex="1" visible="${layer.hidden?0:1}"`);}
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="FigTide" version="1"><diagram id="figtide" name="${xml(name)}"><mxGraphModel dx="0" dy="0" grid="1" gridSize="${px(1)}" page="1" pageScale="1" pageWidth="${px(doc.canvas.width_mm)}" pageHeight="${px(doc.canvas.height_mm)}" background="${xml(doc.canvas.background)}"><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
}
