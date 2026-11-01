import {builtinIcons} from './builtinIcons';
import {tintColor} from './render/glyphs';
import type {DiagramDoc,DiagramIcon} from './model';

/** Shipped, sanitized vectors only; rendering never fetches a URL or interprets user paths. */
export function iconMarkup(id:string,width:number,height:number,ink:string,prefix:string):string{
  let svg=builtinIcons[id]||'';if(!svg)return '';
  const names:Record<string,string>={black:'#000000',white:'#FFFFFF',gray:'#808080',grey:'#808080',red:'#FF0000',blue:'#0000FF',green:'#008000',yellow:'#FFFF00'};
  const recolour=(raw:string)=>{let colour=names[raw.toLowerCase()]||raw;if(colour==='currentColor')return ink;if(/^#[0-9a-f]{3}$/i.test(colour))colour='#'+[...colour.slice(1)].map(c=>c+c).join('');if(!/^#[0-9a-f]{6}$/i.test(colour))return raw;const rgb=[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16));const light=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;return tintColor(ink,'#FFFFFF',light>.97?1:light*.82);};
  svg=svg.replace(/\b(fill|stroke|stop-color)="([^"<>]+)"/g,(_,key,value)=>`${key}="${recolour(value)}"`).replace(/\b(fill|stroke|stop-color):([^;"<>]+)/g,(_,key,value)=>`${key}:${recolour(value)}`);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);for(const old of ids){const next=prefix+'-'+old;svg=svg.replaceAll(`id="${old}"`,`id="${next}"`).replaceAll(`href="#${old}"`,`href="#${next}"`).replaceAll(`url(#${old})`,`url(#${next})`);}
  return svg.replace(/<svg\b([^>]*)>/,(_,attrs)=>`<svg${attrs.replace(/\s(?:width|height|x|y)="[^"]*"/g,'')} x="0" y="0" width="${width}" height="${height}" color="${ink}" preserveAspectRatio="xMidYMid meet">`);
}
export function iconAttribution(doc:DiagramDoc,icons:DiagramIcon[]):string{
  const used=new Set(doc.nodes.map(n=>n.icon).filter(Boolean));return icons.filter(i=>used.has(i.id)&&i.license==='CC-BY-4.0').map(i=>`${i.name.en} — ${i.author}; via Bioicons; CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); ${i.source_url}; modified: SVG sanitized and palette recoloured.`).join('\n');
}
