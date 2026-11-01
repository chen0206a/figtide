// Port of the repository owner's normative diagram-engine-sketch.js.
// Geometry is in finished mm (k=1); the SVG wrapper supplies physical stroke widths.
import {tintColor as mix} from "./color";
const F1 = (v:number) => v.toFixed(1);
function pCircle(cx:number, cy:number, r:number) { return `M${F1(cx - r)} ${F1(cy)}a${F1(r)} ${F1(r)} 0 1 0 ${F1(2 * r)} 0a${F1(r)} ${F1(r)} 0 1 0 ${F1(-2 * r)} 0Z`; }
function pRect(x:number, y:number, w:number, h:number, r:number) {
  r = Math.min(r, w / 2, h / 2);
  return `M${F1(x + r)} ${F1(y)}H${F1(x + w - r)}A${F1(r)} ${F1(r)} 0 0 1 ${F1(x + w)} ${F1(y + r)}V${F1(y + h - r)}A${F1(r)} ${F1(r)} 0 0 1 ${F1(x + w - r)} ${F1(y + h)}H${F1(x + r)}A${F1(r)} ${F1(r)} 0 0 1 ${F1(x)} ${F1(y + h - r)}V${F1(y + r)}A${F1(r)} ${F1(r)} 0 0 1 ${F1(x + r)} ${F1(y)}Z`;
}
function pSmooth(pts:number[][]) {
  const n = pts.length;
  let d = `M${F1(pts[0][0])} ${F1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${F1(c1[0])} ${F1(c1[1])} ${F1(c2[0])} ${F1(c2[1])} ${F1(p2[0])} ${F1(p2[1])}`;
  }
  return d + "Z";
}
function pBlob(cx:number, cy:number, rx:number, ry:number, seed:number) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    const j = 1 + 0.07 * Math.sin(3 * t + seed) + 0.04 * Math.cos(5 * t + seed * 2);
    pts.push([cx + Math.cos(t) * rx * j, cy + Math.sin(t) * ry * j]);
  }
  return pSmooth(pts);
}
function pHex(cx:number, cy:number, r:number) {
  return "M" + Array.from({ length: 6 }, (_, i) => { const t = Math.PI / 6 + (i * Math.PI) / 3; return `${F1(cx + Math.cos(t) * r)} ${F1(cy + Math.sin(t) * r)}`; }).join("L") + "Z";
}

export function bilayer(w:number, h:number, k:number) {
  const r = 0.72 * k, sp = 1.75 * k;
  let heads = "", tails = "";
  for (let x = sp / 2; x < w; x += sp) {
    heads += pCircle(x, r + 0.15 * k, r) + pCircle(x, h - r - 0.15 * k, r);
    const t1 = 2 * r + 0.15 * k, t2 = h / 2 - 0.25 * k, b1 = h - 2 * r - 0.15 * k, b2 = h / 2 + 0.25 * k;
    tails += `M${F1(x - 0.28 * k)} ${F1(t1)}L${F1(x - 0.28 * k)} ${F1(t2)}M${F1(x + 0.28 * k)} ${F1(t1)}L${F1(x + 0.28 * k)} ${F1(t2)}`;
    tails += `M${F1(x - 0.28 * k)} ${F1(b1)}L${F1(x - 0.28 * k)} ${F1(b2)}M${F1(x + 0.28 * k)} ${F1(b1)}L${F1(x + 0.28 * k)} ${F1(b2)}`;
  }
  return { heads: heads || "M0 0", tails: tails || "M0 0" };
}

