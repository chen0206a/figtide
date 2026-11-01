import {useState} from "react";
import {Dialog} from "../components/ui/dialog";
import {Button} from "../components/ui/button";
import {effectiveStyle,type DiagramDoc,type DiagramStyle} from "./model";
import {renderDiagram} from "./render/renderDiagram";
import {pngDimensions,rasterPng} from "./export/png";
import {diagramPdf} from "./export/pdf";

export function DiagramExport({doc,style,name,onClose,reviewErrors}:{doc:DiagramDoc;style:DiagramStyle;name:string;onClose:()=>void;reviewErrors?:number}) {
  const [format,setFormat]=useState("svg"),[dpi,setDpi]=useState(300),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const current=effectiveStyle(doc,style);let pixels="";try{const p=pngDimensions(doc.canvas.width_mm,doc.canvas.height_mm,dpi);pixels=`${p.width} × ${p.height} px`;}catch{}
  async function download(){setBusy(true);setError("");try{const svg=renderDiagram(doc,style),blob=format==="svg"?new Blob([svg],{type:"image/svg+xml;charset=utf-8"}):format==="png"?await rasterPng(svg,doc.canvas.width_mm,doc.canvas.height_mm,dpi):await diagramPdf(svg,doc);const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80)||'diagram')+'.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e instanceof Error?e.message:"导出失败");}finally{setBusy(false);}}
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}} title="导出机制图" description="从当前草稿生成文件，按成品物理尺寸导出。导出不会保存新版本。" closeDisabled={busy}>
    <div className="diagram-export-preview" aria-label="导出预览" dangerouslySetInnerHTML={{__html:renderDiagram(doc,style)}}/>
    <p className="tiny-note">SVG：可编辑矢量；PDF：按物理尺寸排版；PNG：300/600 dpi位图。</p>
    <p className="lf-mono">成品：{doc.canvas.width_mm} × {doc.canvas.height_mm} mm · 正文字号：{current.font_size_pt} pt</p>
    <label>格式<select aria-label="机制图导出格式" value={format} onChange={e=>setFormat(e.target.value)}><option value="svg">SVG · 矢量</option><option value="png">PNG · 位图</option><option value="pdf">PDF · 矢量</option></select></label>
    {format==="png"&&<><label>分辨率<select aria-label="PNG分辨率" value={dpi} onChange={e=>setDpi(Number(e.target.value))}><option value="300">300 dpi</option><option value="600">600 dpi</option></select></label><p className="lf-mono">{pixels}</p></>}
    {format==="pdf"&&<p className="tiny-note">英文使用Helvetica；中文等非ASCII标签使用现有内嵌Noto Sans SC子集。SVG保留所选风格字体。</p>}
    <p className="tiny-note">{reviewErrors===undefined?'尚未审稿，可先在编辑器检查文字与连线。':reviewErrors?`审稿有 ${reviewErrors} 个error，请检查；你仍可以导出。`:'最近一次审稿没有error。'}</p>
    {error&&<p role="alert">{error}</p>}<div className="dialog-actions"><Button disabled={busy} onClick={()=>void download()}>{busy?"正在导出…":"下载文件"}</Button></div>
  </Dialog>;
}
