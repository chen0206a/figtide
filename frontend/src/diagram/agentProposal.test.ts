import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {DiagramDoc} from './model';
import {selectProposalFacts,structureItems,type DiagramAgentProposal} from './agentProposal';
import {diagramReviewMarker} from './reviewMarkers';
const doc=()=>JSON.parse(readFileSync(resolve(process.cwd(),'../backend/src/test/resources/diagram-doc-v1.json'),'utf8')) as DiagramDoc;
it('drops only excluded new nodes/edges, restores owned old edits, keeps shared nodes, and can reselect',()=>{
 const before=doc();before.zones=[];before.nodes=before.nodes.slice(0,1).map(n=>({...n,zone:null,label:'Original'}));before.edges=[];const after=structuredClone(before);after.nodes[0].label='RNA';after.nodes.push({...after.nodes[0],id:'library',label:'Library'},{...after.nodes[0],id:'control',label:'Control'});after.edges=[{id:'flow',from:after.nodes[0].id,to:'library',kind:'flow',label:'',route:'straight'},{id:'inhibition',from:'control',to:'library',kind:'inhibit',label:'',route:'straight'}];
 const proposal={doc:after,facts:[{text:'RNA enters Library',quote:'RNA enters Library'},{text:'Control inhibits Library',quote:'Control inhibits Library'}],fact_bindings:[{field:'nodes',id:after.nodes[0].id,facts:[0],before:before.nodes[0],index:0},{field:'nodes',id:'library',facts:[0,1],before:null,index:1},{field:'nodes',id:'control',facts:[1],before:null,index:2},{field:'edges',id:'flow',facts:[0],before:null,index:0},{field:'edges',id:'inhibition',facts:[1],before:null,index:0}]} as DiagramAgentProposal;
 const zero=selectProposalFacts(proposal,new Set([0]));expect(zero.nodes.map(n=>n.label)).toEqual(['RNA','Library']);expect(zero.edges.map(e=>e.id)).toEqual(['flow']);expect(zero.meta.facts).toEqual(['RNA enters Library']);const one=selectProposalFacts(proposal,new Set([1]));expect(one.nodes[0].label).toBe('Original');expect(one.edges.map(e=>e.id)).toEqual(['inhibition']);expect(selectProposalFacts(proposal,new Set()).nodes).toEqual(before.nodes);expect(selectProposalFacts(proposal,new Set([0,1])).nodes).toEqual(after.nodes);expect(proposal.doc.nodes).toHaveLength(3);
 expect(structureItems(before,zero).map(i=>i.text)).toEqual(expect.arrayContaining(['修改节点：RNA','新增节点：Library','新增连线：RNA → Library（流程）']));
});
it('places full-diagram review badges in distinct spaced positions',()=>{
 const d=doc();const points=Array.from({length:12},(_,i)=>diagramReviewMarker(d,{anchor:{kind:'canvas',ref:0}} as any,i+1,i));
 expect(new Set(points.map(p=>`${p.x},${p.y}`)).size).toBe(12);for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)expect(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)).toBeGreaterThanOrEqual(32);
});
