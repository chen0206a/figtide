import {diagramDrawio} from "./export/drawio";
import {iconAttribution} from "./assets";
import {useState} from "react";
import {Dialog} from "../components/ui/dialog";
import {Button} from "../components/ui/button";
import {effectiveStyle,type DiagramDoc,type DiagramStyle,type DiagramIcon} from "./model";
import {renderDiagram} from "./render/renderDiagram";
import {pngDimensions,rasterPng} from "./export/png";
import {diagramPdf} from "./export/pdf";

export function DiagramExport({doc,style,name,onClose,reviewErrors,icons=[]}:{doc:DiagramDoc;style:DiagramStyle;name:string;onClose:()=>void;reviewErrors?:number;icons?:DiagramIcon[]}) {
  const [format,setFormat]=useState("svg"),[dpi,setDpi]=useState(300),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const attribution=iconAttribution(doc,icons),[includeAttribution,setIncludeAttribution]=useState(doc.meta.include_icon_attribution!==false),[attributionMode,setAttributionMode]=useState("file"),[copied,setCopied]=useState(false);
  const current=effectiveStyle(doc,style);let pixels="";try{const p=pngDimensions(doc.canvas.width_mm,doc.canvas.height_mm,dpi);pixels=`${p.width} × ${p.height} px`;}catch{}
  async function download(){setBusy(true);setError("");try{if(attribution&&includeAttribution&&attributionMode==="caption"&&!copied)throw new Error("请先复制图标署名到图注，再下载文件。");const svg=renderDiagram(doc,style),blob=format==="drawio"?new Blob([diagramDrawio(doc,style,name)],{type:"application/xml;charset=utf-8"}):format==="svg"?new Blob([svg],{type:"image/svg+xml;charset=utf-8"}):format==="png"?await rasterPng(svg,doc.canvas.width_mm,doc.canvas.height_mm,dpi):await diagramPdf(svg,doc);const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80)||'diagram')+'.'+format;link.click();if(attribution&&includeAttribution&&attributionMode==="file"){const credits=URL.createObjectURL(new Blob([attribution+'\n'],{type:'text/plain;charset=utf-8'})),creditLink=document.createElement('a');creditLink.href=credits;creditLink.download=(name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80)||'diagram')+'-attribution.txt';creditLink.click();setTimeout(()=>URL.revokeObjectURL(credits),1000);}setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e instanceof Error?e.message:"导出失败");}finally{setBusy(false);}}
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}} title="导出机制图" description="从当前草稿生成文件，按成品物理尺寸导出。导出不会保存新版本。" closeDisabled={busy}>
    <div className="diagram-export-preview" aria-label="导出预览" dangerouslySetInnerHTML={{__html:renderDiagram(doc,style)}}/>
    <p className="tiny-note">SVG：可编辑矢量；PDF：按物理尺寸排版；PNG：300/600 dpi位图；draw.io：分区、节点、连线和标签可编辑。</p>
    <p className="lf-mono">成品：{doc.canvas.width_mm} × {doc.canvas.height_mm} mm · 正文字号：{current.font_size_pt} pt</p>
    <label>格式<select aria-label="机制图导出格式" value={format} onChange={e=>setFormat(e.target.value)}><option value="svg">SVG · 矢量</option><option value="png">PNG · 位图</option><option value="pdf">PDF · 矢量</option><option value="drawio">draw.io · 可编辑结构</option></select></label>
    {format==="png"&&<><label>分辨率<select aria-label="PNG分辨率" value={dpi} onChange={e=>setDpi(Number(e.target.value))}><option value="300">300 dpi</option><option value="600">600 dpi</option></select></label><p className="lf-mono">{pixels}</p></>}
    {format==="pdf"&&<p className="tiny-note">英文使用Helvetica；中文等非ASCII标签使用现有内嵌Noto Sans SC子集。SVG保留所选风格字体。</p>}
    <p className="tiny-note">{reviewErrors===undefined?'尚未审稿，可先在编辑器检查文字与连线。':reviewErrors?`审稿有 ${reviewErrors} 个error，请检查；你仍可以导出。`:'最近一次审稿没有error。'}</p>
    {attribution&&<section aria-label="图标署名"><label><input type="checkbox" checked={includeAttribution} onChange={e=>setIncludeAttribution(e.target.checked)}/>附加图标署名</label>{includeAttribution?<><label>署名方式<select aria-label="图标署名方式" value={attributionMode} onChange={e=>{setAttributionMode(e.target.value);setCopied(false);}}><option value="file">随图另存为TXT</option><option value="caption">复制到论文图注</option></select></label><textarea aria-label="图标署名文本" readOnly value={attribution}/>{attributionMode==="caption"&&<Button variant="outline" onClick={()=>void navigator.clipboard.writeText(attribution).then(()=>setCopied(true)).catch(()=>setError("复制失败，请手动复制署名文本。"))}>{copied?"已复制署名":"复制署名"}</Button>}</>:<p role="alert">D9：当前导出不附署名；这些CC BY 4.0图标仍要求标明作者、来源、许可和修改说明。</p>}</section>}
    {error&&<p role="alert">{error}</p>}<div className="dialog-actions"><Button disabled={busy} onClick={()=>void download()}>{busy?"正在导出…":"下载文件"}</Button></div>
  </Dialog>;
}
