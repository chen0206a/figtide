import {useState} from "react";
import type { DiagramDoc } from "./model";
type Props={doc:DiagramDoc;selected:Set<string>;journals?:{id:string;name:string;single_column_mm:number|null;double_column_mm:number|null}[];edit:(fn:(d:DiagramDoc)=>DiagramDoc)=>void};
const nodeKinds={icon:"科研图标",box:"矩形",pill:"胶囊",ellipse:"椭圆",glyph:"科学图元",text:"文字"};
const roles={actor:"参与者",process:"过程",data:"数据",model:"模型",output:"输出",note:"说明"};
export const zoneKinds={compartment:"分区",membrane:"膜",nucleus:"细胞核",panel:"面板",zoom:"放大框"};
export const edgeKinds={flow:"普通流程 →",activate:"激活 →",inhibit:"抑制 ⊣",transport:"转运",bind:"结合",indirect:"间接作用 ⇢"};
export function DiagramProperties({doc,selected,edit,journals=[]}:Props) {
  const [journal,setJournal]=useState("default");
  const id=[...selected][0],node=doc.nodes.find(n=>n.id===id),zone=doc.zones.find(n=>n.id===id),edge=doc.edges.find(n=>n.id===id),annotation=doc.annotations.find(n=>n.id===id);
  const type=node?"nodes":zone?"zones":edge?"edges":"annotations",element=node||zone||edge||annotation;
  const change=(key:string,value:unknown)=>edit(d=>{const target=d[type].find(n=>n.id===id);if(target)Object.assign(target,{[key]:value});return d;});
  const options=(values:Record<string,string>)=>Object.entries(values).map(([key,label])=><option value={key} key={key}>{label}</option>);
  return <aside className="diagram-properties" aria-label="机制图属性">
    <h2>{element?"选中元素":"画布属性"}</h2>
    {selected.size>1&&<p className="tiny-note">已选 {selected.size} 项，下面修改第一项。</p>}
    {element&&<p className="lf-mono">{element.id}</p>}
    {(node||zone)&&<>
      <label>{node?"节点文字":"分区文字"}<textarea aria-label={node?"节点文字":"分区文字"} maxLength={200} value={(node||zone)!.label} onChange={e=>change("label",e.target.value)}/></label>
      <label>类型<select aria-label={node?"节点类型":"分区类型"} value={(node||zone)!.kind} onChange={e=>edit(d=>{const item=d[type].find(n=>n.id===id)!;Object.assign(item,{kind:e.target.value});if(type==="nodes"){const n=item as DiagramDoc["nodes"][number];if(n.kind==="glyph")n.glyph=n.glyph||"protein";else delete n.glyph;if(n.kind!=="icon")n.icon=null;}return d;})}>{options(node?node.kind==="icon"?nodeKinds:Object.fromEntries(Object.entries(nodeKinds).filter(([key])=>key!=="icon")):zoneKinds)}</select></label>
      <div className="diagram-number-fields">{(["x","y","w","h"] as const).map(key=><label key={key}>{({x:"X",y:"Y",w:"宽",h:"高"})[key]}（mm）<input type="number" step="1" aria-label={`${({x:"X",y:"Y",w:"宽",h:"高"})[key]}（mm）`} value={(node||zone)![key]} onChange={e=>change(key,Number(e.target.value))}/></label>)}</div>
    </>}
    {node&&<><label>语义角色<select aria-label="语义角色" value={node.role} onChange={e=>change("role",e.target.value)}>{options(roles)}</select></label>
      <label>配色<select aria-label="图元配色" value={node.style_ref||""} onChange={e=>change("style_ref",e.target.value||null)}><option value="">跟随语义角色</option><option value="actor">蓝色</option><option value="process">绿色</option><option value="note">强调色</option></select></label>
      <label>标签位置<select aria-label="标签位置" value={node.label_pos||"center"} onChange={e=>change("label_pos",e.target.value)}><option value="center">居中</option><option value="below">下方</option><option value="above">上方</option><option value="left">左侧</option><option value="right">右侧</option></select></label>
      {node.kind==="glyph"&&<label><input type="checkbox" checked={!!node.boxed} onChange={e=>change("boxed",e.target.checked)}/>方框内图元</label>}
      <details><summary>标记与编号</summary><fieldset><legend>标记</legend>{([['phospho','磷酸化 P'],['frozen','冻结'],['trainable','可训练']] as const).map(([badge,label])=><label key={badge}><input type="checkbox" checked={node.badges?.includes(badge)||false} onChange={e=>change("badges",e.target.checked?[...(node.badges||[]),badge]:(node.badges||[]).filter(b=>b!==badge))}/>{label}</label>)}<label>数字编号<input aria-label="数字编号" type="number" min="1" max="99" value={node.badges?.find(b=>b.startsWith('number:'))?.slice(7)||""} onChange={e=>change("badges",[...(node.badges||[]).filter(b=>!b.startsWith('number:')),...(Number(e.target.value)>=1&&Number(e.target.value)<=99?[`number:${Number(e.target.value)}`]:[])])}/></label></fieldset></details>
      <label>所在分区<select aria-label="所在分区" value={node.zone||""} onChange={e=>edit(d=>{const n=d.nodes.find(n=>n.id===id)!;n.zone=e.target.value||null;const z=d.zones.find(z=>z.id===n.zone);if(z){n.w=Math.min(n.w,z.w-4);n.h=Math.min(n.h,z.h-6);n.x=z.x+2;n.y=z.y+4;}return d;})}><option value="">无分区</option>{doc.zones.map(z=><option key={z.id} value={z.id}>{z.label||z.id}</option>)}</select></label></>}
    {zone?.kind==="zoom"&&<label>放大来源<select value={zone.zoom_of||""} onChange={e=>change("zoom_of",e.target.value||null)}><option value="">无</option>{[...doc.zones,...doc.nodes].filter(z=>z.id!==zone.id).map(z=><option key={z.id} value={z.id}>{z.label||z.id}</option>)}</select></label>}
    {edge&&<>
      <label>连线文字<input aria-label="连线文字" maxLength={200} value={edge.label} onChange={e=>change("label",e.target.value)}/></label>
      <label>连线类型<select aria-label="连线类型" value={edge.kind} onChange={e=>change("kind",e.target.value)}>{options(edgeKinds)}</select></label>
      {(["from","to"] as const).map(k=><label key={k}>{k==="from"?"起点":"终点"}<select aria-label={k==="from"?"连线起点":"连线终点"} value={edge[k]} onChange={e=>change(k,e.target.value)}>{doc.nodes.map(n=><option key={n.id} value={n.id}>{n.label||n.id}</option>)}</select></label>)}
      <label>走线方式<select aria-label="走线方式" value={edge.route} onChange={e=>change("route",e.target.value)}><option value="straight">直线</option><option value="orthogonal">直角</option><option value="curved">曲线</option></select></label>
    </>}
    {annotation&&<label>注释文字<input aria-label="注释文字" maxLength={200} value={annotation.text} onChange={e=>change("text",e.target.value)}/></label>}
    {!element&&<>
      <div className="diagram-number-fields">{(["width_mm","height_mm"] as const).map(k=><label key={k}>{k==="width_mm"?"成品宽（mm）":"成品高（mm）"}<input type="number" min="10" max="2000" value={doc.canvas[k]} onChange={e=>edit(d=>{d.canvas[k]=Number(e.target.value);return d;})}/></label>)}</div>
      <label>画布背景<input type="color" value={doc.canvas.background} onChange={e=>edit(d=>{d.canvas.background=e.target.value;return d;})}/></label>
      <label>期刊尺寸参考<select aria-label="画布期刊参考" value={journal} onChange={e=>setJournal(e.target.value)}>{journals.map(j=><option key={j.id} value={j.id}>{j.name}</option>)}</select></label>
      <p className="tiny-note">单栏 {journals.find(j=>j.id===journal)?.single_column_mm||88} mm · 双栏 {journals.find(j=>j.id===journal)?.double_column_mm||180} mm；参考值不自动改变现有内容。</p>
      <label>字号（pt）<input aria-label="画布字号" type="number" min="1" max="72" step=".5" value={doc.style.overrides.font_size_pt??7} onChange={e=>edit(d=>{d.style.overrides.font_size_pt=Number(e.target.value);return d;})}/></label>
      <label>标签语言<select aria-label="画布标签语言" value={doc.label_language} onChange={e=>edit(d=>{d.label_language=e.target.value as "en"|"zh";return d;})}><option value="en">English</option><option value="zh">中文</option></select></label>
      <p className="tiny-note">语言设置不会自动翻译现有文字。</p>
      <p className="tiny-note">所有位置和字号以成品物理尺寸计算。选择元素后编辑属性。</p>
    </>}
    <label><input type="checkbox" checked={doc.meta.include_icon_attribution!==false} onChange={e=>edit(d=>{d.meta.include_icon_attribution=e.target.checked;return d;})}/>导出时附图标署名</label>
    <label><input type="checkbox" checked={doc.legend.mode==="auto"} onChange={e=>edit(d=>{d.legend.mode=e.target.checked?"auto":"off";return d;})}/>自动图例（两种以上连线时显示）</label>

  </aside>;
}
export {nodeKinds};
