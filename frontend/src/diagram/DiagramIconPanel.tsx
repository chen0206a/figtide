import {useIconAssets} from './useIconAssets';
import {useEffect,useRef,useState} from 'react';
import type {DiagramCatalog,DiagramDoc,DiagramStyle} from './model';
import {iconMarkup} from './assets';
import {roleColor} from './palettes';

export function DiagramIconPanel({catalog,doc,style,onAdd}:{catalog:DiagramCatalog;doc:DiagramDoc;style:DiagramStyle;onAdd:(id:string)=>void}){
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all');const preferred=catalog.skills.find(s=>s.id===doc.meta.skill)?.icon_tags||[];
  const score=(tags:string[])=>tags.filter(tag=>preferred.includes(tag)).length;
  const icons=catalog.icons.filter(icon=>(category==='all'||icon.category===category)&&[icon.name.en,icon.name.zh,...icon.tags].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>score(b.tags)-score(a.tags)||a.name.en.localeCompare(b.name.en));
  const ink=doc.style.role_colors?.actor||(style.id==='line-minimal'?'#0E1116':roleColor('actor',doc.style.palette).stroke);
  return <section aria-label="科研图标库"><label>搜索图标<input aria-label="搜索科研图标" value={query} onChange={e=>setQuery(e.target.value)} placeholder="中文、English、标签"/></label><label>图标分类<select aria-label="科研图标分类" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">全部分类</option>{[...new Set(catalog.icons.map(i=>i.category))].sort().map(c=><option key={c} value={c}>{categoryName(c)}</option>)}</select></label><p className="tiny-note">{icons.length} 个 · 按当前绘图方案推荐排序</p><div className="diagram-glyph-grid diagram-icon-grid">{icons.map(icon=><button key={icon.id} draggable title={`${icon.name.zh} · ${icon.author} · ${icon.license}`} aria-label={`插入图标 ${icon.name.zh}`} onDragStart={e=>{e.dataTransfer.setData('application/x-figtide-icon',icon.id);e.dataTransfer.effectAllowed='copy';}} onClick={()=>onAdd(icon.id)}><IconPreview id={icon.id} ink={ink}/><span>{icon.name.zh}</span><small>{categoryName(icon.category)} · {icon.license==='CC-BY-4.0'?'需署名':'CC0'}</small></button>)}</div><p className="tiny-note">图标仅为示意。CC BY 4.0图标导出时须附作者、来源、许可及修改说明。</p></section>;
}

function IconPreview({id,ink}:{id:string;ink:string}){
  const ref=useRef<SVGSVGElement>(null),[visible,setVisible]=useState(false),loaded=useIconAssets(visible?[id]:[]);
  useEffect(()=>{const el=ref.current;if(!el)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'80px'});observer.observe(el);return()=>observer.disconnect();},[id]);
  return <svg ref={ref} viewBox="0 0 32 32" aria-hidden="true" data-icon-thumbnail={id} data-icon-ready={!!loaded.assets[id]} dangerouslySetInnerHTML={{__html:iconMarkup(id,32,32,ink,'thumb-'+id,loaded.assets)}}/>;
}

export function categoryName(category:string):string{return ({Animals:'动物',Intracellular_components:'细胞器',Blood_Immunology:'血液与免疫',Lab_apparatus:'实验器具',Genetics:'遗传学',Cell_types:'细胞类型',Chemistry:'化学',Nucleic_acids:'核酸',Microbiology:'微生物',Cell_culture:'细胞培养',Genomics:'基因组',Scientific_graphs:'科学图示',General_items:'通用',Human_physiology:'生理学',Machine_Learning:'机器学习',Peptides:'多肽',Computer_hardware:'计算硬件',Molecular_modelling:'分子模型',Epigenetics:'表观遗传',Tissues:'组织',Cell_membrane:'细胞膜',Imaging:'成像',Nanotechnology:'纳米技术',Neuroscience:'神经科学',Procedures:'实验操作'} as Record<string,string>)[category]||category.replaceAll('_',' ');}
