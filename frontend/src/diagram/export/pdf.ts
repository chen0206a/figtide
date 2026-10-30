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
  // The bundled subset has regular/bold faces. svg2pdf interprets 500/600 as
  // literal face names, so normalize those weights before resolving font families.
  for(const element of [svg,...svg.querySelectorAll<SVGElement>("[font-weight]")]){
    const weight=element.getAttribute("font-weight")||"400";
    element.setAttribute("font-weight",weight==="bold"||Number(weight)>=600?"700":"400");
  }
  // Diagram zone italics are geometric shears of registered regular fonts.
  // This keeps selectable vector text and the existing chart PDF contract intact.
  for(const group of svg.querySelectorAll('[font-style="italic"]')){
    group.setAttribute("font-style","normal");
    for(const text of group.querySelectorAll("text")){
      const y=Number(text.getAttribute("y"))||0;
      text.setAttribute("transform",`${text.getAttribute("transform")||""} translate(0 ${y}) skewX(-12) translate(0 ${-y})`);
    }
  }
  await document.fonts.load(`400 16px "${family}"`);positionPdfText(svg,family);pdf.setFont(family,"normal");
  await pdf.svg(svg,{x:0,y:0,width,height});return pdf.output("blob");
}
