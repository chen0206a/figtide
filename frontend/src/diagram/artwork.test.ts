import {describe,it,expect} from 'vitest';
import {safeArtwork,artworkMarkup} from './artwork';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {DiagramDoc,DiagramArtwork} from './model';
import {readDiagramDraft,moveSelection,removeSelection,duplicateSelection,history,commit,undo} from './editing';
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#0072B2"/></linearGradient></defs><rect id="r" fill="url(#g)" width="50" height="30"/><use href="#r" x="50"/><text x="5" y="20">Synthetic &amp; local</text></svg>';
const layer=():DiagramArtwork=>({id:'artwork1',name:'Synthetic',x:2,y:2,w:80,h:40,locked:false,hidden:false,svg});
const doc=():DiagramDoc=>({...JSON.parse(readFileSync(resolve(process.cwd(),'../backend/src/test/resources/diagram-doc-v1.json'),'utf8')),artworks:[layer()]});
describe('whole SVG artwork boundary',()=>{
 it('preserves geometry and local refs while isolating every embedded ID',()=>{expect(safeArtwork(svg)).toBe(true);const markup=artworkMarkup(layer(),'isolated');expect(markup).toContain('url(#isolated-g)');expect(markup).toContain('href="#isolated-r"');expect(markup).toContain('width="80"');expect(markup).toContain('Synthetic &amp; local');});
 it('rejects active draft SVGs, external links, CSS injection and recursive use',()=>{for(const bad of ['<!DOCTYPE svg><svg/>','<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','<svg xmlns="http://www.w3.org/2000/svg" onload="x"/>','<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png,abc"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.invalid/a"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><rect style="position:fixed"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><g id="a"><use href="#a"/></g></svg>']){expect(safeArtwork(bad),bad).toBe(false);const d=doc();d.artworks![0].svg=bad;expect(readDiagramDraft({getItem:()=>JSON.stringify({doc:d,revision:1})},'draft')).toBeNull();}});
 it('moves, duplicates and undoes a whole layer but preserves locked layers',()=>{const d=doc(),ids=new Set(['artwork1']),moved=moveSelection(d,ids,3,4);expect(moved.artworks![0]).toMatchObject({x:5,y:6,svg});expect(undo(commit(history(d),moved)).present).toEqual(d);expect(duplicateSelection(d,ids).artworks).toHaveLength(2);expect(removeSelection(d,ids).artworks).toHaveLength(0);d.artworks![0].locked=true;expect(moveSelection(d,ids,5,5)).toEqual(d);expect(removeSelection(d,ids)).toEqual(d);expect(duplicateSelection(d,ids)).toEqual(d);expect(readDiagramDraft({getItem:()=>JSON.stringify({doc:d,revision:1})},'draft')?.doc).toEqual(d);});
});
