import {useEffect,useRef,useState} from 'react';
import {api,send} from '../lib/api';
import {Dialog} from '../components/ui/dialog';
import {Button} from '../components/ui/button';
import type {ReviewResult} from '../editor/review';
import type {DiagramOperation} from './operations';
import type {DiagramDoc,DiagramCatalog,DiagramNode} from './model';
import {renderDiagram} from './render/renderDiagram';
import {extractReferenceStyle,type ExtractedStyle} from './extractStyle';
import {roleNames} from './PaletteSelect';

type Profile={schema_version:1;kind:'diagram';style:DiagramDoc['style']};
type Saved={id:number;name:string;profile:Profile};
const roles:DiagramNode['role'][]=['actor','process','data','model','output','note'];
export function DiagramReferenceStyle({project,doc,catalog,edit,onClose}:{project:number;doc:DiagramDoc;catalog:DiagramCatalog;edit:(d:DiagramDoc)=>void;onClose:()=>void}){
  const [name,setName]=useState('参考风格'),[extracted,setExtracted]=useState<ExtractedStyle|null>(null),[roleColors,setRoleColors]=useState<DiagramDoc['style']['role_colors']>(),[saved,setSaved]=useState<Saved[]>([]),[preview,setPreview]=useState<{doc:DiagramDoc;profile:Profile;base:DiagramDoc;review:ReviewResult<DiagramOperation>}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const current=useRef(doc);current.current=doc;const epoch=useRef(0),endpoint=`/projects/${project}/diagram-style-templates`;
  async function load(){try{setSaved(await api<Saved[]>(endpoint));}catch(e){setError(e instanceof Error?e.message:'读取风格失败');}}
  useEffect(()=>{void load();return()=>{epoch.current++;};},[project]);
  useEffect(()=>{epoch.current++;setPreview(null);},[doc]);
  async function extract(file:File){const token=++epoch.current;setBusy(true);setError('');setStatus('');setPreview(null);try{const result=await extractReferenceStyle(file);if(token!==epoch.current)return;setExtracted(result);setRoleColors(Object.fromEntries(roles.map((role,i)=>[role,result.colors[i%result.colors.length]])) as Record<DiagramNode['role'],string>);setStatus('已在浏览器本地提取，参考图未上传。');}catch(e){setError(e instanceof Error?e.message:'提取失败');}finally{if(token===epoch.current)setBusy(false);}}
  async function previewStyle(profile?:Profile){if(!profile&&(!extracted||!roleColors))return;const selected=profile||{schema_version:1 as const,kind:'diagram' as const,style:{...doc.style,overrides:{...doc.style.overrides,...extracted!.overrides},role_colors:roleColors}};const token=++epoch.current;setBusy(true);setError('');try{const result=await api<{doc:DiagramDoc;review:ReviewResult<DiagramOperation>}>(`${endpoint}/preview`,send('POST',{doc,profile:selected}));if(token===epoch.current)setPreview({...result,profile:selected,base:doc});}catch(e){setError(e instanceof Error?e.message:'预览失败');}finally{if(token===epoch.current)setBusy(false);}}
  async function save(){if(!preview||!name.trim())return;setBusy(true);setError('');try{await api(endpoint,send('POST',{name:name.trim(),profile:preview.profile}));setStatus('已保存风格参数；参考图未保存、未上传。');await load();}catch(e){setError(e instanceof Error?e.message:'保存风格失败');}finally{setBusy(false);}}
  const shown=preview?.doc||doc,style=catalog.styles.find(s=>s.id===shown.style.preset)!;
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}} title="参考风格" description="请只上传你有权使用的图片；FigTide只保存颜色、线宽等参数，不保存图片。" closeDisabled={busy}>
    <label>从参考图提取<input type="file" aria-label="参考图片" accept="image/png,image/jpeg,image/svg+xml,.svg" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void extract(file);}}/></label>
    <p className="tiny-note">PNG/JPG在本地提取最多6个主色并排除背景；SVG在本地统计颜色、线宽、圆角和字体。图片内容不会进入网络请求。</p>
    {extracted&&<section aria-label="提取的风格参数"><div className="diagram-extracted-colors">{extracted.colors.map(color=><span key={color}><svg viewBox="0 0 20 12" aria-hidden="true"><rect width="20" height="12" fill={color}/></svg><small className="lf-mono">{color}</small></span>)}</div>
      <details><summary>语义角色配色与提取统计</summary>{roles.map(role=><label key={role}>{roleNames[role]}<select aria-label={`${roleNames[role]}参考颜色`} value={roleColors?.[role]} onChange={e=>{epoch.current++;setRoleColors(old=>({...old!,[role]:e.target.value}));setPreview(null);}}>{extracted.colors.map(color=><option key={color} value={color}>{color}</option>)}</select></label>)}<p className="tiny-note">线宽 {extracted.statistics.lineWidthPt?.toFixed(3)??'未指定'} pt · 圆角 {extracted.statistics.radiusMm?.toFixed(3)??'未指定'} mm · 参考字体 {extracted.statistics.fontFamilies.join('、')||'未指定'}</p>{extracted.warnings.map(w=><p className="tiny-note" key={w}>{w}</p>)}</details>
      <Button variant="outline" disabled={busy} onClick={()=>void previewStyle()}>预览提取风格</Button></section>}
    <div className="diagram-reference-preview" aria-label="参考风格预览" dangerouslySetInnerHTML={{__html:renderDiagram(shown,style,true)}}/>
    {preview&&<section aria-label="参考配色色觉检查"><h3>实际角色轮廓检查 · ΔE00 &lt; 10 提示</h3>{preview.review.issues.filter(i=>i.rule==='D3'&&i.severity==='warning').length?<details><summary>{preview.review.issues.filter(i=>i.rule==='D3'&&i.severity==='warning').length} 组角色轮廓需确认</summary>{preview.review.issues.filter(i=>i.rule==='D3'&&i.severity==='warning').map(issue=><p key={issue.id} className="tiny-note">{issue.title}：{issue.detail}</p>)}</details>:<p className="tiny-note">当前实际角色未发现低于阈值的色对。</p>}<p className="tiny-note">保留提取的原色值；ΔE00在10–20之间仅进入审稿info，不在配色区提示。</p></section>}
    {saved.length>0&&<details><summary>已保存的参考风格（{saved.length}）</summary><div className="diagram-saved-styles">{saved.map(row=><Button key={row.id} variant="ghost" disabled={busy} onClick={()=>{setName(row.name);void previewStyle(row.profile);}}>预览 {row.name}</Button>)}</div></details>}
    <label>风格名称<input aria-label="参考风格名称" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
    {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
    <div className="dialog-actions"><Button variant="outline" disabled={busy||!preview||!name.trim()} onClick={()=>void save()}>保存参考风格</Button><Button disabled={busy||!preview} onClick={()=>{if(preview&&current.current===preview.base){edit(preview.doc);onClose();}else setError('画布已变化，请重新预览。');}}>应用预览风格</Button></div>
  </Dialog>;
}
