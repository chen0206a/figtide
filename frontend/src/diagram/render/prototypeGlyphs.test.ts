import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {expect,it} from 'vitest';
import {prototypeGlyph} from './prototypeGlyphs';
import {palettes,roleColor} from '../palettes';
import {tintColor} from './color';

it('ports every normative glyph path and badge coordinate without redesigning geometry',()=>{
  const source=readFileSync(resolve(process.cwd(),'../docs/development/reference/diagram-engine-sketch.js'),'utf8');
  const normative=vm.runInNewContext(source+';drawGlyph') as typeof prototypeGlyph;
  const kinds=['level','database','chart','chartlow','bulb','tokens','frames','encoder','llm','attention','text','snow','flame','protein','dimer','ligand','receptor','drug','dna','image','stack','lens','laser','cube','sample','detector','tube','cells','flask'];
  for(const kind of kinds)for(const [w,h] of [[24,18],[16,30],[3.6,3.6]]){
    const args=[kind,w,h,'#DCE9F5','#0072B2',{r:1},1] as const;
    expect(JSON.stringify(prototypeGlyph(...args))).toBe(JSON.stringify(normative(...args)));
  }
});
it('uses the exact source palette values and prescribed role mixes',()=>{
  expect(palettes).toHaveLength(6);
  expect(palettes.find(p=>p.id==='npg')).toMatchObject({a:'#3C5488',b:'#00A087',c:'#E64B35',d:'#4DBBD5',n:'#7E6148'});
  for(const p of palettes){expect(roleColor('actor',p.id)).toEqual({fill:tintColor(p.a,'#FFFFFF',.82),stroke:tintColor(p.a,'#000000',.08)});}
  expect(roleColor('actor')).toEqual(roleColor('actor','okabe-ito'));
});
