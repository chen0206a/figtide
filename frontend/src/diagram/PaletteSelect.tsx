import {palettes} from './palettes';
import type {DiagramDoc,PaletteAudit} from './model';
export const roleNames:Record<string,string>={actor:'参与者',process:'过程',data:'数据',model:'模型',output:'输出',note:'注释'};
export function usedRoles(doc?:DiagramDoc):Set<string>{return new Set(doc?.nodes.filter(n=>n.kind!=='text'&&!['phospho','number','frozen','trainable'].includes(n.glyph||'')).map(n=>n.style_ref||n.role)||[]);}
export function PaletteSelect({value,onChange,audits=[],doc}:{value?:string;onChange:(id:string)=>void;audits?:PaletteAudit[];doc?:DiagramDoc}){
  const roles=usedRoles(doc),audit=audits.find(p=>p.id===(value||'okabe-ito')&&p.preset===(doc?.style.preset||'nature-flat'));
  const pairs=audit?.failing_pairs.filter(p=>p.roles.every(r=>roles.has(r)))||[];
  return <div><label>配色<select aria-label="机制图配色" value={value||'okabe-ito'} onChange={e=>onChange(e.target.value)}>{palettes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{pairs.length>0&&<div role="status" className="tiny-note">实际使用角色的轮廓色存在色觉区分风险（ΔE 应 ≥ {audit!.threshold}）：{pairs.map(p=><p key={p.roles.join('-')}>{p.roles.map(r=>roleNames[r]).join(' / ')}：ΔE {p.minimum_delta_e.toFixed(2)}</p>)}原色值保持不变，请同时使用标签和形状区分。</div>}</div>;
}
