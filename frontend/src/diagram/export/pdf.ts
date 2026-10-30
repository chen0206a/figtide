import type {DiagramDoc} from "../model";
import {loadPdfFontSubset,positionPdfText} from "../../editor/pdf";

export async function diagramPdf(svgText:string,doc:DiagramDoc):Promise<Blob> {
  const parsed=new DOMParser().parseFromString(svgText,"image/svg+xml");if(parsed.querySelector("parsererror,script,image,foreignObject"))throw new Error("PDF只接受当前矢量渲染器的输出");
  const svg=parsed.documentElement as unknown as SVGSVGElement;
  const labels=[...svg.querySelectorAll("text")].map(n=>n.textContent||"").join("");
  const embedded=/[^\u0000-\u007f]/u.test(labels),family=embedded?"Noto Sans SC":"helvetica";
  const {jsPDF}=await import("jspdf");await import("svg2pdf.js");
  const width=doc.canvas.width_mm,height=doc.canvas.height_mm;
  const pdf=new jsPDF({unit:"mm",format:[width,height],orientation:width>height?"landscape":"portrait",compress:true,putOnlyUsedFonts:true});
  if(embedded){const [regular,bold,ranges]=await loadPdfFontSubset();const ignored=[9,10,13,0x200b,0x200c,0x200d,0xfeff];const missing=[...new Set([...labels].filter(c=>!ignored.includes(c.codePointAt(0)!)&&!ranges.some(([a,b])=>c.codePointAt(0)!>=a&&c.codePointAt(0)!<=b)))];if(missing.length)throw new Error(`内置PDF字体不含这些字形：${missing.join(' ')}。请替换或导出SVG。`);pdf.addFileToVFS("NotoSansSC-Regular.ttf",regular);pdf.addFont("NotoSansSC-Regular.ttf",family,"normal");pdf.addFileToVFS("NotoSansSC-Bold.ttf",bold);pdf.addFont("NotoSansSC-Bold.ttf",family,"bold");}
  svg.setAttribute("font-family",embedded?family:"helvetica, Arial, sans-serif");svg.style.fontFamily=embedded?family:"helvetica, Arial, sans-serif";
  await document.fonts.load(`400 16px "${family}"`);positionPdfText(svg,family);pdf.setFont(family,"normal");
  await pdf.svg(svg,{x:0,y:0,width,height});return pdf.output("blob");
}
