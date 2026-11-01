import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {builtinIcons} from './builtinIcons';
import {iconMarkup,iconAttribution} from './assets';
import {renderDiagram} from './render/renderDiagram';
import type {DiagramDoc,DiagramIcon,DiagramStyle} from './model';
const base=resolve(process.cwd(),'../backend/src/main/resources/diagram');
const icons=JSON.parse(readFileSync(resolve(base,'icons/manifest.json'),'utf8')) as DiagramIcon[];
it('uses exactly the 150 sanitized source vectors and recolours without external references',()=>{
  expect(Object.keys(builtinIcons)).toHaveLength(150);
  for(const icon of icons){expect(builtinIcons[icon.id]).toBe(readFileSync(resolve(base,`icons/${icon.id}.svg`),'utf8'));const markup=iconMarkup(icon.id,30,24,'#0072B2','one');const parsed=new DOMParser().parseFromString(markup,'image/svg+xml');expect(parsed.querySelector('parsererror')).toBeNull();expect(parsed.querySelector('image,script,foreignObject,style')).toBeNull();for(const use of parsed.querySelectorAll('[href]'))expect(use.getAttribute('href')).toMatch(/^#one-/);}
});
it('renders icons identically in exports and computes deduplicated CC BY credit',()=>{
  const doc=JSON.parse(readFileSync(resolve(base,'templates/workflow.json'),'utf8')).documents.en as DiagramDoc,style=JSON.parse(readFileSync(resolve(base,'styles/nature-flat.json'),'utf8')) as DiagramStyle;
  const icon=icons.find(i=>i.license==='CC-BY-4.0')!;doc.nodes[0]={...doc.nodes[0],kind:'icon',icon:icon.id,label:'Synthetic icon'};delete doc.nodes[0].glyph;doc.nodes[1]={...doc.nodes[1],kind:'icon',icon:icon.id};delete doc.nodes[1].glyph;
  const attribution=iconAttribution(doc,icons);expect(attribution.split('\n')).toHaveLength(1);expect(attribution).toContain(icon.author);expect(attribution).toContain('CC BY 4.0');expect(attribution).toContain('modified');
  const svg=renderDiagram(doc,style),parsed=new DOMParser().parseFromString(svg,'image/svg+xml');expect(parsed.querySelector('parsererror')).toBeNull();expect(parsed.querySelectorAll('[data-scientific-icon]')).toHaveLength(2);const ids=[...parsed.querySelectorAll('[id]')].map(e=>e.id);expect(new Set(ids).size).toBe(ids.length);
});
