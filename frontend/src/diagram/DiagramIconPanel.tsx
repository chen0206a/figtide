import {useState} from 'react';
import type {DiagramCatalog,DiagramDoc,DiagramStyle} from './model';
import {iconMarkup} from './assets';
import {roleColor} from './palettes';

export function DiagramIconPanel({catalog,doc,style,onAdd}:{catalog:DiagramCatalog;doc:DiagramDoc;style:DiagramStyle;onAdd:(id:string)=>void}){
  const [query,setQuery]=useState('');const preferred=catalog.skills.find(s=>s.id===doc.meta.skill)?.icon_tags||[];
  const score=(tags:string[])=>tags.filter(tag=>preferred.includes(tag)).length;
  const icons=catalog.icons.filter(icon=>[icon.name.en,icon.name.zh,...icon.tags].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>score(b.tags)-score(a.tags)||a.name.en.localeCompare(b.name.en));
  const ink=style.id==='line-minimal'?'#0E1116':roleColor('actor',doc.style.palette).stroke;
  return <section aria-label="科研图标库"><label>搜索图标<input aria-label="搜索科研图标" value={query} onChange={e=>setQuery(e.target.value)} placeholder="中文、English、标签"/></label><p className="tiny-note">{icons.length} 个 · 按当前绘图方案推荐排序</p><div className="diagram-glyph-grid diagram-icon-grid">{icons.map(icon=><button key={icon.id} draggable title={`${icon.name.zh} · ${icon.author} · ${icon.license}`} aria-label={`插入图标 ${icon.name.zh}`} onDragStart={e=>{e.dataTransfer.setData('application/x-figtide-icon',icon.id);e.dataTransfer.effectAllowed='copy';}} onClick={()=>onAdd(icon.id)}><svg viewBox="0 0 32 24" aria-hidden="true" dangerouslySetInnerHTML={{__html:iconMarkup(icon.id,32,24,ink,'thumb-'+icon.id)}}/><span>{icon.name.zh}</span><small>{icon.license==='CC-BY-4.0'?'需署名':'CC0'}</small></button>)}</div><p className="tiny-note">图标仅为示意。CC BY 4.0图标导出时须附作者、来源、许可及修改说明。</p></section>;
}
