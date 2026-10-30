import {palettes} from './palettes';
export function PaletteSelect({value,onChange,audits=[]}:{value?:string;onChange:(id:string)=>void;audits?:{id:string;safe:boolean}[]}){
  return <div><label>配色<select aria-label="机制图配色" value={value||'okabe-ito'} onChange={e=>onChange(e.target.value)}>{palettes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{audits.find(p=>p.id===(value||'okabe-ito')&&!p.safe)&&<p role="status" className="tiny-note">这套配色有两种颜色色盲读者可能分不清。原始色值保持不变，建议同时使用标签和形状区分。</p>}</div>;
}