export function prototypeGlyph(kind:string, w:number, h:number, fill:string, stroke:string, S:{r:number}, k:number):{layers:{d:string;fill:string;stroke:string}[];badges:{x:number;y:number}[]} {
  const soft = mix(fill === "#FFFFFF" ? mix(stroke, "#FFFFFF", 0.8) : fill, "#FFFFFF", 0.0);
  const deep = fill === "#FFFFFF" ? mix(stroke, "#FFFFFF", 0.55) : mix(fill, stroke, 0.35);
  const lay = (d:string, f:string, s2:string) => ({ d, fill: f, stroke: s2 });
  if (kind === "level") return { layers: [lay(pRect(0, h * 0.2, w, h * 0.6, h * 0.3), stroke, "none")], badges: [] };
  if (kind === "database") {
    const rx = w * 0.4, ry = h * 0.13, cx = w / 2, t = h * 0.15, b = h * 0.85;
    const body = `M${F1(cx - rx)} ${F1(t)}V${F1(b)}A${F1(rx)} ${F1(ry)} 0 0 0 ${F1(cx + rx)} ${F1(b)}V${F1(t)}`;
    const top = `M${F1(cx - rx)} ${F1(t)}A${F1(rx)} ${F1(ry)} 0 1 0 ${F1(cx + rx)} ${F1(t)}A${F1(rx)} ${F1(ry)} 0 1 0 ${F1(cx - rx)} ${F1(t)}Z`;
    const mid = `M${F1(cx - rx)} ${F1(h * 0.5)}A${F1(rx)} ${F1(ry)} 0 0 0 ${F1(cx + rx)} ${F1(h * 0.5)}`;
    return { layers: [lay(body, soft, stroke), lay(top, deep, stroke), lay(mid, "none", stroke)], badges: [] };
  }
  if (kind === "chart" || kind === "chartlow") {
    const hs = kind === "chart" ? [0.35, 0.55, 0.8] : [0.5, 0.32, 0.18];
    let bars = "";
    hs.forEach((v, i) => { const bw = w * 0.2, x = w * 0.12 + i * w * 0.27; bars += pRect(x, h * 0.9 - h * 0.8 * v, bw, h * 0.8 * v, 0.2 * k); });
    return { layers: [lay(bars, deep, "none"), lay(`M${F1(w * 0.05)} ${F1(h * 0.9)}H${F1(w * 0.95)}`, "none", stroke)], badges: [] };
  }
  if (kind === "bulb") {
    const cx = w / 2, r = w * 0.32;
    const glass = `M${F1(cx - r * 0.55)} ${F1(h * 0.66)}C${F1(cx - r * 1.3)} ${F1(h * 0.45)} ${F1(cx - r)} ${F1(h * 0.05)} ${F1(cx)} ${F1(h * 0.05)}C${F1(cx + r)} ${F1(h * 0.05)} ${F1(cx + r * 1.3)} ${F1(h * 0.45)} ${F1(cx + r * 0.55)} ${F1(h * 0.66)}Z`;
    const base = pRect(cx - r * 0.5, h * 0.68, r, h * 0.2, 0.3 * k);
    return { layers: [lay(glass, "#FFF3C4", stroke), lay(base, deep, stroke)], badges: [] };
  }
  if (kind === "tokens") {
    let t1 = "", t2 = "";
    for (let i = 0; i < 4; i++) { const p = pRect(w * 0.04 + i * w * 0.24, h * 0.3, w * 0.2, h * 0.4, 0.3 * k); if (i % 2) t2 += p; else t1 += p; }
    return { layers: [lay(t1, soft, stroke), lay(t2, deep, stroke)], badges: [] };
  }
  if (kind === "frames") {
    const fw = w * 0.72, fh = h * 0.58, o = w * 0.09;
    const f = (i:number) => pRect(o * i, o * (2 - i) * 0.8, fw, fh, 0.6 * k);
    const scene = (i:number) => { const x = o * i, y = o * (2 - i) * 0.8; return `M${F1(x + fw * 0.08)} ${F1(y + fh * 0.88)}L${F1(x + fw * 0.38)} ${F1(y + fh * 0.45)}L${F1(x + fw * 0.58)} ${F1(y + fh * 0.7)}L${F1(x + fw * 0.72)} ${F1(y + fh * 0.55)}L${F1(x + fw * 0.92)} ${F1(y + fh * 0.88)}Z` + pCircle(x + fw * 0.75, y + fh * 0.28, fh * 0.1); };
    return { layers: [lay(f(0) + f(1), mix(soft, "#FFFFFF", 0.4), stroke), lay(f(2), "#FFFFFF", stroke), lay(scene(2), deep, "none")], badges: [] };
  }
  if (kind === "encoder") {
    const t = `M${F1(w * 0.05)} ${F1(h * 0.08)}L${F1(w * 0.95)} ${F1(h * 0.3)}V${F1(h * 0.7)}L${F1(w * 0.05)} ${F1(h * 0.92)}Z`;
    let ln = "";
    for (let i = 1; i < 4; i++) { const x = w * (0.05 + 0.225 * i), y0 = h * (0.08 + 0.055 * i), y1 = h * (0.92 - 0.055 * i); ln += `M${F1(x)} ${F1(y0)}V${F1(y1)}`; }
    return { layers: [lay(t, soft, stroke), lay(ln, "none", deep), lay(snowPath(w * 0.84, h * 0.1, Math.min(w, h) * 0.12), "#FFFFFF", "#2C6CB0")], badges: [] };
  }
  if (kind === "llm") {
    let rows = "";
    for (const yy of [0.1, 0.2, 0.74, 0.84]) rows += pRect(w * 0.12, h * yy, w * 0.62, h * 0.065, 0.3 * k);
    return { layers: [lay(pRect(0, 0, w, h, 1.4 * k), soft, stroke), lay(rows, "#FFFFFF", deep), lay(flamePath(w * 0.87, h * 0.05, Math.min(w, h) * 0.1), "#F0A35E", "#C25400")], badges: [] };
  }
  if (kind === "attention") {
    const n = 5, pad = 0.4 * k, sz = Math.min(w, h) - 2 * pad, c = sz / n, x0 = (w - sz) / 2, y0 = (h - sz) / 2;
    let lo = "", mid = "", hi = "";
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = Math.abs(Math.sin(i * 1.7 + j * 0.9)) * (i === j || i === j + 1 ? 1.6 : 0.8);
      const p = pRect(x0 + i * c + 0.12 * k, y0 + j * c + 0.12 * k, c - 0.24 * k, c - 0.24 * k, 0.15 * k);
      if (v > 1.1) hi += p; else if (v > 0.55) mid += p; else lo += p;
    }
    return { layers: [lay(lo, mix(soft, "#FFFFFF", 0.55), "none"), lay(mid, soft, "none"), lay(hi, stroke, "none")], badges: [] };
  }
  if (kind === "text") {
    return { layers: [lay(pRect(0, h * 0.08, w, h * 0.84, 0.8 * k), "#FFFFFF", stroke), lay(`M${F1(w * 0.2)} ${F1(h * 0.36)}H${F1(w * 0.8)}M${F1(w * 0.2)} ${F1(h * 0.52)}H${F1(w * 0.7)}M${F1(w * 0.2)} ${F1(h * 0.68)}H${F1(w * 0.55)}`, "none", deep)], badges: [] };
  }
  if (kind === "snow") return { layers: [lay(snowPath(w / 2, h / 2, Math.min(w, h) * 0.5), "none", "#2C6CB0")], badges: [] };
  if (kind === "flame") return { layers: [lay(flamePath(w / 2, h * 0.05, Math.min(w, h) * 0.5), "#F0A35E", "#C25400")], badges: [] };
  if (kind === "protein") return { layers: [lay(pBlob(w / 2, h / 2, w / 2 - 0.4 * k, h / 2 - 0.4 * k, 1.3), soft, stroke)], badges: [] };
  if (kind === "dimer") {
    const rx = w * 0.235, ry = h / 2 - 0.6 * k;
    return { layers: [lay(pBlob(w * 0.27, h / 2 + 0.6 * k, rx, ry, 0.4) + pBlob(w * 0.73, h / 2 + 0.6 * k, rx, ry, 2.1), soft, stroke)],
      badges: [{ x: w * 0.2, y: 1.4 * k }, { x: w * 0.8, y: 1.4 * k }] };
  }
  if (kind === "ligand") {
    const r = Math.min(w, h) * 0.26;
    return { layers: [lay(pCircle(w * 0.32, h * 0.62, r) + pCircle(w * 0.66, h * 0.62, r) + pCircle(w * 0.49, h * 0.32, r), soft, stroke)], badges: [] };
  }
  if (kind === "receptor") {
    const cw = w * 0.26, gap = w * 0.05, cx1 = w / 2 - gap / 2 - cw / 2, cx2 = w / 2 + gap / 2 + cw / 2;
    const chain = (cx:number) => {
      const top = pBlob(cx, h * 0.2, cw * 0.62, h * 0.2, cx);
      const tm = pRect(cx - cw * 0.22, h * 0.36, cw * 0.44, h * 0.34, cw * 0.1);
      const tail = pRect(cx - cw * 0.36, h * 0.68, cw * 0.72, h * 0.31, cw * 0.3);
      return { top, tm, tail };
    };
    const a = chain(cx1), b = chain(cx2);
    return { layers: [lay(a.tm + b.tm, deep, stroke), lay(a.top + b.top, soft, stroke), lay(a.tail + b.tail, soft, stroke)], badges: [] };
  }
  if (kind === "drug") {
    const r = Math.min(w / 4.2, h / 2.3);
    const cx = w / 2, cy = h / 2;
    const dx = r * Math.cos(Math.PI / 6);
    const rings = pHex(cx - dx, cy, r) + pHex(cx + dx, cy, r);
    const sub = `M${F1(cx + 2 * dx)} ${F1(cy - r / 2)}L${F1(cx + 2 * dx + r * 0.7)} ${F1(cy - r)}`;
    return { layers: [lay(rings, soft, stroke), lay(sub, "none", stroke)], badges: [] };
  }
  if (kind === "dna") {
    let s1 = "", s2 = "", rungs = "";
    const amp = h * 0.32, cy = h / 2, N = 60, waves = Math.max(2, Math.round(w / (h * 1.6)));
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * w, t = (i / N) * waves * Math.PI * 2;
      s1 += (i ? "L" : "M") + `${F1(x)} ${F1(cy + Math.sin(t) * amp)}`;
      s2 += (i ? "L" : "M") + `${F1(x)} ${F1(cy - Math.sin(t) * amp)}`;
      if (i % 3 === 1) rungs += `M${F1(x)} ${F1(cy + Math.sin(t) * amp * 0.85)}L${F1(x)} ${F1(cy - Math.sin(t) * amp * 0.85)}`;
    }
    const gene = pRect(w * 0.34, cy - amp - 0.9 * k, w * 0.36, 2 * amp + 1.8 * k, 1 * k);
    return { layers: [lay(gene, soft, "none"), lay(rungs, "none", deep), lay(s1 + s2, "none", stroke)], badges: [] };
  }
  if (kind === "image") {
    let cells = "";
    const n = 4, pad = 0.6 * k, s = (Math.min(w, h * 1.3) - 2 * pad) / n, x0 = (w - s * n) / 2, y0 = (h - s * n * 0.78) / 2;
    let cells2 = "";
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = pRect(x0 + i * s + 0.15 * k, y0 + j * s * 0.78 + 0.15 * k, s - 0.3 * k, s * 0.78 - 0.3 * k, 0.3 * k);
      if ((i + j) % 3 === 0) cells2 += p; else cells += p;
    }
    return { layers: [lay(pRect(x0 - 0.4 * k, y0 - 0.4 * k, s * n + 0.8 * k, s * n * 0.78 + 0.8 * k, 0.6 * k), "#FFFFFF", stroke), lay(cells, soft, "none"), lay(cells2, deep, "none")], badges: [] };
  }
  if (kind === "stack") {
    const o = 1.3 * k, ww = w - 2 * o, hh = h - 2 * o;
    return { layers: [lay(pRect(2 * o, 0, ww, hh, S.r * k), mix(soft, "#FFFFFF", 0.5), stroke), lay(pRect(o, o, ww, hh, S.r * k), mix(soft, "#FFFFFF", 0.25), stroke), lay(pRect(0, 2 * o, ww, hh, S.r * k), soft, stroke)], badges: [] };
  }
  if (kind === "lens") {
    const cx = w / 2, b = w * 0.42;
    const d = `M${F1(cx)} 0Q${F1(cx + b * 2)} ${F1(h / 2)} ${F1(cx)} ${F1(h)}Q${F1(cx - b * 2)} ${F1(h / 2)} ${F1(cx)} 0Z`;
    return { layers: [lay(d, mix(soft, "#FFFFFF", 0.3), stroke)], badges: [] };
  }
  if (kind === "laser") {
    return { layers: [lay(pRect(0, h * 0.18, w * 0.86, h * 0.64, 1 * k), soft, stroke), lay(pRect(w * 0.86, h * 0.36, w * 0.12, h * 0.28, 0.4 * k), deep, stroke), lay(`M${F1(w * 0.12)} ${F1(h * 0.5)}H${F1(w * 0.7)}`, "none", deep)], badges: [] };
  }
  if (kind === "cube") {
    return { layers: [lay(pRect(0, 0, w, h, 0.3 * k), mix(soft, "#FFFFFF", 0.35), stroke), lay(`M0 ${F1(h)}L${F1(w)} 0`, "none", stroke)], badges: [] };
  }
  if (kind === "sample") {
    return { layers: [lay(pRect(0, h * 0.62, w, h * 0.16, 0.3 * k), mix(soft, "#FFFFFF", 0.4), stroke), lay(`M${F1(w * 0.3)} ${F1(h * 0.62)}Q${F1(w * 0.5)} ${F1(h * 0.18)} ${F1(w * 0.7)} ${F1(h * 0.62)}Z`, soft, stroke)], badges: [] };
  }
  if (kind === "detector") {
    let grid = "";
    for (let i = 1; i < 4; i++) grid += `M${F1(w * 0.18 + (w * 0.64 * i) / 4)} ${F1(h * 0.22)}V${F1(h * 0.78)}M${F1(w * 0.18)} ${F1(h * 0.22 + (h * 0.56 * i) / 4)}H${F1(w * 0.82)}`;
    return { layers: [lay(pRect(0, 0, w, h, 1 * k), soft, stroke), lay(pRect(w * 0.18, h * 0.22, w * 0.64, h * 0.56, 0.3 * k), "#FFFFFF", stroke), lay(grid, "none", deep)], badges: [] };
  }
  if (kind === "tube") {
    const tw = w * 0.36, x = (w - tw) / 2;
    const body = `M${F1(x)} ${F1(h * 0.08)}V${F1(h * 0.72)}A${F1(tw / 2)} ${F1(tw / 2)} 0 0 0 ${F1(x + tw)} ${F1(h * 0.72)}V${F1(h * 0.08)}Z`;
    const liquid = `M${F1(x)} ${F1(h * 0.48)}V${F1(h * 0.72)}A${F1(tw / 2)} ${F1(tw / 2)} 0 0 0 ${F1(x + tw)} ${F1(h * 0.72)}V${F1(h * 0.48)}Z`;
    return { layers: [lay(body, "#FFFFFF", stroke), lay(liquid, deep, "none"), lay(`M${F1(x - 0.6 * k)} ${F1(h * 0.08)}H${F1(x + tw + 0.6 * k)}`, "none", stroke)], badges: [] };
  }
  if (kind === "cells") {
    const r = Math.min(w, h) * 0.2;
    const c = pCircle(w * 0.3, h * 0.38, r) + pCircle(w * 0.68, h * 0.34, r) + pCircle(w * 0.48, h * 0.7, r);
    const nuc = pCircle(w * 0.3, h * 0.38, r * 0.38) + pCircle(w * 0.68, h * 0.34, r * 0.38) + pCircle(w * 0.48, h * 0.7, r * 0.38);
    return { layers: [lay(c, soft, stroke), lay(nuc, deep, "none")], badges: [] };
  }
  if (kind === "flask") {
    const d = `M${F1(w * 0.4)} ${F1(h * 0.06)}V${F1(h * 0.38)}L${F1(w * 0.12)} ${F1(h * 0.92)}H${F1(w * 0.88)}L${F1(w * 0.6)} ${F1(h * 0.38)}V${F1(h * 0.06)}Z`;
    const liq = `M${F1(w * 0.25)} ${F1(h * 0.66)}L${F1(w * 0.12)} ${F1(h * 0.92)}H${F1(w * 0.88)}L${F1(w * 0.75)} ${F1(h * 0.66)}Z`;
    return { layers: [lay(d, "#FFFFFF", stroke), lay(liq, deep, "none")], badges: [] };
  }
  return { layers: [], badges: [] };
}
function snowPath(cx:number, cy:number, r:number) {
  let d = "";
  for (let i = 0; i < 3; i++) { const t = (i * Math.PI) / 3; d += `M${F1(cx - Math.cos(t) * r)} ${F1(cy - Math.sin(t) * r)}L${F1(cx + Math.cos(t) * r)} ${F1(cy + Math.sin(t) * r)}`; }
  return d;
}
function flamePath(cx:number, top:number, r:number) {
  const h = r * 2.2, b = top + h;
  return `M${F1(cx - r * 0.1)} ${F1(top)}C${F1(cx + r * 0.9)} ${F1(top + h * 0.35)} ${F1(cx + r * 1.05)} ${F1(top + h * 0.7)} ${F1(cx + r * 0.6)} ${F1(b - h * 0.08)}C${F1(cx + r * 0.3)} ${F1(b)} ${F1(cx - r * 0.45)} ${F1(b)} ${F1(cx - r * 0.75)} ${F1(b - h * 0.12)}C${F1(cx - r * 1.05)} ${F1(top + h * 0.62)} ${F1(cx - r * 0.65)} ${F1(top + h * 0.5)} ${F1(cx - r * 0.45)} ${F1(top + h * 0.3)}C${F1(cx - r * 0.3)} ${F1(top + h * 0.48)} ${F1(cx - r * 0.1)} ${F1(top + h * 0.5)} ${F1(cx)} ${F1(top + h * 0.42)}C${F1(cx + r * 0.1)} ${F1(top + h * 0.28)} ${F1(cx)} ${F1(top + h * 0.12)} ${F1(cx - r * 0.1)} ${F1(top)}Z`;
}
