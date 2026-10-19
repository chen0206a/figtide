import type { Config } from "./model";
import { publicationMetrics } from "./publication";
const FONT = "Noto Sans SC";
let fonts: Promise<[string, string, number[][]]> | undefined;
async function fontData(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("无法读取本地 PDF 字体");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("无法加载 PDF 字体"));
    r.readAsDataURL(blob);
  });
}
function loadFonts() {
  if (!fonts)
    fonts = Promise.all([
      fontData("/fonts/NotoSansSC-Regular.ttf"),
      fontData("/fonts/NotoSansSC-Bold.ttf"),
      fetch("/fonts/noto-glyphs.json").then((r) => {
        if (!r.ok) throw new Error("字体字形索引读取失败");
        return r.json() as Promise<number[][]>;
      }),
    ]).catch((e) => {
      fonts = undefined;
      throw e;
    });
  return fonts;
}
export async function vectorPdf(url: string, c: Config): Promise<Blob> {
  if (c.style.font !== FONT)
    throw new Error("请先将画布字体切换为 Noto Sans SC，预览后再导出 PDF");
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");
  const [regular, bold, ranges] = await loadFonts();
  const svgText = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror,script,image,foreignObject"))
    throw new Error("PDF 仅接受当前绘图器的矢量 SVG");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  const missing = new Set<string>();
  for (const text of svg.querySelectorAll("text"))
    for (const char of text.textContent || "") {
      const code = char.codePointAt(0)!;
      if (
        ![9, 10, 13, 0x200b, 0x200c, 0x200d, 0xfeff].includes(code) &&
        !ranges.some(([start, end]) => code >= start && code <= end)
      )
        missing.add(char);
    }
  if (missing.size)
    throw new Error(
      `内置 PDF 字体不含这些字形：${[...missing].join(" ")}。请替换字符或导出 SVG。`,
    );
  const m = publicationMetrics(c);
  const width = m.enabled ? (m.widthMm * 72) / 25.4 : c.style.width * 0.75;
  const height = m.enabled ? (m.heightMm * 72) / 25.4 : c.style.height * 0.75;
  svg.setAttribute("width", String(c.style.width));
  svg.setAttribute("height", String(c.style.height));
  svg.setAttribute("viewBox", `0 0 ${c.style.width} ${c.style.height}`);
  await document.fonts.load(`400 28px "${FONT}"`);
  await document.fonts.load(`700 28px "${FONT}"`);
  positionText(svg);
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "pt",
    format: [width, height],
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.addFileToVFS("NotoSansSC-Regular.ttf", regular);
  pdf.addFont("NotoSansSC-Regular.ttf", FONT, "normal");
  pdf.addFileToVFS("NotoSansSC-Bold.ttf", bold);
  pdf.addFont("NotoSansSC-Bold.ttf", FONT, "bold");
  pdf.setFont(FONT, "normal");
  await pdf.svg(svg, { x: 0, y: 0, width, height });
  return pdf.output("blob");
}

/** Freeze browser-resolved glyph run origins before conversion. svg2pdf's hidden
 * text measurer can retain a stale size under modal/inert styling in Chrome.
 * Explicit run positions also preserve multiline labels, superscripts and rotation. */
function positionText(svg: SVGSVGElement) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none";
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    for (const original of [...svg.querySelectorAll("text")]) {
      const value = original.textContent || "";
      if (!value) continue;
      if (original.getNumberOfChars() !== value.length)
        throw new Error(
          "PDF 无法保持此富文本的字符位置，请使用普通文本或导出 SVG",
        );
      const replacement = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      );
      for (const key of ["transform", "opacity", "clip-path"])
        if (original.hasAttribute(key))
          replacement.setAttribute(key, original.getAttribute(key)!);
      if (original.style.opacity)
        replacement.style.opacity = original.style.opacity;
      const walker = document.createTreeWalker(original, NodeFilter.SHOW_TEXT);
      let node: Node | null,
        offset = 0;
      while ((node = walker.nextNode())) {
        const text = node.textContent || "";
        if (!text) continue;
        const style = getComputedStyle(node.parentElement!);
        if (!style.fontFamily.includes(FONT))
          throw new Error(
            "PDF 富文本需使用内置 Noto Sans SC 字体，请统一字体后重试或导出 SVG",
          );
        if (style.fontStyle !== "normal")
          throw new Error(
            "PDF 首版支持常规与粗体，斜体富文本请改为常规字体或导出 SVG",
          );
        const pos = original.getStartPositionOfChar(offset);
        const run = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );
        run.setAttribute("x", String(pos.x));
        run.setAttribute("y", String(pos.y));
        run.setAttribute("xml:space", "preserve");
        run.setAttribute("text-anchor", "start");
        run.style.fontFamily = FONT;
        run.style.fontSize = style.fontSize;
        run.style.fontWeight = style.fontWeight;
        run.style.fill = style.fill;
        run.style.fillOpacity = style.fillOpacity;
        run.style.whiteSpace = "pre";
        run.style.letterSpacing = style.letterSpacing;
        run.textContent = text;
        replacement.appendChild(run);
        offset += text.length;
      }
      original.replaceWith(replacement);
    }
  } finally {
    host.remove();
  }
}
