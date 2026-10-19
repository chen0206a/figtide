import { defaultPublication, type Config } from "./model";

export function publicationMetrics(c: Config, multiplier = 2) {
  const p = c.publication || defaultPublication;
  const heightMm = (p.widthMm * c.style.height) / c.style.width;
  const fontPx = (((p.fontPt * 25.4) / 72) * c.style.width) / p.widthMm;
  const pixelWidth = p.enabled
    ? Math.round((p.widthMm / 25.4) * p.dpi)
    : c.style.width * multiplier;
  const scale = pixelWidth / c.style.width;
  const pixelHeight = Math.floor(c.style.height * scale);
  const effectiveDpi = pixelWidth / (p.widthMm / 25.4);
  return {
    ...p,
    heightMm,
    fontPx,
    pixelWidth,
    pixelHeight,
    scale,
    effectiveDpi,
  };
}
export function renderConfig(c: Config): Config {
  const m = publicationMetrics(c);
  const ratio = Math.max(1, m.fontPx / c.style.fontSize);
  return m.enabled
    ? {
        ...c,
        style: {
          ...c.style,
          fontSize: m.fontPx,
          top: c.style.top * ratio,
          bottom: c.style.bottom * ratio,
          left: c.style.left * ratio,
          right: c.style.right * ratio,
        },
      }
    : c;
}
export function exportChecks(c: Config, multiplier = 2) {
  const m = publicationMetrics(c, multiplier),
    messages: string[] = [];
  if (!m.enabled)
    messages.push("当前未指定成品物理尺寸，像素倍率不能直接视为 DPI。");
  if (m.enabled && m.fontPt < 6)
    messages.push("成品基础字号小于 6 pt，请检查目标期刊要求及缩印可读性。");
  if (m.enabled && m.fontPx * 8 > c.style.height)
    messages.push("字号相对画布较大，标题、图例或坐标标签可能拥挤。");
  if (m.enabled && m.effectiveDpi < 299)
    messages.push("有效 DPI 低于 300；是否足够取决于目标用途。");
  messages.push("SVG 保留可编辑文字但不嵌入字体；接收设备需安装相同字体。");
  return messages;
}
export function physicalSvg(url: string, c: Config) {
  if (!c.publication?.enabled) return url;
  const source = url.includes(";base64,")
    ? new TextDecoder().decode(
        Uint8Array.from(atob(url.split(",")[1]), (char) => char.charCodeAt(0)),
      )
    : decodeURIComponent(url.slice(url.indexOf(",") + 1));
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("SVG 导出内容无效");
  const root = doc.documentElement,
    m = publicationMetrics(c);
  root.setAttribute("width", `${m.widthMm}mm`);
  root.setAttribute("height", `${Number(m.heightMm.toFixed(4))}mm`);
  root.setAttribute("viewBox", `0 0 ${c.style.width} ${c.style.height}`);
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(new XMLSerializer().serializeToString(doc))
  );
}
// Inserts standards-defined pHYs metadata without changing the PNG's image data.
export function pngDensity(url: string, dpi: number) {
  const bytes = Uint8Array.from(atob(url.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0) !== 0x89504e47) throw new Error("PNG 导出内容无效");
  const chunk = new Uint8Array(21),
    cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  cv.setUint32(8, Math.round(dpi / 0.0254));
  cv.setUint32(12, Math.round(dpi / 0.0254));
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.slice(4, 17)) {
    crc ^= byte;
    for (let b = 0; b < 8; b++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  cv.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts: Uint8Array[] = [bytes.slice(0, 8)];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at),
      end = at + length + 12;
    if (end > bytes.length) throw new Error("PNG 数据块损坏");
    const kind = String.fromCharCode(...bytes.slice(at + 4, at + 8));
    if (kind !== "pHYs") parts.push(bytes.slice(at, end));
    if (kind === "IHDR") parts.push(chunk);
    at = end;
  }
  const merged = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  const strings: string[] = [];
  for (let at = 0; at < merged.length; at += 16384)
    strings.push(String.fromCharCode(...merged.slice(at, at + 16384)));
  return "data:image/png;base64," + btoa(strings.join(""));
}
