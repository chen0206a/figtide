import type {DiagramOverrides} from './model';

export type ExtractedStyle={colors:string[];overrides:DiagramOverrides;statistics:{fontFamilies:string[];lineWidthPt:number|null;radiusMm:number|null};warnings:string[]};
const hex=(rgb:number[])=>'#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase();
const parse=(value:string):number[]|null=>{let s=value.trim();const names:Record<string,string>={black:'#000000',white:'#FFFFFF',red:'#FF0000',blue:'#0000FF',green:'#008000'};s=names[s.toLowerCase()]||s;if(/^#[0-9a-f]{3}$/i.test(s))s='#'+[...s.slice(1)].map(c=>c+c).join('');return /^#[0-9a-f]{6}$/i.test(s)?[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)):null;};
const distance=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+(x-b[i])**2,0);
/** Weighted, deterministic k-means. Transparent pixels and the border background are excluded. */
export function extractPalette(data:ArrayLike<number>,width:number,height:number,limit=6):string[]{
  if(width<1||height<1||data.length!==width*height*4)throw new Error('像素数据无效。');
  const border=new Map<string,number>(),hist=new Map<string,number>();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(data[i+3]<128)continue;const key=[data[i],data[i+1],data[i+2]].join(',');hist.set(key,(hist.get(key)||0)+1);if(x===0||y===0||x===width-1||y===height-1)border.set(key,(border.get(key)||0)+1);}
  const background=[...border].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0].split(',').map(Number)||[255,255,255];
  const points=[...hist].map(([key,count])=>({rgb:key.split(',').map(Number),count})).filter(p=>distance(p.rgb,background)>24**2).sort((a,b)=>b.count-a.count||hex(a.rgb).localeCompare(hex(b.rgb)));
  if(!points.length)throw new Error('排除背景后没有可提取的颜色，请换一张参考图。');
  const k=Math.min(limit,points.length),centers=[points[0].rgb];while(centers.length<k){const next=points.map(p=>({point:p,score:Math.min(...centers.map(c=>distance(p.rgb,c)))*Math.sqrt(p.count)})).sort((a,b)=>b.score-a.score)[0];centers.push([...next.point.rgb]);}
  let totals:number[]=[];for(let round=0;round<24;round++){totals=Array(k).fill(0);const sums=Array.from({length:k},()=>[0,0,0]);for(const point of points){let best=0;for(let c=1;c<k;c++)if(distance(point.rgb,centers[c])<distance(point.rgb,centers[best]))best=c;totals[best]+=point.count;for(let channel=0;channel<3;channel++)sums[best][channel]+=point.rgb[channel]*point.count;}
    let moved=0;for(let c=0;c<k;c++)if(totals[c]){const next=sums[c].map(v=>v/totals[c]);moved+=distance(centers[c],next);centers[c]=next;}if(moved<.1)break;
  }
  return [...new Set(centers.map((rgb,i)=>({color:hex(rgb),weight:totals[i]})).sort((a,b)=>b.weight-a.weight||a.color.localeCompare(b.color)).map(x=>x.color))].slice(0,limit);
}
const median=(values:number[])=>values.length?[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]:null;
const physicalPt=(value:string,unitPt=.75):number|null=>{const match=value.trim().match(/^([\d.]+)(px|pt|mm|cm|in)?$/);if(!match)return null;const v=Number(match[1])*(({px:.75,pt:1,mm:72/25.4,cm:720/25.4,in:72} as Record<string,number>)[match[2]]||unitPt);return Number.isFinite(v)?v:null;};
export function extractSvgStyle(source:string):ExtractedStyle{
  if(new TextEncoder().encode(source).length>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('参考SVG过大或包含不支持的XML声明。');
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml');if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw new Error('SVG格式无效。');
  const all=[...parsed.querySelectorAll('*')];if(all.length>20000)throw new Error('参考SVG元素过多。');
  const view=parsed.documentElement.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number),widthPt=physicalPt(parsed.documentElement.getAttribute('width')||'');const unitPt=widthPt&&view?.[2]?widthPt/view[2]:.75;
  const colors=new Map<string,number>(),widths:number[]=[],radii:number[]=[],fonts=new Set<string>();
  const declarations=(text:string)=>new Map(text.split(';').map(part=>{const colon=part.indexOf(':');return colon>0?[part.slice(0,colon).trim(),part.slice(colon+1).trim()]:['',''];}).filter(([key])=>!!key) as [string,string][]);
  let background=[255,255,255];const canvasW=view?.[2]||Number.parseFloat(parsed.documentElement.getAttribute('width')||''),canvasH=view?.[3]||Number.parseFloat(parsed.documentElement.getAttribute('height')||'');
  const backdrop=[...parsed.querySelectorAll('rect')].find(r=>!r.closest('defs,clipPath')&&Number(r.getAttribute('x')||0)<=0&&Number(r.getAttribute('y')||0)<=0&&Number.parseFloat(r.getAttribute('width')||'')>=canvasW&&Number.parseFloat(r.getAttribute('height')||'')>=canvasH);
  if(backdrop)background=parse(declarations(backdrop.getAttribute('style')||'').get('fill')||backdrop.getAttribute('fill')||'')||background;
  const samples:Map<string,string>[]=[];
  for(const element of all){const values=new Map<string,string>();for(const a of element.attributes)values.set(a.name,a.value);for(const [key,value]of declarations(element.getAttribute('style')||''))values.set(key,value);samples.push(values);
    if(element.localName==='style')for(const block of (element.textContent||'').matchAll(/\{([^{}]*)}/g))samples.push(declarations(block[1]));
  }
  for(const values of samples){
    for(const key of ['fill','stroke','stop-color']){const color=parse(values.get(key)||'');if(color&&distance(color,background)>24**2){const h=hex(color);colors.set(h,(colors.get(h)||0)+1);}}
    const line=physicalPt(values.get('stroke-width')||'',unitPt);if(line&&values.get('stroke')!=='none')widths.push(line);
    const radius=physicalPt(values.get('rx')||'',unitPt);if(radius!==null)radii.push(radius*25.4/72);
    const family=values.get('font-family');if(family&&family.length<=200)fonts.add(family);
  }
  const palette=[...colors].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,6).map(x=>x[0]);if(!palette.length)throw new Error('未找到可用的显式SVG颜色。');
  const lineWidthPt=median(widths),radiusMm=median(radii),overrides:DiagramOverrides={},warnings:string[]=[];
  if(lineWidthPt!==null){if(lineWidthPt>=.1&&lineWidthPt<=12)overrides.line_width_pt=Number(lineWidthPt.toFixed(4));else warnings.push('参考线宽超出支持范围，保留当前线宽。');}
  if(radiusMm!==null){if(radiusMm>=0&&radiusMm<=20)overrides.radius_mm=Number(radiusMm.toFixed(4));else warnings.push('参考圆角超出支持范围，保留当前圆角。');}
  const known=Array.from(fonts).find(f=>/Noto Sans SC|Inter|Arial|Helvetica/i.test(f));if(known)overrides.font_family=/Noto/i.test(known)?'Noto Sans SC':/Inter/i.test(known)?'Inter, Arial, sans-serif':'Arial, Helvetica, sans-serif';else if(fonts.size)warnings.push('参考字体未内置，保留当前字体；可在属性中选择可用字体。');
  return {colors:palette,overrides,statistics:{fontFamilies:[...fonts],lineWidthPt,radiusMm},warnings};
}
export async function extractReferenceStyle(file:File):Promise<ExtractedStyle>{
  if(file.size>10*1024*1024)throw new Error('参考图片不超过10MB。');
  const bytes=new Uint8Array(await file.arrayBuffer());const svg=file.type==='image/svg+xml'||/\.svg$/i.test(file.name);if(svg)return extractSvgStyle(new TextDecoder().decode(bytes));
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpeg=bytes[0]===255&&bytes[1]===216;if(!png&&!jpeg)throw new Error('请选择PNG、JPG或SVG参考图。');
  const bitmap=await createImageBitmap(new Blob([bytes],{type:png?'image/png':'image/jpeg'}),{resizeWidth:128,resizeHeight:128,resizeQuality:'high'});
  try{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const context=canvas.getContext('2d');if(!context)throw new Error('当前浏览器无法提取参考图颜色。');context.drawImage(bitmap,0,0,128,128);return {colors:extractPalette(context.getImageData(0,0,128,128).data,128,128),overrides:{},statistics:{fontFamilies:[],lineWidthPt:null,radiusMm:null},warnings:[]};}finally{bitmap.close();}
}
