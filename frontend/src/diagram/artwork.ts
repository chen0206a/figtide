import type {DiagramArtwork} from './model';

const elements=new Set('svg g defs path rect circle ellipse line polyline polygon text tspan textPath linearGradient radialGradient stop clipPath use title desc'.split(' '));
const attributes=new Set('id x y x1 y1 x2 y2 cx cy r rx ry width height viewBox preserveAspectRatio d points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset fill-rule clip-rule fill-opacity stroke-opacity opacity transform font-family font-size font-weight font-style text-anchor dominant-baseline letter-spacing word-spacing textLength lengthAdjust dx dy rotate offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod fx fy fr clipPathUnits clip-path href style'.split(' '));
/** Defense for untrusted local drafts, in addition to the authoritative server sanitizer. */
export function safeArtwork(svg:unknown):svg is string {
  if(typeof svg!=='string'||svg.length>2*1024*1024||/<!|<\?|\\|javascript:|data:|@import|expression\s*\(|var\s*\(/i.test(svg))return false;
  const parsed=new DOMParser().parseFromString(svg,'image/svg+xml'),root=parsed.documentElement;
  if(root.localName!=='svg'||parsed.querySelector('parsererror'))return false;
  const all=[root,...root.querySelectorAll('*')];if(all.length>20000)return false;
  const ids=new Map<string,Element>(),refs=new Map<Element,string[]>();
  for(const el of all){
    if(!elements.has(el.localName)||el.namespaceURI!=='http://www.w3.org/2000/svg')return false;
    let depth=0;for(let p:Element|null=el;p;p=p.parentElement)if(++depth>64)return false;
    if(el.id){if(!/^[A-Za-z_][\w.:-]{0,127}$/.test(el.id)||ids.has(el.id))return false;ids.set(el.id,el);}
    for(const attr of Array.from(el.attributes)){
      if(attr.name==='xmlns'||attr.name==='xml:space')continue;
      if(!attributes.has(attr.name)||/:\/\/|\/\//.test(attr.value))return false;
      if(attr.name==='href'&&!/^#[A-Za-z_][\w.:-]{0,127}$/.test(attr.value))return false;
      if(attr.name==='style'&&attr.value.split(';').some(p=>p.trim()&&!/^(?:fill|stroke|stop-color|stop-opacity|clip-path|opacity|font-family|font-size|font-weight|font-style|text-anchor|dominant-baseline|letter-spacing|word-spacing|fill-rule|clip-rule|fill-opacity|stroke-opacity|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit|stroke-dasharray|stroke-dashoffset):[^{}<>]*$/.test(p.trim())))return false;
      if(/url\s*\(/i.test(attr.value)&&attr.value.replace(/url\(#[A-Za-z_][\w.:-]{0,127}\)/g,'').match(/url\s*\(/i))return false;
      const list=refs.get(el)||[];if(attr.name==='href')list.push(attr.value.slice(1));for(const m of attr.value.matchAll(/url\(#([^)]*)\)/g))list.push(m[1]);refs.set(el,list);
    }
  }
  // References may not form cycles through a containing group, defs or gradients.
  const graph=new Map<string,Set<string>>();for(const [el,list] of refs)for(let p:Element|null=el;p;p=p.parentElement)if(p.id){const set=graph.get(p.id)||new Set<string>();for(const id of list){if(!ids.has(id))return false;set.add(id);}graph.set(p.id,set);}
  const done=new Set<string>();const visit=(id:string,active:Set<string>,depth:number):boolean=>{if(depth>64||active.has(id))return false;if(done.has(id))return true;active.add(id);for(const ref of graph.get(id)||[])if(!visit(ref,active,depth+1))return false;active.delete(id);done.add(id);return true;};
  for(const id of graph.keys())if(!visit(id,new Set(),0))return false;
  return true;
}
export function artworkMarkup(layer:DiagramArtwork,prefix:string):string {
  if(!safeArtwork(layer.svg))return '';
  const root=new DOMParser().parseFromString(layer.svg,'image/svg+xml').documentElement;
  for(const el of [root,...root.querySelectorAll('*')])for(const attr of Array.from(el.attributes)){
    if(attr.name==='id')el.setAttribute('id',prefix+'-'+attr.value);
    else if(attr.name==='href')el.setAttribute('href','#'+prefix+'-'+attr.value.slice(1));
    else if(attr.value.includes('url(#'))el.setAttribute(attr.name,attr.value.replace(/url\(#([^)]*)\)/g,`url(#${prefix}-$1)`));
  }
  root.setAttribute('x',String(layer.x));root.setAttribute('y',String(layer.y));root.setAttribute('width',String(layer.w));root.setAttribute('height',String(layer.h));
  root.setAttribute('preserveAspectRatio','xMidYMid meet');
  return new XMLSerializer().serializeToString(root);
}
