import type {DiagramDoc} from './model';
import type {DiagramOperation} from './operations';
import type {ReviewResult,ReviewIssue} from '../editor/review';
export type Fact={text:string;quote:string};
export type FactBinding={field:'nodes'|'edges'|'zones'|'annotations';id:string;facts:number[];before:any;index:number};
export type DiagramAgentProposal={doc:DiagramDoc;config?:DiagramDoc;facts?:Fact[];fact_bindings?:FactBinding[];selected_facts?:number[];review:ReviewResult<DiagramOperation>;changes:{path:string}[]};
export type LabelChoice={node_id:string;action:'keep'|'source';label?:string};
export function d8Source(proposal:DiagramAgentProposal,filtered:DiagramDoc,issue:ReviewIssue<DiagramOperation>){
  if(issue.rule!=='D8'||issue.anchor.kind!=='node')return null;
  const node=proposal.doc.nodes[Number(issue.anchor.ref)];if(!node||!filtered.nodes.some(n=>n.id===node.id&&n.label===node.label))return null;
  const binding=proposal.fact_bindings?.find(b=>b.field==='nodes'&&b.id===node.id),selected=new Set(filtered.meta.fact_sources?.map(f=>f.quote));
  const facts=binding&&proposal.facts?binding.facts.map(i=>proposal.facts![i]).filter(f=>f&&selected.has(f.quote)):filtered.meta.fact_sources||[];
  const quotes=[...new Set(facts.map(f=>f.quote))];if(!quotes.length&&filtered.meta.source_text)quotes.push(filtered.meta.source_text);
  return {node_id:node.id,label:node.label,quotes};
}
export function labelOperations(doc:DiagramDoc,choices:LabelChoice[]):DiagramOperation[]{
  return choices.filter(c=>c.action==='source'&&doc.nodes.some(n=>n.id===c.node_id)).map(c=>({tool:'update_node',arguments:{id:c.node_id,label:c.label}}));
}

/** Mirrors the server-owned exclusion contract; the server repeats it at confirmation. */
export function selectProposalFacts(proposal:DiagramAgentProposal,chosen:Set<number>):DiagramDoc{
  const doc=structuredClone(proposal.doc);if(!proposal.facts)return doc;
  for(const field of ['zones','nodes','edges','annotations'] as const){
    const disabled=(proposal.fact_bindings||[]).filter(b=>b.field===field&&b.facts.length&&!b.facts.some(i=>chosen.has(i))),byId=new Map(disabled.map(b=>[b.id,b]));
    const items:any[]=doc[field].flatMap(item=>{const b=byId.get(item.id);return b?b.before?[structuredClone(b.before)]:[]:[item];});
    for(const b of disabled.filter(b=>b.before&&!items.some(n=>n.id===b.id)).sort((a,b)=>a.index-b.index))items.splice(Math.min(items.length,b.index),0,structuredClone(b.before));
    (doc[field] as any[])=items;
  }
  const nodes=new Set(doc.nodes.map(n=>n.id)),zones=new Set(doc.zones.map(z=>z.id));
  doc.nodes.forEach(n=>{if(n.zone&&!zones.has(n.zone))n.zone=null;});doc.zones.forEach(z=>{if(z.zoom_of&&!zones.has(z.zoom_of)&&!nodes.has(z.zoom_of))z.zoom_of=null;});
  doc.edges=doc.edges.filter(e=>nodes.has(e.from)&&nodes.has(e.to));doc.annotations=doc.annotations.filter(a=>nodes.has(a.target)||zones.has(a.target));
  doc.meta.fact_sources=proposal.facts.filter((_,i)=>chosen.has(i));doc.meta.facts=doc.meta.fact_sources.map(f=>f.text);if(doc.meta.ai_labels)doc.meta.ai_labels=doc.meta.ai_labels.filter(l=>nodes.has(l.id));return doc;
}
export function applicableOperation(doc:DiagramDoc,op:DiagramOperation):boolean{
  const field=op.tool.endsWith('node')?'nodes':op.tool.endsWith('edge')?'edges':op.tool.endsWith('zone')?'zones':null;
  return !field||op.tool.startsWith('add_')||doc[field].some(n=>n.id===op.arguments.id);
}
export type StructureItem={id:string;field:'nodes'|'edges'|'zones';text:string;number:number;removed:boolean};
export function structureItems(before:DiagramDoc,after:DiagramDoc):StructureItem[]{
  const out:StructureItem[]=[];const label=(id:string)=>after.nodes.find(n=>n.id===id)?.label||before.nodes.find(n=>n.id===id)?.label||id;
  for(const field of ['zones','nodes','edges'] as const){
    const old=new Map(before[field].map(n=>[n.id,n]));
    for(const n of after[field]){const prior=old.get(n.id),semantic=(item:any)=>Object.fromEntries(Object.entries(item).filter(([k])=>!['x','y','w','h'].includes(k)));
      if(prior&&JSON.stringify(semantic(prior))===JSON.stringify(semantic(n)))continue;
      const detail=field==='edges'?`${label((n as any).from)} → ${label((n as any).to)}（${({flow:'流程',activate:'激活',inhibit:'抑制',transport:'转运',bind:'结合',indirect:'间接作用'} as any)[n.kind]}）`:(n as any).label||n.id;
      out.push({id:n.id,field,text:`${prior?'修改':'新增'}${field==='nodes'?'节点':field==='edges'?'连线':'分区'}：${detail}`,number:out.length+1,removed:false});
    }
    for(const n of before[field])if(!after[field].some(a=>a.id===n.id))out.push({id:n.id,field,text:`移除${field==='nodes'?'节点':field==='edges'?'连线':'分区'}：${(n as any).label||n.id}`,number:out.length+1,removed:true});
  }return out;
}
