import {expect,it} from 'vitest';
import {collectRenderFacts,sampleEvenly} from './renderFacts';
it('samples deterministically with both endpoints',()=>{
  const values=Array.from({length:1000},(_,i)=>i);
  expect(sampleEvenly(values,200)).toEqual(sampleEvenly(values,200));
  expect(sampleEvenly(values,200)).toHaveLength(200);
  expect(sampleEvenly(values,200).at(-1)).toBe(999);
});
it('captures recognizable synthetic chart geometry without text, filenames, field names or data values',()=>{
  const graph=document.createElement('div');
  graph.innerHTML='<svg><text class="gtitle" style="font-size:14px">PRIVATE_TITLE_SECRET</text><g class="legend"><text class="legendtext" style="font-size:12px">private-category</text></g><g class="scatterlayer"><g class="trace"><path class="point" data-value="987654321"/></g></g></svg>';
  (graph as any).data=[{name:'SECRET_FIELD',x:[987654321],y:[123456789],customdata:['secret.csv']}];
  const rect={left:10,top:10,right:110,bottom:60,x:10,y:10,width:100,height:50,toJSON:()=>({})};
  graph.getBoundingClientRect=()=>({...rect,left:0,top:0,width:760,height:500});
  graph.querySelectorAll('*').forEach(node=>{node.getBoundingClientRect=()=>rect});
  const facts=collectRenderFacts(graph,760,500)!;
  expect(facts.texts).toHaveLength(2);expect(facts.points).toHaveLength(1);
  const serialized=JSON.stringify(facts);
  for(const secret of ['PRIVATE_TITLE_SECRET','private-category','SECRET_FIELD','secret.csv','987654321','123456789','data-value'])expect(serialized).not.toContain(secret);
  expect(collectRenderFacts(graph,760,500)).toEqual(facts);
});
