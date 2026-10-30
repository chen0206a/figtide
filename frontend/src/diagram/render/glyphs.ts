import type { DiagramRect, DiagramStyle } from "../model";
import rough from "roughjs";
import { ptToMm } from "../units";
import { stableSeed } from "./sketch";

export const glyphKinds=["cell","vesicle","receptor","protein","dimer","ligand","small-molecule","dna","input-frames","encoder","llm","attention","tokens","layers","dataset","result-bars","text-input","tube","flask","cell-cluster","laser","lens","beam-splitter","sample-stage","detector","energy-levels","phospho","frozen","trainable","number"] as const;
export type GlyphKind=typeof glyphKinds[number];
export type GlyphPalette=Pick<DiagramStyle,"accent_colors"|"line_color"|"text_color"|"fill"|"line_width_pt"|"sketch"|"iso"|"radius_mm">;
export type GlyphLayer={paths:string[];fill:string;stroke:string;opacity?:number};
export type GlyphDrawing={layers:GlyphLayer[];bounds:DiagramRect};
const f=(n:number)=>Number(n.toFixed(4));
export function glyphBounds(kind:string,w:number,h:number):DiagramRect {
  if(kind==="receptor")return {x:w*.18,y:h*.03,w:w*.64,h:h*.94};
  if(kind==="tube")return {x:w*.28,y:h*.04,w:w*.44,h:h*.92};
  return {x:w*.04,y:h*.04,w:w*.92,h:h*.92};
}
/** Authored vector geometry. Coordinates are expanded to mm before stroking, never bitmap-scaled. */
export function drawGlyph(kind:GlyphKind,w:number,h:number,palette:GlyphPalette):GlyphDrawing {
  if(!glyphKinds.includes(kind)||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw new Error("图元类型或尺寸无效");
  const x=(v:number)=>f(v*w),y=(v:number)=>f(v*h);
  const path=(points:[number,number][],close=false)=>points.map(([a,b],i)=>`${i?"L":"M"}${x(a)} ${y(b)}`).join(" ")+(close?" Z":"");
  const rectangle=(a:number,b:number,c:number,d:number)=>path([[a,b],[a+c,b],[a+c,b+d],[a,b+d]],true);
  const ellipse=(cx:number,cy:number,rx:number,ry:number)=>`M${x(cx-rx)} ${y(cy)} A${x(rx)} ${y(ry)} 0 1 0 ${x(cx+rx)} ${y(cy)} A${x(rx)} ${y(ry)} 0 1 0 ${x(cx-rx)} ${y(cy)} Z`;
  const line=(a:number,b:number,c:number,d:number)=>path([[a,b],[c,d]]);
  const polygon=(cx:number,cy:number,rx:number,ry:number,count=6,rotation=0)=>path(Array.from({length:count},(_,i)=>[cx+rx*Math.cos(rotation+i*2*Math.PI/count),cy+ry*Math.sin(rotation+i*2*Math.PI/count)] as [number,number]),true);
  const blob=(cx:number,cy:number,rx:number,ry:number,phase:number)=>{
    const pts=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,r=1+.07*Math.sin(i*2+phase);return [cx+Math.cos(a)*rx*r,cy+Math.sin(a)*ry*r] as [number,number];});
    let out=`M${x((pts[11][0]+pts[0][0])/2)} ${y((pts[11][1]+pts[0][1])/2)}`;
    pts.forEach((p,i)=>{const next=pts[(i+1)%pts.length];out+=` Q${x(p[0])} ${y(p[1])} ${x((p[0]+next[0])/2)} ${y((p[1]+next[1])/2)}`;});return out+" Z";
  };
  const body:string[]=[],detail:string[]=[],accent:string[]=[];
  const bounds=glyphBounds(kind,w,h);
  switch(kind) {
    case "cell":
      body.push(ellipse(.5,.5,.43,.43));detail.push(ellipse(.58,.48,.16,.2),ellipse(.58,.48,.12,.16));accent.push(ellipse(.3,.35,.055,.08),ellipse(.33,.72,.09,.045));break;
    case "vesicle":
      body.push(ellipse(.5,.5,.42,.42));detail.push(ellipse(.5,.5,.34,.34));for(let i=0;i<12;i++){const a=i*Math.PI/6;accent.push(ellipse(.5+.38*Math.cos(a),.5+.38*Math.sin(a),.022,.022));}break;
    case "receptor":
      for(const cx of [.34,.66]){body.push(blob(cx,.21,.15,.17,cx*7),rectangle(cx-.055,.37,.11,.31));detail.push(`M${x(cx-.05)} ${y(.67)} Q${x(cx-.13)} ${y(.86)} ${x(cx+.02)} ${y(.96)} L${x(cx+.1)} ${y(.87)}`);accent.push(line(cx,.4,cx,.65));}break;
    case "protein":
      body.push(blob(.5,.5,.43,.37,.5));detail.push(`M${x(.24)} ${y(.5)} Q${x(.45)} ${y(.24)} ${x(.69)} ${y(.45)}`);accent.push(ellipse(.66,.65,.07,.05));break;
    case "dimer":
      body.push(blob(.28,.52,.235,.35,.3),blob(.72,.48,.235,.35,2));detail.push(line(.43,.4,.57,.42),line(.43,.6,.57,.58));accent.push(ellipse(.25,.48,.055,.07),ellipse(.76,.52,.055,.07));break;
    case "ligand":
      body.push(ellipse(.34,.64,.23,.24),ellipse(.66,.64,.23,.24),ellipse(.5,.3,.23,.24));detail.push(line(.42,.55,.58,.55),line(.46,.48,.5,.39),line(.54,.48,.5,.39));break;
    case "small-molecule":
      body.push(polygon(.33,.5,.27,.36,6,Math.PI/6),polygon(.73,.5,.27,.36,6,Math.PI/6));detail.push(line(.08,.35,.22,.2),line(.85,.28,.96,.12));break;
    case "dna": {
      let a="",b="";for(let i=0;i<=48;i++){const t=i/48,offset=Math.sin(t*Math.PI*6)*.29;a+=`${i?"L":"M"}${x(.04+t*.92)} ${y(.5+offset)} `;b+=`${i?"L":"M"}${x(.04+t*.92)} ${y(.5-offset)} `;if(i%3===1)detail.push(line(.04+t*.92,.5+offset,.04+t*.92,.5-offset));}body.push(a,b);accent.push(rectangle(.4,.14,.2,.72));break;
    }
    case "input-frames":
      body.push(rectangle(.06,.25,.72,.65),rectangle(.16,.15,.72,.65),rectangle(.26,.05,.68,.65));detail.push(path([[.3,.59],[.46,.32],[.61,.5],[.73,.36],[.9,.59]],true));accent.push(ellipse(.77,.23,.055,.065));break;
    case "encoder":
      body.push(path([[.08,.07],[.92,.3],[.92,.7],[.08,.93]],true));for(const t of [.3,.5,.7])detail.push(line(t,.07+(t-.08)*.27,t,.93-(t-.08)*.27));break;
    case "llm":
      body.push(rectangle(.08,.05,.84,.9));for(const row of [.16,.27,.69,.8])detail.push(rectangle(.2,row,.6,.055));accent.push(line(.25,.49,.75,.49),line(.35,.43,.35,.55),line(.65,.43,.65,.55));break;
    case "attention":
      body.push(rectangle(.06,.06,.88,.88));for(let i=0;i<5;i++)for(let j=0;j<5;j++)(i===j?accent:detail).push(rectangle(.085+i*.17,.085+j*.17,.15,.15));break;
    case "tokens":
      for(let i=0;i<5;i++){body.push(rectangle(.04+i*.19,.25,.15,.5));detail.push(line(.075+i*.19,.4,.155+i*.19,.4),line(.075+i*.19,.6,.155+i*.19,.6));}break;
    case "layers":
      body.push(rectangle(.22,.06,.72,.68),rectangle(.14,.16,.72,.68),rectangle(.06,.26,.72,.68));detail.push(line(.18,.43,.66,.43),line(.18,.59,.66,.59),line(.18,.75,.66,.75));break;
    case "dataset":
      body.push(`M${x(.12)} ${y(.2)} V${y(.8)} A${x(.38)} ${y(.14)} 0 0 0 ${x(.88)} ${y(.8)} V${y(.2)} Z`);detail.push(ellipse(.5,.2,.38,.14),`M${x(.12)} ${y(.5)} A${x(.38)} ${y(.14)} 0 0 0 ${x(.88)} ${y(.5)}`);break;
    case "result-bars":
      // Equal-height columns are a pictogram, never a fabricated quantitative result.
      body.push(rectangle(.18,.3,.16,.55),rectangle(.45,.3,.16,.55),rectangle(.72,.3,.16,.55));detail.push(line(.08,.12,.08,.9),line(.08,.9,.96,.9));break;
    case "text-input":
      body.push(rectangle(.06,.12,.88,.76));detail.push(line(.2,.32,.8,.32),line(.2,.5,.72,.5),line(.2,.68,.58,.68));break;
    case "tube":
      body.push(`M${x(.32)} ${y(.06)} V${y(.73)} Q${x(.32)} ${y(.94)} ${x(.5)} ${y(.94)} Q${x(.68)} ${y(.94)} ${x(.68)} ${y(.73)} V${y(.06)} Z`);detail.push(line(.27,.06,.73,.06),line(.32,.52,.68,.52));accent.push(`M${x(.36)} ${y(.59)} V${y(.73)} Q${x(.5)} ${y(.92)} ${x(.64)} ${y(.73)} V${y(.59)} Z`);break;
    case "flask":
      body.push(path([[.39,.05],[.61,.05],[.61,.36],[.92,.94],[.08,.94],[.39,.36]],true));detail.push(line(.32,.05,.68,.05),line(.23,.67,.77,.67));accent.push(path([[.23,.71],[.77,.71],[.86,.9],[.14,.9]],true));break;
    case "cell-cluster":
      for(const [cx,cy] of [[.29,.32],[.7,.33],[.49,.72]]){body.push(ellipse(cx,cy,.23,.23));detail.push(ellipse(cx+.025,cy,.08,.09));}break;
    case "laser":
      body.push(rectangle(.04,.2,.76,.6));detail.push(rectangle(.8,.37,.16,.26),line(.16,.5,.68,.5));accent.push(line(.96,.5,.995,.5));break;
    case "lens":
      body.push(`M${x(.5)} ${y(.04)} Q${x(.96)} ${y(.5)} ${x(.5)} ${y(.96)} Q${x(.04)} ${y(.5)} ${x(.5)} ${y(.04)} Z`);detail.push(`M${x(.49)} ${y(.17)} Q${x(.25)} ${y(.5)} ${x(.49)} ${y(.83)}`);break;
    case "beam-splitter":
      body.push(path([[.07,.2],[.76,.2],[.93,.06],[.93,.77],[.76,.94],[.07,.94]],true));detail.push(line(.07,.2,.76,.94),line(.76,.2,.76,.94),line(.76,.2,.93,.06));break;
    case "sample-stage":
      body.push(rectangle(.06,.62,.88,.16),rectangle(.18,.78,.12,.16),rectangle(.7,.78,.12,.16));detail.push(`M${x(.28)} ${y(.61)} Q${x(.5)} ${y(.07)} ${x(.72)} ${y(.61)} Z`);break;
    case "detector":
      body.push(rectangle(.05,.08,.9,.84));detail.push(rectangle(.2,.23,.6,.54));for(let i=1;i<4;i++){accent.push(line(.2+i*.15,.23,.2+i*.15,.77),line(.2,.23+i*.135,.8,.23+i*.135));}break;
    case "energy-levels":
      body.push(line(.06,.75,.35,.75),line(.38,.25,.65,.25),line(.68,.58,.96,.58));detail.push(line(.2,.69,.51,.31),line(.53,.31,.8,.52));break;
    case "phospho":
      body.push(ellipse(.5,.5,.43,.43));detail.push(`M${x(.38)} ${y(.76)} V${y(.24)} H${x(.56)} Q${x(.75)} ${y(.4)} ${x(.56)} ${y(.5)} H${x(.38)}`);break;
    case "frozen":
      for(let i=0;i<3;i++){const a=i*Math.PI/3,dx=Math.cos(a)*.43,dy=Math.sin(a)*.43;body.push(line(.5-dx,.5-dy,.5+dx,.5+dy));}
      for(let i=0;i<6;i++){const a=i*Math.PI/3,px=.5+Math.cos(a)*.3,py=.5+Math.sin(a)*.3;detail.push(line(px,py,px-Math.cos(a-.7)*.13,py-Math.sin(a-.7)*.13),line(px,py,px-Math.cos(a+.7)*.13,py-Math.sin(a+.7)*.13));}break;
    case "trainable":
      body.push(`M${x(.5)} ${y(.04)} Q${x(.9)} ${y(.35)} ${x(.85)} ${y(.66)} Q${x(.74)} ${y(.98)} ${x(.4)} ${y(.94)} Q${x(.08)} ${y(.88)} ${x(.16)} ${y(.57)} L${x(.32)} ${y(.31)} Q${x(.37)} ${y(.6)} ${x(.48)} ${y(.49)} Q${x(.65)} ${y(.3)} ${x(.5)} ${y(.04)} Z`);detail.push(`M${x(.49)} ${y(.55)} Q${x(.73)} ${y(.83)} ${x(.5)} ${y(.87)} Q${x(.27)} ${y(.82)} ${x(.49)} ${y(.55)} Z`);break;
    case "number":
      body.push(ellipse(.5,.5,.43,.43));detail.push(path([[.38,.33],[.53,.22],[.53,.77]]),line(.35,.77,.7,.77));break;
  }
  const fill=palette.fill==="outline"?"none":palette.accent_colors[0],secondary=palette.accent_colors[1]||palette.accent_colors[0];
  if(kind==="dna")return {bounds,layers:[{paths:accent,fill:palette.fill==="outline"?"none":secondary,stroke:"none",opacity:.18},{paths:body,fill:"none",stroke:palette.line_color},{paths:detail,fill:"none",stroke:palette.line_color}]};
  return {bounds,layers:[{paths:body,fill:kind==="small-molecule"?"none":fill,stroke:palette.line_color,opacity:palette.fill==="soft"?.35:1},{paths:detail,fill:"none",stroke:palette.line_color},{paths:accent,fill:palette.fill==="outline"?"none":secondary,stroke:palette.fill==="outline"?secondary:palette.line_color,opacity:palette.fill==="soft"?.6:1}].filter(layer=>layer.paths.length)};
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]!);
export function glyphMarkup(kind:GlyphKind,w:number,h:number,palette:GlyphPalette,seedKey:string=kind):string {
  const drawing=drawGlyph(kind,w,h,palette),line=ptToMm(palette.line_width_pt),generator=palette.sketch?rough.generator():null;
  return drawing.layers.map((layer,i)=>`<g data-glyph-layer="${i===0?"body":"detail"}" fill="${escape(layer.fill)}" stroke="${escape(layer.stroke)}" stroke-width="${line}" opacity="${layer.opacity??1}" stroke-linejoin="round" stroke-linecap="round">${layer.paths.map((d,j)=>{
    if(!generator)return `<path d="${escape(d)}"/>`;
    return generator.toPaths(generator.path(d,{seed:stableSeed(`${seedKey}:${i}:${j}`),stroke:layer.stroke,strokeWidth:line,fill:layer.fill==="none"?undefined:layer.fill,fillStyle:"solid",roughness:.35,bowing:.1,disableMultiStroke:true})).map(p=>`<path d="${escape(p.d)}" fill="${escape(p.fill||"none")}" stroke="${escape(p.stroke||"none")}" stroke-width="${p.strokeWidth}"/>`).join("");
  }).join("")}</g>`).join("");
}
/** Two leaflets of explicit phospholipid heads and paired hydrophobic tails. */
export function membraneMarkup(w:number,h:number,palette:GlyphPalette):string {
  const count=Math.max(1,Math.min(160,Math.floor(w/1.8))),spacing=w/count,r=Math.min(.65,h/8,spacing*.35),top=r+.15,bottom=h-r-.15;
  let heads="",tails="";
  const circle=(cx:number,cy:number)=>`M${f(cx-r)} ${f(cy)} a${f(r)} ${f(r)} 0 1 0 ${f(r*2)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-r*2)} 0 Z `;
  for(let i=0;i<count;i++){const cx=(i+.5)*spacing;heads+=circle(cx,top)+circle(cx,bottom);for(const dx of [-r*.4,r*.4])tails+=`M${f(cx+dx)} ${f(top+r)} V${f(h/2-.15)} M${f(cx+dx)} ${f(bottom-r)} V${f(h/2+.15)} `;}
  const fill=palette.fill==="outline"?"none":palette.accent_colors[0];
  return `<g data-glyph-layer="body" fill="${escape(fill)}" stroke="${escape(palette.line_color)}" stroke-width="${ptToMm(palette.line_width_pt)}"><path d="${heads}"/></g><g data-glyph-layer="detail" fill="none" stroke="${escape(palette.line_color)}" stroke-width="${ptToMm(palette.line_width_pt)}"><path d="${tails}"/></g>`;
}
export function nuclearEnvelopeMarkup(w:number,h:number,palette:GlyphPalette):string {
  const gap=Math.min(.8,w*.05,h*.05),stroke=escape(palette.line_color),width=ptToMm(palette.line_width_pt);
  return `<g data-glyph-layer="body" fill="none" stroke="${stroke}" stroke-width="${width}"><ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}"/></g><g data-glyph-layer="detail" fill="none" stroke="${stroke}" stroke-width="${width}"><ellipse cx="${w/2}" cy="${h/2}" rx="${w/2-gap}" ry="${h/2-gap}"/></g>`;
}
