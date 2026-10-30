import {roleColor,paletteOf} from "../palettes";
import { effectiveStyle, type DiagramDoc, type DiagramStyle, type DiagramRect } from "../model";
import { edgePoints, nodeLayout, ptToMm, wrapLabel } from "./geometry";
import { sketchPaths, stableSeed } from "./sketch";
import {glyphMarkup,membraneMarkup,nuclearEnvelopeMarkup,tintColor,type GlyphKind} from "./glyphs";
export const edgeNames: Record<DiagramDoc["edges"][number]["kind"],string> = {flow:"Flow",activate:"Activation",inhibit:"Inhibition",transport:"Translocation",bind:"Binding",indirect:"Indirect interaction"};
const esc = (value: unknown) => String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]!);
const fmt = (n: number) => Number(n.toFixed(4));
const roleColors:Record<string,number>={actor:0,process:1,data:0,model:0,output:1,note:2};
export function readableText(background: string, text: string): string {
  const luminance=(hex:string)=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
  const b=luminance(background),t=luminance(text);
  return (Math.max(b,t)+.05)/(Math.min(b,t)+.05)>=4.5?text:b<.18?"#FFFFFF":"#000000";
}
/** The only SVG renderer: editor, thumbnails, exports and geometry collection use this output. */
export function renderDiagram(doc: DiagramDoc, preset: DiagramStyle): string {
  const style=effectiveStyle(doc,preset),font=ptToMm(style.font_size_pt),line=ptToMm(style.line_width_pt)*(style.sketch?1.3:1),edgeLine=ptToMm(1.25)*(style.sketch?1.3:1),zoneLine=ptToMm(.75);
  const prefix="dg"+stableSeed(JSON.stringify(style));
  const marker=(kind:string)=>`url(#${prefix}-${kind})`;
  const text=(label:string,box:DiagramRect,fill=style.text_color,align:"center"|"left"="center",reference="",size=font)=>{
    const font=size;
    const lines=wrapLabel(label,Math.max(1,box.w-2),font),step=font*1.25;
    const x=align==="left"?box.x+1:box.x+box.w/2;
    const y=align==="left"?box.y+font:box.y+box.h/2-(lines.length-1)*step/2+font*.34;
    return `<text data-diagram-text="true" data-container-x="${box.x}" data-container-y="${box.y}" data-container-w="${box.w}" data-container-h="${box.h}"${reference?` data-text-target="${esc(reference)}"`:""} x="${fmt(x)}" y="${fmt(y)}" font-size="${fmt(font)}" fill="${esc(fill)}" text-anchor="${align==="left"?"start":"middle"}" xml:space="preserve">${lines.map((s,i)=>`<tspan x="${fmt(x)}" y="${fmt(y+i*step)}">${esc(s)}</tspan>`).join("")}</text>`;
  };
  const defs=`<defs>
    <marker id="${prefix}-arrow" viewBox="0 0 2.5 2.2" refX="2.5" refY="1.1" markerWidth="2.5" markerHeight="2.2" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L2.5 1.1 L0 2.2 Z" fill="${esc(style.line_color)}"/></marker>
    <marker id="${prefix}-inhibit" viewBox="0 0 8 10" refX="6" refY="5" markerWidth="7" markerHeight="9" orient="auto" markerUnits="strokeWidth"><path d="M6 1 L6 9" fill="none" stroke="${esc(paletteOf(doc.style.palette).c)}" stroke-width="1.7"/></marker>
    <marker id="${prefix}-bind" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7"><circle cx="4" cy="4" r="2.4" fill="${esc(style.line_color)}" stroke="${esc(style.line_color)}"/></marker>
    <filter id="${prefix}-shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="0.5" stdDeviation="0.4" flood-opacity="0.12"/></filter>
    ${style.accent_colors.map((c,i)=>`<linearGradient id="${prefix}-soft${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(c)}" stop-opacity="0.32"/><stop offset="1" stop-color="${esc(c)}" stop-opacity="0.13"/></linearGradient>`).join("")}
  </defs>`;
  const P=paletteOf(doc.style.palette),minimal=style.id==="line-minimal";
  const zoneSkin=style.id==="soft-illustration"?["#F2F6FB","#DCE5F0"]:style.id==="conference-framework"?["#EEF4FB","#BFD3EA"]:style.id==="sketch"?["#FBF7EA","#8C877A"]:["#F7F8FA","#C9D0D9"];
  const zones=doc.zones.map(z=>{
    const membraneFill=minimal?"#FFFFFF":tintColor(P.a,"#FFFFFF",.9),membraneStroke=minimal?"#0E1116":tintColor(P.a,"#FFFFFF",.35);
    const zoneFill=minimal?"#FFFFFF":zoneSkin[0],zoneStroke=minimal?"#0E1116":zoneSkin[1];
    const space=z.kind==="compartment"&&doc.zones.some(m=>m.kind==="membrane"&&z.y+z.h<=m.y+.01);
    let shape=space?"":`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${style.radius_mm*2}" fill="${zoneFill}" stroke="${zoneStroke}" stroke-width="${zoneLine}"/>`;
    let labelBox={x:z.x+.6,y:z.y+1.2,w:z.w-2,h:2.6},center=false;
    if(z.kind==="membrane"){
      shape=`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${membraneFill}"/><g transform="translate(${z.x} ${z.y})">${membraneMarkup(z.w,z.h,{...style,accent_colors:[membraneStroke],zone_colors:[membraneFill],line_width_pt:.5})}</g>`;
      const labelWidth=Math.min(z.w-2,Math.max(24,z.label.length*1.05));labelBox={x:z.x+z.w-labelWidth-1.6,y:z.y+z.h/2-1.3,w:labelWidth,h:2.6};
      shape+=`<rect x="${labelBox.x}" y="${labelBox.y}" width="${labelBox.w}" height="${labelBox.h}" fill="${membraneFill}"/>`;center=true;
    }
    if(z.kind==="nucleus"){
      const fill=minimal?"#FFFFFF":tintColor(P.d,"#FFFFFF",.93),stroke=minimal?"#0E1116":tintColor(P.d,"#000000",.05),gap=Math.min(.8854,z.w*.1,z.h*.1);
      shape=`<ellipse cx="${z.x+z.w/2}" cy="${z.y+z.h/2}" rx="${z.w/2}" ry="${z.h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${zoneLine}"/><ellipse cx="${z.x+z.w/2}" cy="${z.y+z.h/2}" rx="${z.w/2-gap}" ry="${z.h/2-gap}" fill="none" stroke="${stroke}" stroke-width="${zoneLine}"/>`;
      labelBox={x:z.x,y:z.y+2.4,w:z.w,h:2.6};center=true;
    }
    if(z.kind==="zoom")shape=`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${style.radius_mm}" fill="${doc.canvas.background}" stroke="${style.line_color}" stroke-width="${zoneLine}" stroke-dasharray="1.4 1"/>`;
    if(z.kind==="panel"&&style.id==="conference-framework")shape+=`<rect x="${z.x}" y="${z.y}" width="${Math.min(z.w,z.label.length*1.05+3)}" height="3.2" fill="${zoneStroke}" stroke="none"/>`;
    const source=[...doc.zones,...doc.nodes].find(a=>a.id===z.zoom_of);
    const guides=source?`<path data-zoom-guides="true" d="M${source.x} ${source.y+source.h} L${z.x} ${z.y} M${source.x+source.w} ${source.y+source.h} L${z.x+z.w} ${z.y}" fill="none" stroke="${tintColor(style.line_color,"#FFFFFF",.45)}" stroke-width="${ptToMm(.6)}" stroke-dasharray="1.4 1"/>`:"";
    return `${guides}<g data-zone-id="${esc(z.id)}">${shape}<g font-style="${["compartment","membrane","nucleus"].includes(z.kind)?"italic":"normal"}">${text(z.label,labelBox,z.kind==="panel"&&style.id==="conference-framework"?"#FFFFFF":"#5F6773",center?"center":"left",z.id,1.9)}</g></g>`;
  }).join("");
  const edges=doc.edges.map(e=>{
    const pts=edgePoints(doc,e,font);if(pts.length<2)return "";
    const d=pts.map((p,i)=>`${i?"L":"M"}${fmt(p.x)} ${fmt(p.y)}`).join(" ");
    const edgeInk=e.kind==="inhibit"?(paletteOf(doc.style.palette).c):style.line_color;
    const end=e.kind==="inhibit"?"inhibit":e.kind==="bind"?"bind":"arrow",dash=["indirect","transport"].includes(e.kind)?' stroke-dasharray="1.5 1"':"";
    const mid=pts[Math.floor(pts.length/2)];
    return `<g data-edge-id="${esc(e.id)}"><path data-diagram-edge="true" d="${d}" fill="none" stroke="${esc(edgeInk)}" stroke-width="${edgeLine}"${dash} marker-end="${marker(end)}"/>${e.label?text(e.label,{x:mid.x-15,y:mid.y-font*2,w:30,h:font*1.3},style.text_color,"center",e.id):""}</g>`;
  }).join("");
  const nodes=doc.nodes.map(n=>{
    const index=(roleColors[n.style_ref||n.role]||0)%style.accent_colors.length;
    const resolved=roleColor(n.style_ref||n.role,doc.style.palette),color=style.id==="line-minimal"?(n.role==="note"?"#D55E00":"#0E1116"):resolved.stroke,bodyFill=style.id==="line-minimal"?"#FFFFFF":resolved.fill,layout=nodeLayout(n,font),body=layout.body;
    const fill=style.fill==="outline"||n.kind==="text"?"none":bodyFill;
    const stroke=style.fill==="outline"?style.line_color:color,rx=n.kind==="pill"?body.h/2:Math.min(style.radius_mm,body.w/4,body.h/4);
    const palette={...style,body_fill:bodyFill,line_color:stroke,accent_colors:[color,...style.accent_colors.filter(c=>c!==color)]};
    let shape="",frame="";
    if(n.kind==="glyph") {
      shape=`<g data-scientific-glyph="${esc(n.glyph)}" transform="translate(${body.x} ${body.y})"><title>Schematic vector glyph</title>${glyphMarkup(n.glyph as GlyphKind,body.w,body.h,palette,n.id)}</g>`;
      if(n.boxed)frame=`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${style.radius_mm}" fill="${esc(style.zone_colors[0])}" stroke="${esc(color)}" stroke-width="${line}"/>`;
    } else if(style.sketch&&n.kind!=="text")shape=sketchPaths(n.id,body,n.kind==="ellipse",stroke,line).map(p=>`<path d="${esc(p.d)}" stroke="${esc(p.stroke)}" stroke-width="${p.strokeWidth}" fill="none"/>`).join("");
    else if(style.iso&&n.kind==="box") {
      const rise=Math.min(2,body.w/5,body.h/5),b=body;
      shape=`<path d="M${b.x} ${b.y+rise} L${b.x+rise} ${b.y} H${b.x+b.w} V${b.y+b.h-rise} L${b.x+b.w-rise} ${b.y+b.h} H${b.x} Z"/><path d="M${b.x} ${b.y+rise} H${b.x+b.w-rise} L${b.x+b.w} ${b.y} M${b.x+b.w-rise} ${b.y+rise} V${b.y+b.h}" fill="none"/>`;
    } else if(n.kind!=="text")shape=n.kind==="ellipse"?`<ellipse cx="${body.x+body.w/2}" cy="${body.y+body.h/2}" rx="${body.w/2}" ry="${body.h/2}"/>`:`<rect x="${body.x}" y="${body.y}" width="${body.w}" height="${body.h}" rx="${rx}"/>`;
    const badgeSize=Math.max(2.8,Math.min(body.w,body.h)*.2),badges=(n.badges||[]).filter(b=>b!=="phospho"||n.glyph!=="dimer").map((badge,i)=>{
      const x=n.x+n.w-(i+1)*badgeSize,y=n.y;
      if(badge.startsWith("number:"))return `<g data-node-badge="true"><circle cx="${x+badgeSize/2}" cy="${y+badgeSize/2}" r="${badgeSize/2}" fill="${esc(doc.canvas.background)}" stroke="${esc(stroke)}" stroke-width="${line}"/>${text(badge.slice(7),{x,y,w:badgeSize,h:badgeSize},style.text_color,"center",n.id)}</g>`;
      const ink=badge==="frozen"?style.accent_colors[0]:style.accent_colors[2]||color;return `<g data-node-badge="true" transform="translate(${x} ${y})">${glyphMarkup(badge as GlyphKind,badgeSize,badgeSize,{...palette,line_color:ink,accent_colors:[ink]},n.id+badge)}</g>`;
    }).join("");
    const labelFill=(n.label_pos||"center")==="center"&&!n.boxed&&style.fill==="flat"&&n.kind!=="text"?readableText(bodyFill,style.text_color):style.text_color;
    return `<g data-node-id="${esc(n.id)}" data-body-x="${layout.anchor.x}" data-body-y="${layout.anchor.y}" data-body-w="${layout.anchor.w}" data-body-h="${layout.anchor.h}">${frame}<g fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${line}"${style.shadow?` filter="url(#${prefix}-shadow)"`:""}>${shape}</g>${text(n.label,layout.label,labelFill,"center",n.id)}${badges}</g>`;
  }).join("");
  const annotations=doc.annotations.map(a=>{const target=[...doc.nodes,...doc.zones].find(n=>n.id===a.target);return target?`<g data-annotation-id="${esc(a.id)}">${text(a.text,{x:target.x,y:Math.max(0,target.y-font*2),w:target.w,h:font*1.4},style.text_color,"left",a.id)}</g>`:"";}).join("");
  const kinds=(["activate","inhibit","transport","bind","indirect"] as const).filter(kind=>doc.edges.some(e=>e.kind===kind));
  const legend=kinds.length>=2&&doc.legend.mode==="auto"?(()=>{
    const w=Math.min(44,doc.canvas.width_mm-4),h=kinds.length*(font*1.4+1)+3;
    const x=doc.legend.position.endsWith("right")?doc.canvas.width_mm-w-2:2,y=doc.legend.position.startsWith("bottom")?doc.canvas.height_mm-h-2:2;
    return `<g data-diagram-legend="true"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(doc.canvas.background)}" fill-opacity="0.96"/>${kinds.map((kind,i)=>{const cy=y+2+(i+.5)*(font*1.4+1);return `<path d="M${x+1} ${cy} H${x+8}" stroke="${esc(kind==="inhibit"?paletteOf(doc.style.palette).c:style.line_color)}" stroke-width="${edgeLine}" marker-end="${marker(kind==="inhibit"?"inhibit":kind==="bind"?"bind":"arrow")}"${["indirect","transport"].includes(kind)?' stroke-dasharray="1.5 1"':""}/>${text(edgeNames[kind],{x:x+9,y:cy-font*.8,w:w-10,h:font*1.5},style.text_color,"left")}`;}).join("")}</g>`;
  })():"";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.canvas.width_mm}mm" height="${doc.canvas.height_mm}mm" viewBox="0 0 ${doc.canvas.width_mm} ${doc.canvas.height_mm}" role="img" aria-label="机制图" font-family="${esc(style.font_family)}"><title>Mechanism diagram</title>${defs}<rect width="100%" height="100%" fill="${esc(doc.canvas.background)}"/>${zones}${edges}${nodes}${annotations}${legend}</svg>`;
}
