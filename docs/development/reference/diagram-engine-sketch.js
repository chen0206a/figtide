// 设计稿原型（仓库主人提供，可按规范移植）：机制图 / 方法框架图的渲染、科学图元、线宽和配色。几何比例、层次、标签位置、线宽数值以此为准；移植时补类型和测试。
const MECH_STYLES = {
  "nature-flat": { name: "Nature 扁平", note: "白底 · Arial · 0.5 pt 细线", paper: "#FFFFFF", font: "Arial, Helvetica, sans-serif", fw: 500, fg: "#1A1F26", line: "#2B323C", sw: 0.28, r: 1.0,
    zone: ["#F7F8FA", "#C9D0D9"], zoneDash: false, membrane: ["#E3EAF2", "#9FB0C4"], nucleus: ["#EEF3F8", "#8A9BB0"], panel: ["#FFFFFF", "#C9D0D9"],
    roles: { a: ["#DCE9F5", "#0072B2"], b: ["#DDF1EA", "#009E73"], c: ["#FBE3D3", "#D55E00"], d: ["#ECE6F3", "#7E5BA6"], n: ["#FFFFFF", "#5F6773"] },
    accent: "#D55E00", beam: "#D55E00", shadow: "none", iso: false, sketch: false, zl: "#5F6773", panelHead: false },
  "soft-illustration": { name: "柔和插画", note: "圆润轮廓 · 柔和底色", paper: "#FFFFFF", font: "Inter, 'Noto Sans SC', sans-serif", fw: 600, fg: "#24303F", line: "#56657A", sw: 0.3, r: 3.2,
    zone: ["#F2F6FB", "#DCE5F0"], zoneDash: false, membrane: ["#F7DECB", "#E9B994"], nucleus: ["#EAE4F6", "#BCA9DD"], panel: ["#F7F9FC", "#DCE5F0"],
    roles: { a: ["#CFE2F6", "#8DB6E2"], b: ["#CDEBDF", "#86C8AC"], c: ["#FAD8C4", "#EBA57D"], d: ["#E3DAF3", "#B3A0D8"], n: ["#FFFFFF", "#C3CCD8"] },
    accent: "#D9774A", beam: "#D9774A", shadow: "0 1px 4px rgba(36,48,63,.14)", iso: false, sketch: false, zl: "#6B7A8F", panelHead: false },
  "line-minimal": { name: "线稿极简", note: "黑线 + 一个强调色", paper: "#FFFFFF", font: "Arial, Helvetica, sans-serif", fw: 500, fg: "#0E1116", line: "#0E1116", sw: 0.28, r: 0.4,
    zone: ["transparent", "#0E1116"], zoneDash: true, membrane: ["#FFFFFF", "#0E1116"], nucleus: ["transparent", "#0E1116"], panel: ["transparent", "#0E1116"],
    roles: { a: ["#FFFFFF", "#0E1116"], b: ["#FFFFFF", "#0E1116"], c: ["#FFFFFF", "#D55E00"], d: ["#FFFFFF", "#0E1116"], n: ["#FFFFFF", "#0E1116"] },
    accent: "#D55E00", beam: "#D55E00", shadow: "none", iso: false, sketch: false, zl: "#0E1116", panelHead: false },
  "conference-framework": { name: "会议框架风", note: "分组浅底 · 圆角模块", paper: "#FFFFFF", font: "Inter, 'Noto Sans SC', sans-serif", fw: 600, fg: "#0E1116", line: "#3D4652", sw: 0.32, r: 1.8,
    zone: ["#EEF4FB", "#BFD3EA"], zoneDash: false, membrane: ["#FFE9D6", "#F2B98A"], nucleus: ["#E7F5EE", "#9ED3B7"], panel: ["#EEF4FB", "#BFD3EA"],
    roles: { a: ["#FFFFFF", "#2F6FC7"], b: ["#FFFFFF", "#1C8F67"], c: ["#FFF3EA", "#D55E00"], d: ["#FFFFFF", "#7E5BA6"], n: ["#FFFFFF", "#8A93A0"] },
    accent: "#D55E00", beam: "#D55E00", shadow: "none", iso: false, sketch: false, zl: "#2F4A6E", panelHead: true },
  "isometric": { name: "等距 3D", note: "矢量立体方块", paper: "#FFFFFF", font: "Inter, 'Noto Sans SC', sans-serif", fw: 600, fg: "#0E1116", line: "#2B323C", sw: 0.3, r: 0.3,
    zone: ["#F5F7FA", "#D5DAE1"], zoneDash: false, membrane: ["#E3EAF2", "#9FB0C4"], nucleus: ["#EEF3F8", "#8A9BB0"], panel: ["#F5F7FA", "#D5DAE1"],
    roles: { a: ["#CFE0F3", "#2C6CB0"], b: ["#CDEBDD", "#1D8A62"], c: ["#F8D6C0", "#C25400"], d: ["#E2DAF0", "#6F4E9A"], n: ["#F4F5F7", "#6B7480"] },
    accent: "#C25400", beam: "#D55E00", shadow: "none", iso: true, sketch: false, zl: "#5F6773", panelHead: false },
  "sketch": { name: "手绘草图", note: "适合汇报和讨论", paper: "#FFFEF8", font: "Kalam, 'Comic Sans MS', cursive", fw: 700, fg: "#262626", line: "#262626", sw: 0.32, r: 1.4,
    zone: ["#FBF7EA", "#8C877A"], zoneDash: true, membrane: ["#F3E6CF", "#8C877A"], nucleus: ["#EEF1E6", "#8C877A"], panel: ["#FBF7EA", "#8C877A"],
    roles: { a: ["#DCEBFA", "#262626"], b: ["#DDF2E6", "#262626"], c: ["#FBE0CF", "#262626"], d: ["#ECE4F6", "#262626"], n: ["#FFFFFF", "#262626"] },
    accent: "#C2410C", beam: "#C2410C", shadow: "none", iso: false, sketch: true, zl: "#5A564C", panelHead: false },
};

const MECH_PALETTES = {
  "okabe-ito": { name: "色盲友好（Okabe–Ito）", src: "Okabe & Ito 2008", a: "#0072B2", b: "#009E73", c: "#D55E00", d: "#CC79A7", n: "#666666" },
  "npg": { name: "NPG 风格", src: "参考 ggsci 整理的 Nature 系列常见配色（非官方）", a: "#3C5488", b: "#00A087", c: "#E64B35", d: "#4DBBD5", n: "#7E6148" },
  "aaas": { name: "AAAS 风格", src: "参考 ggsci 整理的 Science 常见配色（非官方）", a: "#3B4992", b: "#008B45", c: "#EE0000", d: "#631879", n: "#808180" },
  "nejm": { name: "NEJM 风格", src: "参考 ggsci 整理的 NEJM 常见配色（非官方）", a: "#0072B5", b: "#20854E", c: "#BC3C29", d: "#7876B1", n: "#6F99AD" },
  "lancet": { name: "Lancet 风格", src: "参考 ggsci 整理的 Lancet 常见配色（非官方）", a: "#00468B", b: "#42B540", c: "#ED0000", d: "#925E9F", n: "#ADB6B6" },
  "jama": { name: "JAMA 风格", src: "参考 ggsci 整理的 JAMA 常见配色（非官方）", a: "#00A1D5", b: "#79AF97", c: "#B24745", d: "#6A6599", n: "#374E55" },
};

const MECH_SKILLS = [
  { id: "bio-mechanism", name: "生物医学机制图", note: "信号通路、分区、药物作用", ver: "1.0" },
  { id: "ml-framework", name: "方法框架图", note: "AI 论文 Figure 1：流水线、架构", ver: "1.0" },
  { id: "workflow", name: "实验流程图", note: "步骤 + 放大面板", ver: "1.0" },
  { id: "chem-materials", name: "化学 / 材料机理", note: "反应路径、能级", ver: "1.0" },
  { id: "physics-device", name: "物理装置 / 光路", note: "先列几何事实再画", ver: "1.0" },
  { id: "concept-abstract", name: "概念图 / 图形摘要", note: "中心辐射、前后对比", ver: "1.0" },
];

const MECH_TEMPLATES = [
  { id: "bio-compartment", skill: "bio-mechanism", mode: "mechanism", name: "分区信号机制", use: "胞外 · 膜 · 胞质 · 核",
    zones: [
      { id: "ex", kind: "space", label: "Extracellular", x: 0, y: 0, w: 180, h: 24 },
      { id: "mem", kind: "membrane", label: "Plasma membrane", x: 0, y: 24, w: 180, h: 8 },
      { id: "cyt", kind: "compartment", label: "Cytoplasm", x: 0, y: 32, w: 180, h: 78 },
      { id: "nuc", kind: "nucleus", label: "Nucleus", x: 96, y: 58, w: 80, h: 48 },
    ],
    nodes: [
      { id: "lig", label: "Cytokine", role: "d", glyph: "ligand", lp: "right", gw: 9, x: 24, y: 4, w: 30, h: 9 },
      { id: "rec", label: "Receptor", role: "a", glyph: "receptor", lp: "left", gw: 16, x: 4, y: 12, w: 38, h: 30 },
      { id: "jak", label: "JAK", role: "a", glyph: "protein", lp: "center", x: 25, y: 47, w: 18, h: 10 },
      { id: "stat", label: "STAT3", role: "b", glyph: "protein", lp: "center", x: 68, y: 47, w: 21, h: 10 },
      { id: "dim", label: "p-STAT3 dimer", role: "b", glyph: "dimer", lp: "below", x: 59, y: 66, w: 32, h: 19 },
      { id: "gene", label: "Target genes", role: "b", glyph: "dna", lp: "below", x: 112, y: 80, w: 54, h: 17 },
      { id: "drug", label: "JAK inhibitor", role: "c", glyph: "drug", lp: "below", x: 2, y: 72, w: 26, h: 17 },
    ],
    edges: [
      { id: "e1", from: "lig", to: "rec", kind: "bind" },
      { id: "e2", from: "rec", to: "jak", kind: "activate" },
      { id: "e3", from: "jak", to: "stat", kind: "activate" },
      { id: "e4", from: "stat", to: "dim", kind: "flow" },
      { id: "e5", from: "dim", to: "gene", kind: "transport", route: "orthogonal" },
      { id: "e6", from: "drug", to: "jak", kind: "inhibit" },
    ],
    legend: { x: 128, y: 2 } },
  { id: "ml-videoqa", skill: "ml-framework", mode: "framework", name: "方法总览 + 模块放大", use: "AI 论文 Figure 1：主流程 + 本文模块",
    zones: [
      { id: "vp", kind: "panel", label: "Visual pathway", x: 2, y: 1, w: 64, h: 47 },
      { id: "zm", kind: "zoom", label: "Temporal attention module (ours)", x: 28, y: 62, w: 148, h: 44 },
    ],
    nodes: [
      { id: "frm", label: "Video frames", role: "a", glyph: "frames", lp: "below", x: 5, y: 7, w: 24, h: 31 },
      { id: "enc", label: "Visual encoder", role: "a", glyph: "encoder", lp: "below", x: 34, y: 7, w: 28, h: 31 },
      { id: "tam", label: "Temporal attention", role: "c", shape: "box", glyph: "attention", boxed: true, x: 72, y: 13.5, w: 40, h: 15 },
      { id: "llm", label: "Language model", role: "d", glyph: "llm", lp: "center", x: 126, y: 5, w: 28, h: 32 },
      { id: "ans", label: "Answer", role: "b", shape: "pill", x: 158, y: 15, w: 20, h: 12 },
      { id: "q", label: "Question", role: "n", shape: "box", glyph: "text", boxed: true, x: 155, y: 36, w: 23, h: 10 },
      { id: "z0", label: "Attention map", role: "c", glyph: "attention", lp: "below", x: 33, y: 70, w: 24, h: 31 },
      { id: "z1", label: "Sensitivity filter", role: "a", shape: "box", glyph: "chartlow", boxed: true, x: 64, y: 78, w: 34, h: 13 },
      { id: "z2", label: "Activation patching", role: "a", shape: "box", glyph: "tokens", boxed: true, x: 104, y: 78, w: 36, h: 13 },
      { id: "z3", label: "Local contrast", role: "c", shape: "box", glyph: "chart", boxed: true, x: 144, y: 78, w: 31, h: 13 },
      { id: "k1", label: "Frozen", role: "a", glyph: "snow", lp: "right", gw: 3.6, x: 6, y: 41.5, w: 16, h: 3.6 },
      { id: "k2", label: "LoRA-tuned", role: "c", glyph: "flame", lp: "right", gw: 3.6, x: 23, y: 41.5, w: 22, h: 3.6 },
    ],
    edges: [
      { id: "m1", from: "frm", to: "enc", kind: "flow" },
      { id: "m2", from: "enc", to: "tam", kind: "flow" },
      { id: "m3", from: "tam", to: "llm", kind: "flow" },
      { id: "m4", from: "llm", to: "ans", kind: "flow" },
      { id: "m5", from: "q", to: "llm", kind: "flow" },
      { id: "m6", from: "z0", to: "z1", kind: "flow" }, { id: "m7", from: "z1", to: "z2", kind: "flow" }, { id: "m8", from: "z2", to: "z3", kind: "flow" },
      { id: "g1", pts: [[72, 28.5], [28, 62]], kind: "guide" }, { id: "g2", pts: [[112, 28.5], [176, 62]], kind: "guide" },
    ] },
  { id: "ml-pipeline", skill: "ml-framework", mode: "pipeline", name: "编码器–解码器流水线", use: "输入 → 模块组 → 输出",
    zones: [
      { id: "enc", kind: "panel", label: "Encoder", x: 44, y: 20, w: 58, h: 70 },
      { id: "dec", kind: "panel", label: "Decoder", x: 110, y: 20, w: 42, h: 70 },
    ],
    nodes: [
      { id: "in", label: "Input image", role: "a", glyph: "image", lp: "below", x: 6, y: 27, w: 30, h: 22 },
      { id: "pe", label: "Patch embed", role: "a", shape: "box", glyph: "tokens", boxed: true, x: 50, y: 33, w: 46, h: 13 },
      { id: "tr", label: "Transformer × L", role: "a", glyph: "stack", lp: "center", x: 50, y: 58, w: 46, h: 17 },
      { id: "q", label: "Queries", role: "d", shape: "box", glyph: "tokens", boxed: true, x: 114, y: 33, w: 34, h: 13 },
      { id: "hd", label: "Task head", role: "b", shape: "box", x: 116, y: 62, w: 30, h: 12 },
      { id: "out", label: "Output", role: "c", shape: "pill", x: 158, y: 62, w: 20, h: 12 },
    ],
    edges: [
      { id: "p1", from: "in", to: "pe", kind: "flow" },
      { id: "p2", from: "pe", to: "tr", kind: "flow" },
      { id: "p3", from: "tr", to: "hd", kind: "flow" },
      { id: "p4", from: "q", to: "hd", kind: "flow" },
      { id: "p5", from: "hd", to: "out", kind: "flow" },
    ] },
  { id: "workflow-zoom", skill: "workflow", mode: "workflow", name: "步骤 + 放大面板", use: "从左到右，局部展开",
    zones: [{ id: "zm", kind: "zoom", label: "Library prep · detail", x: 66, y: 50, w: 86, h: 52 }],
    nodes: [
      { id: "s1", label: "Collection", role: "n", shape: "box", glyph: "tube", boxed: true, x: 4, y: 14, w: 36, h: 14 },
      { id: "s2", label: "Dissociation", role: "n", shape: "box", glyph: "cells", boxed: true, x: 48, y: 14, w: 38, h: 14 },
      { id: "s3", label: "Library prep", role: "a", shape: "box", glyph: "flask", boxed: true, x: 94, y: 14, w: 38, h: 14 },
      { id: "s4", label: "Sequencing", role: "b", shape: "box", glyph: "dna", boxed: true, x: 140, y: 14, w: 36, h: 14 },
      { id: "z1", label: "Barcoding", role: "a", shape: "box", x: 72, y: 68, w: 22, h: 12 },
      { id: "z2", label: "PCR", role: "a", shape: "box", x: 100, y: 68, w: 18, h: 12 },
      { id: "z3", label: "QC", role: "c", shape: "box", x: 124, y: 68, w: 20, h: 12 },
    ],
    edges: [
      { id: "w1", from: "s1", to: "s2", kind: "flow" }, { id: "w2", from: "s2", to: "s3", kind: "flow" }, { id: "w3", from: "s3", to: "s4", kind: "flow" },
      { id: "w4", from: "z1", to: "z2", kind: "flow" }, { id: "w5", from: "z2", to: "z3", kind: "flow" },
      { id: "g1", pts: [[94, 28], [66, 50]], kind: "guide" }, { id: "g2", pts: [[132, 28], [152, 50]], kind: "guide" },
    ] },
  { id: "concept-compare", skill: "concept-abstract", mode: "comparison", name: "前后对比", use: "两个面板 + 中间转变",
    zones: [
      { id: "bf", kind: "panel", label: "Before", x: 4, y: 8, w: 70, h: 94 },
      { id: "af", kind: "panel", label: "After", x: 106, y: 8, w: 70, h: 94 },
    ],
    nodes: [
      { id: "b1", label: "Blocked pathway", role: "n", shape: "box", glyph: "receptor", boxed: true, x: 10, y: 30, w: 58, h: 15 },
      { id: "b2", label: "Low signal", role: "c", shape: "box", glyph: "chartlow", boxed: true, x: 18, y: 68, w: 42, h: 15 },
      { id: "mid", label: "Treatment", role: "d", shape: "pill", x: 77, y: 50, w: 26, h: 10 },
      { id: "a1", label: "Restored pathway", role: "a", shape: "box", glyph: "receptor", boxed: true, x: 112, y: 30, w: 58, h: 15 },
      { id: "a2", label: "High signal", role: "b", shape: "box", glyph: "chart", boxed: true, x: 120, y: 68, w: 42, h: 15 },
    ],
    edges: [
      { id: "c1", from: "b1", to: "b2", kind: "indirect" },
      { id: "c2", from: "a1", to: "a2", kind: "activate" },
      { id: "c3", pts: [[78, 64], [102, 64]], kind: "flow" },
    ],
    legend: { x: 78, y: 80 } },
  { id: "chem-energy", skill: "chem-materials", mode: "conceptual", name: "反应能级路径", use: "反应物 → 过渡态 → 产物",
    zones: [],
    nodes: [
      { id: "yl", label: "Free energy", role: "n", shape: "text", x: 6, y: 2, w: 30, h: 7 },
      { id: "xl", label: "Reaction coordinate", role: "n", shape: "text", x: 118, y: 101, w: 58, h: 7 },
      { id: "r", label: "Reactants", role: "n", glyph: "level", lp: "above", x: 12, y: 70, w: 28, h: 8 },
      { id: "t1", label: "TS1", role: "c", glyph: "level", lp: "above", x: 46, y: 20, w: 20, h: 8 },
      { id: "i", label: "Intermediate", role: "a", glyph: "level", lp: "above", x: 74, y: 50, w: 32, h: 8 },
      { id: "t2", label: "TS2", role: "c", glyph: "level", lp: "above", x: 112, y: 32, w: 20, h: 8 },
      { id: "p", label: "Products", role: "b", glyph: "level", lp: "above", x: 142, y: 82, w: 32, h: 8 },
    ],
    edges: [
      { id: "ax", pts: [[6, 100], [176, 100]], kind: "axis" }, { id: "ay", pts: [[6, 100], [6, 10]], kind: "axis" },
      { id: "k1", from: "r", to: "t1", kind: "flow", route: "curved" }, { id: "k2", from: "t1", to: "i", kind: "flow", route: "curved" },
      { id: "k3", from: "i", to: "t2", kind: "flow", route: "curved" }, { id: "k4", from: "t2", to: "p", kind: "flow", route: "curved" },
    ] },
  { id: "physics-optics", skill: "physics-device", mode: "conceptual", name: "光路示意", use: "光源 → 元件 → 探测",
    zones: [{ id: "tb", kind: "panel", label: "Optical table", x: 2, y: 28, w: 176, h: 76 }],
    nodes: [
      { id: "las", label: "Laser", role: "n", glyph: "laser", lp: "below", x: 6, y: 44, w: 28, h: 18 },
      { id: "len", label: "Lens", role: "a", glyph: "lens", lp: "below", x: 44, y: 39, w: 12, h: 28 },
      { id: "bs", label: "BS", role: "d", glyph: "cube", lp: "below", x: 72, y: 43.5, w: 14, h: 19 },
      { id: "smp", label: "Sample", role: "b", glyph: "sample", lp: "below", x: 106, y: 43.5, w: 26, h: 19 },
      { id: "det", label: "Detector", role: "c", glyph: "detector", lp: "below", x: 146, y: 43, w: 28, h: 20 },
      { id: "cam", label: "Camera", role: "c", glyph: "detector", lp: "below", x: 68, y: 80, w: 22, h: 18 },
    ],
    edges: [
      { id: "b1", from: "las", to: "len", kind: "beam" }, { id: "b2", from: "len", to: "bs", kind: "beam" },
      { id: "b3", from: "bs", to: "smp", kind: "beam" }, { id: "b4", from: "smp", to: "det", kind: "beam" }, { id: "b5", from: "bs", to: "cam", kind: "beam" },
    ] },
  { id: "concept-hub", skill: "concept-abstract", mode: "conceptual", name: "中心辐射", use: "一个核心观点 + 支撑要素",
    zones: [],
    nodes: [
      { id: "c", label: "Core idea", role: "c", shape: "box", glyph: "bulb", boxed: true, x: 64, y: 45, w: 52, h: 18 },
      { id: "h1", label: "Data", role: "a", shape: "box", glyph: "database", boxed: true, x: 6, y: 9, w: 36, h: 14 },
      { id: "h2", label: "Model", role: "a", shape: "box", glyph: "stack", boxed: true, x: 138, y: 9, w: 36, h: 14 },
      { id: "h3", label: "Training", role: "b", shape: "box", glyph: "flask", boxed: true, x: 6, y: 87, w: 36, h: 14 },
      { id: "h4", label: "Evaluation", role: "b", shape: "box", glyph: "chart", boxed: true, x: 138, y: 87, w: 36, h: 14 },
      { id: "h5", label: "Deployment", role: "d", shape: "box", glyph: "cube", boxed: true, x: 70, y: 91, w: 40, h: 14 },
    ],
    edges: [
      { id: "r1", from: "h1", to: "c", kind: "flow" }, { id: "r2", from: "h2", to: "c", kind: "flow" }, { id: "r3", from: "h3", to: "c", kind: "flow" },
      { id: "r4", from: "h4", to: "c", kind: "flow" }, { id: "r5", from: "h5", to: "c", kind: "flow" },
    ] },
];

const EDGE_KINDS = [
  { id: "activate", name: "激活", glyph: "→" },
  { id: "inhibit", name: "抑制", glyph: "⊣" },
  { id: "transport", name: "转运", glyph: "⇢" },
  { id: "bind", name: "结合", glyph: "–●" },
  { id: "indirect", name: "间接作用", glyph: "⇢" },
  { id: "flow", name: "流程", glyph: "→" },
];

function mechBuild(tpl, styleId, k, opt) {
  opt = opt || {};
  let S = MECH_STYLES[styleId];
  if (opt && opt.palette && styleId !== "line-minimal") {
    const P = MECH_PALETTES[opt.palette];
    const role = (c) => [mix(c, "#FFFFFF", 0.82), mix(c, "#000000", 0.08)];
    S = { ...S, roles: { a: role(P.a), b: role(P.b), c: role(P.c), d: role(P.d), n: [mix(P.n, "#FFFFFF", 0.88), mix(P.n, "#000000", 0.05)] }, accent: P.c, beam: P.c,
      membrane: [mix(P.a, "#FFFFFF", 0.9), mix(P.a, "#FFFFFF", 0.35)], nucleus: [mix(P.d, "#FFFFFF", 0.93), mix(P.d, "#000000", 0.05)] };
  }
  if (opt && opt.weights === "paper") S = { ...S, sw: Math.max(S.sw, 0.35) };
  const W = 180 * k, H = 110 * k;
  const minPx = opt.minPx || 0;
  const fsMM = opt.fontMM || 2.47;
  const PT = 0.3528;
  const wOutline = Math.max(1, 1.0 * PT * k), wEdge = Math.max(1.2, 1.25 * PT * k), wZone = Math.max(1, 0.75 * PT * k);
  const labelPx = (mm) => (opt.hideText ? 0 : Math.max(mm * k, minPx));
  const hidden = opt.hidden || {};
  const labels = opt.labels || {};
  const kinds = opt.kinds || {};
  const routes = opt.routes || {};
  const zones = tpl.zones.filter((z) => !hidden[z.id]).map((z) => {
    const base = { l: z.x * k, t: z.y * k, w: z.w * k, h: z.h * k, bg: "transparent", bd: "0", bt: "", bb: "", r: "0", label: opt.hideText ? "" : z.label, lfs: labelPx(1.9), lfg: S.zl, lfw: 500, lst: "normal", jc: "flex-start", ai: "flex-start", pad: `${1.2 * k}px ${1.6 * k}px`, head: false, headBg: "transparent", hpad: "0", mh: "M0 0", mt: "M0 0", mf: "none", ms: "none", msw: 0, lbg: "transparent" };
    const dash = S.zoneDash ? "dashed" : "solid";
    if (z.kind === "space") return { ...base, lst: "italic" };
    if (z.kind === "compartment") return { ...base, bg: S.zone[0], bd: `${wZone}px ${dash} ${S.zone[1]}`, r: `${S.r * 2 * k}px`, lst: "italic" };
    if (z.kind === "membrane") { const m = bilayer(z.w * k, z.h * k, k); return { ...base, bg: S.membrane[0], jc: "flex-end", ai: "center", pad: `0 ${1.6 * k}px`, lst: "italic", mh: m.heads, mt: m.tails, mf: styleId === "line-minimal" ? "#FFFFFF" : mix(S.membrane[1], "#FFFFFF", 0.25), ms: S.membrane[1], msw: Math.max(0.7, 0.5 * PT * k), headBg: S.membrane[0], hpad: "0 3px" }; }
    if (z.kind === "nucleus") return { ...base, bg: S.nucleus[0], bd: k > 2 ? `${Math.max(3, 1.15 * k)}px double ${S.nucleus[1]}` : `1px ${dash} ${S.nucleus[1]}`, r: "50%", jc: "center", pad: `${2.4 * k}px 0 0`, lst: "italic" };
    if (z.kind === "zoom") return { ...base, bg: S.paper, bd: `${wZone}px dashed ${S.line}`, r: `${S.r * k}px`, lfw: 600 };
    return { ...base, bg: S.panel[0], bd: `${wZone}px ${dash} ${S.panel[1]}`, r: `${S.r * 1.6 * k}px`, lfw: 700, lfg: S.panelHead ? "#FFFFFF" : S.zl, head: S.panelHead, headBg: S.panelHead ? S.panel[1] : "transparent", hpad: S.panelHead ? "1px 6px" : "0", pad: S.panelHead ? `0` : base.pad };
  });
  const byId = {};
  tpl.nodes.forEach((n) => (byId[n.id] = n));
  const nodes = [], faces = [], ghosts = [];
  const d = 2.2;
  const LBL = 4.4;
  tpl.nodes.forEach((n) => {
    if (hidden[n.id]) return;
    const [fill, stroke] = S.roles[n.role];
    const isText = n.shape === "text";
    const isGlyph = !!n.glyph && !n.boxed;
    if (S.iso && !isText && !isGlyph && n.shape === "box") {
      const x = n.x * k, y = n.y * k, w = n.w * k, h = n.h * k, dd = d * k;
      faces.push({ pts: `${x},${y} ${x + w},${y} ${x + w + dd},${y - dd} ${x + dd},${y - dd}`, fill: mix(fill, "#FFFFFF", 0.35), stroke });
      faces.push({ pts: `${x + w},${y} ${x + w + dd},${y - dd} ${x + w + dd},${y + h - dd} ${x + w},${y + h}`, fill: mix(fill, stroke, 0.35), stroke });
    }
    const r = n.shape === "pill" ? "999px" : n.shape === "ellipse" ? "50%" : `${S.r * k}px`;
    const ga = glyphArea(n);
    let g = { layers: [], badges: [] };
    if (n.glyph) g = drawGlyph(n.glyph, ga.w * k, ga.h * k, fill, stroke, S, k);
    const L = (i) => g.layers[i] || { d: "M0 0", fill: "none", stroke: "none" };
    const B = (i) => g.badges[i] || { x: -99, y: -99 };
    let jc = "center", ai = "center", pad = "0";
    if (n.glyph) {
      if (n.lp === "below") { ai = "flex-end"; pad = `0 0 ${0.4 * k}px`; }
      else if (n.lp === "above") { ai = "flex-start"; pad = `${0.6 * k}px 0 0`; }
      else if (n.lp === "right" || n.boxed) { jc = "flex-start"; pad = `0 0 0 ${(ga.x - n.x + ga.w + 1.2) * k}px`; }
      else if (n.lp === "left") { jc = "flex-end"; ai = "flex-start"; pad = `${2.4 * k}px ${(n.gw + 0.8) * k}px 0 0`; }
    }
    nodes.push({
      id: n.id, l: n.x * k, t: n.y * k, w: n.w * k, h: n.h * k,
      bg: isText || isGlyph ? "transparent" : fill, bd: isText || isGlyph ? "0" : `${S.sketch ? wOutline * 1.3 : wOutline}px solid ${stroke}`,
      r, shadow: isText || isGlyph ? "none" : S.shadow, label: opt.hideText ? "" : labels[n.id] || n.label,
      fs: labelPx(isText ? 2.1 : fsMM), fg: isText ? S.zl : S.fg, fw: isText ? 500 : S.fw, font: S.font, fst: isText ? "italic" : "normal",
      outline: opt.sel === n.id ? "2px solid #1F4FB8" : "none", jc, ai, pad,
      gx: (ga.x - n.x) * k, gy: (ga.y - n.y) * k, gw: n.glyph ? ga.w * k : 0, gh: n.glyph ? ga.h * k : 0, gsw: wOutline,
      l1d: L(0).d, l1f: L(0).fill, l1s: L(0).stroke, l2d: L(1).d, l2f: L(1).fill, l2s: L(1).stroke, l3d: L(2).d, l3f: L(2).fill, l3s: L(2).stroke,
      b1x: B(0).x, b1y: B(0).y, b2x: B(1).x, b2y: B(1).y, br: 1.35 * k, bfs: Math.max(1.8 * k, opt.hideText ? 0 : 6), bo: g.badges.length && !opt.hideText ? 1 : 0, bo2: g.badges.length > 1 && !opt.hideText ? 1 : 0,
    });
    if (S.sketch && !isText && !isGlyph) ghosts.push({ l: n.x * k + 0.5 * k, t: n.y * k - 0.35 * k, w: n.w * k - 0.4 * k, h: n.h * k + 0.5 * k, bd: `1px solid ${stroke}`, r });
  });
  const edges = [], mids = [];
  const used = {};
  tpl.edges.forEach((e) => {
    if (e.kind === "none") return;
    if (e.from && (hidden[e.from] || hidden[e.to] || hidden[e.id])) return;
    if (!e.from && hidden[e.id]) return;
    const kind = kinds[e.id] || e.kind;
    const route = routes[e.id] || e.route || "straight";
    let pts;
    if (e.pts) pts = e.pts.map(([x, y]) => [x * k, y * k]);
    else pts = connect(anchorOf(byId[e.from]), anchorOf(byId[e.to]), route, k);
    const color = kind === "inhibit" ? S.accent : kind === "beam" ? S.beam : kind === "guide" || kind === "axis" ? mix(S.line, "#FFFFFF", kind === "guide" ? 0.45 : 0) : S.line;
    const sw = kind === "beam" ? Math.max(1.4, 1.8 * PT * k) : kind === "guide" ? Math.max(1, 0.6 * PT * k) : wEdge;
    const dash = kind === "indirect" || kind === "transport" || kind === "guide" ? `${1.4 * k} ${1 * k}` : "none";
    const g = geom(pts, route, kind, k, S.sketch);
    if (["activate", "inhibit", "transport", "bind", "indirect", "flow"].includes(kind)) used[kind] = true;
    edges.push({ id: e.id, d: g.d, d2: g.d2, stroke: opt.selEdge === e.id ? "#1F4FB8" : color, sw: opt.selEdge === e.id ? sw + 1.2 : sw, dash, head: g.head, headFill: opt.selEdge === e.id ? "#1F4FB8" : color, bar: g.bar, barW: (opt.selEdge === e.id ? sw + 1.2 : sw) * 1.7, op2: S.sketch ? 0.55 : 0 });
    if (e.from) mids.push({ id: e.id, l: g.mid[0] - 7, t: g.mid[1] - 7, on: opt.selEdge === e.id });
  });
  const kindsUsed = EDGE_KINDS.filter((x) => used[x.id]);
  const legendOn = opt.legend !== false && tpl.legend && kindsUsed.filter((x) => x.id !== "flow").length >= 2 && !opt.hideText;
  const legend = { show: !!legendOn, l: tpl.legend ? tpl.legend.x * k : 0, t: tpl.legend ? tpl.legend.y * k : 0, fs: labelPx(1.9), fg: S.fg, font: S.font,
    items: kindsUsed.filter((x) => x.id !== "flow").map((x) => { const gk = 6 * k; const g = geom([[0, gk * 0.35], [gk, gk * 0.35]], "straight", x.id, k, false); return { name: legendName(x.id), d: g.d, head: g.head, bar: g.bar, w: gk, h: gk * 0.7, stroke: x.id === "inhibit" ? S.accent : S.line, sw: wEdge, dash: x.id === "indirect" || x.id === "transport" ? `${1.4 * k} ${1 * k}` : "none" }; }) };
  return { W, H, paper: S.paper, zones, faces, nodes, ghosts, edges, mids, legend, font: S.font };
}

function legendName(id) {
  return { activate: "Activation", inhibit: "Inhibition", transport: "Translocation", bind: "Binding", indirect: "Indirect", flow: "Flow" }[id];
}

function mix(a, b, t) {
  if (a === "transparent") return b;
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function clipBox(n, tx, ty, k) {
  const cx = (n.x + n.w / 2) * k, cy = (n.y + n.h / 2) * k;
  const dx = tx - cx, dy = ty - cy;
  const hw = (n.w / 2 + 0.8) * k, hh = (n.h / 2 + 0.8) * k;
  const t = Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
  return [cx + dx * t, cy + dy * t];
}

function connect(a, b, route, k) {
  const ac = [(a.x + a.w / 2) * k, (a.y + a.h / 2) * k], bc = [(b.x + b.w / 2) * k, (b.y + b.h / 2) * k];
  if (route === "orthogonal") {
    const horiz = Math.abs(bc[0] - ac[0]) > Math.abs(bc[1] - ac[1]);
    if (horiz) {
      const s = [ac[0] + Math.sign(bc[0] - ac[0]) * (a.w / 2 + 0.8) * k, ac[1]];
      const e = [bc[0], bc[1] - Math.sign(bc[1] - ac[1]) * (b.h / 2 + 0.8) * k];
      if (Math.abs(bc[1] - ac[1]) < 2 * k) return [s, [bc[0] - Math.sign(bc[0] - ac[0]) * (b.w / 2 + 0.8) * k, ac[1]]];
      return [s, [bc[0], ac[1]], e];
    }
    const s = [ac[0], ac[1] + Math.sign(bc[1] - ac[1]) * (a.h / 2 + 0.8) * k];
    const e = [bc[0] - Math.sign(bc[0] - ac[0]) * (b.w / 2 + 0.8) * k, bc[1]];
    if (Math.abs(bc[0] - ac[0]) < 2 * k) return [s, [ac[0], bc[1] - Math.sign(bc[1] - ac[1]) * (b.h / 2 + 0.8) * k]];
    return [s, [ac[0], bc[1]], e];
  }
  return [clipBox(a, bc[0], bc[1], k), clipBox(b, ac[0], ac[1], k)];
}

function geom(pts, route, kind, k, sketch) {
  const f = (v) => v.toFixed(1);
  let s = pts[0], e = pts[pts.length - 1];
  let prev = pts[pts.length - 2];
  let ctrl = null;
  if (route === "curved" && pts.length === 2) {
    const mx = (s[0] + e[0]) / 2, my = (s[1] + e[1]) / 2;
    const dx = e[0] - s[0], dy = e[1] - s[1];
    ctrl = dy < 0 ? [mx - dx * 0.25, e[1]] : [mx + dx * 0.25, s[1]];
    prev = ctrl;
  }
  const ux0 = e[0] - prev[0], uy0 = e[1] - prev[1];
  const len = Math.hypot(ux0, uy0) || 1;
  const ux = ux0 / len, uy = uy0 / len, vx = -uy, vy = ux;
  const a = 2.5 * k;
  const hasHead = ["activate", "transport", "indirect", "flow", "beam", "axis"].includes(kind);
  const end = hasHead ? [e[0] - ux * a * 0.85, e[1] - uy * a * 0.85] : e;
  let head = "0,0 0,0 0,0", bar = "M0 0";
  if (hasHead) {
    const aa = kind === "beam" ? a * 0.8 : a;
    const bx = e[0] - ux * aa, by = e[1] - uy * aa;
    head = `${f(e[0])},${f(e[1])} ${f(bx + vx * aa * 0.45)},${f(by + vy * aa * 0.45)} ${f(bx - vx * aa * 0.45)},${f(by - vy * aa * 0.45)}`;
  } else if (kind === "inhibit") {
    const b = 1.7 * k;
    bar = `M${f(e[0] + vx * b)} ${f(e[1] + vy * b)} L${f(e[0] - vx * b)} ${f(e[1] - vy * b)}`;
  } else if (kind === "bind") {
    const r = 0.9 * k, cx = e[0] - ux * r, cy = e[1] - uy * r;
    head = Array.from({ length: 10 }, (_, i) => { const t = (i / 10) * Math.PI * 2; return `${f(cx + Math.cos(t) * r)},${f(cy + Math.sin(t) * r)}`; }).join(" ");
  }
  let d;
  const body = pts.slice(0, -1).concat([end]);
  if (ctrl) d = `M${f(s[0])} ${f(s[1])} Q${f(ctrl[0])} ${f(ctrl[1])} ${f(end[0])} ${f(end[1])}`;
  else if (sketch && body.length === 2) {
    const mx = (s[0] + end[0]) / 2 + vx * 0.7 * k, my = (s[1] + end[1]) / 2 + vy * 0.7 * k;
    d = `M${f(s[0])} ${f(s[1])} Q${f(mx)} ${f(my)} ${f(end[0])} ${f(end[1])}`;
  } else d = "M" + body.map((p) => `${f(p[0])} ${f(p[1])}`).join(" L");
  const d2 = sketch && !ctrl ? "M" + body.map((p, i) => `${f(p[0] + (i % 2 ? -0.4 : 0.4) * k)} ${f(p[1] + 0.35 * k)}`).join(" L") : "M0 0";
  const mi = Math.floor((pts.length - 1) / 2);
  const mid = ctrl ? [(s[0] + 2 * ctrl[0] + e[0]) / 4, (s[1] + 2 * ctrl[1] + e[1]) / 4] : [(pts[mi][0] + pts[mi + 1][0]) / 2, (pts[mi][1] + pts[mi + 1][1]) / 2];
  return { d, d2, head, bar, mid };
}

function glyphArea(n) {
  if (!n.glyph) return n;
  const L = 4.4;
  if (n.boxed) { const s = n.h - 3; return { x: n.x + 1.6, y: n.y + 1.5, w: s, h: s }; }
  if (n.lp === "below") return { x: n.x, y: n.y, w: n.w, h: n.h - L };
  if (n.lp === "above") return { x: n.x, y: n.y + n.h - 2.2, w: n.w, h: 2.2 };
  if (n.lp === "right") return { x: n.x, y: n.y, w: n.gw, h: n.h };
  if (n.lp === "left") return { x: n.x + n.w - n.gw, y: n.y, w: n.gw, h: n.h };
  return n;
}

const F1 = (v) => v.toFixed(1);
function pCircle(cx, cy, r) { return `M${F1(cx - r)} ${F1(cy)}a${F1(r)} ${F1(r)} 0 1 0 ${F1(2 * r)} 0a${F1(r)} ${F1(r)} 0 1 0 ${F1(-2 * r)} 0Z`; }
function pRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${F1(x + r)} ${F1(y)}H${F1(x + w - r)}A${F1(r)} ${F1(r)} 0 0 1 ${F1(x + w)} ${F1(y + r)}V${F1(y + h - r)}A${F1(r)} ${F1(r)} 0 0 1 ${F1(x + w - r)} ${F1(y + h)}H${F1(x + r)}A${F1(r)} ${F1(r)} 0 0 1 ${F1(x)} ${F1(y + h - r)}V${F1(y + r)}A${F1(r)} ${F1(r)} 0 0 1 ${F1(x + r)} ${F1(y)}Z`;
}
function pSmooth(pts) {
  const n = pts.length;
  let d = `M${F1(pts[0][0])} ${F1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${F1(c1[0])} ${F1(c1[1])} ${F1(c2[0])} ${F1(c2[1])} ${F1(p2[0])} ${F1(p2[1])}`;
  }
  return d + "Z";
}
function pBlob(cx, cy, rx, ry, seed) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    const j = 1 + 0.07 * Math.sin(3 * t + seed) + 0.04 * Math.cos(5 * t + seed * 2);
    pts.push([cx + Math.cos(t) * rx * j, cy + Math.sin(t) * ry * j]);
  }
  return pSmooth(pts);
}
function pHex(cx, cy, r) {
  return "M" + Array.from({ length: 6 }, (_, i) => { const t = Math.PI / 6 + (i * Math.PI) / 3; return `${F1(cx + Math.cos(t) * r)} ${F1(cy + Math.sin(t) * r)}`; }).join("L") + "Z";
}

function bilayer(w, h, k) {
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

function drawGlyph(kind, w, h, fill, stroke, S, k) {
  const soft = mix(fill === "#FFFFFF" ? mix(stroke, "#FFFFFF", 0.8) : fill, "#FFFFFF", 0.0);
  const deep = fill === "#FFFFFF" ? mix(stroke, "#FFFFFF", 0.55) : mix(fill, stroke, 0.35);
  const lay = (d, f, s2) => ({ d, fill: f, stroke: s2 });
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
    const f = (i) => pRect(o * i, o * (2 - i) * 0.8, fw, fh, 0.6 * k);
    const scene = (i) => { const x = o * i, y = o * (2 - i) * 0.8; return `M${F1(x + fw * 0.08)} ${F1(y + fh * 0.88)}L${F1(x + fw * 0.38)} ${F1(y + fh * 0.45)}L${F1(x + fw * 0.58)} ${F1(y + fh * 0.7)}L${F1(x + fw * 0.72)} ${F1(y + fh * 0.55)}L${F1(x + fw * 0.92)} ${F1(y + fh * 0.88)}Z` + pCircle(x + fw * 0.75, y + fh * 0.28, fh * 0.1); };
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
    const chain = (cx) => {
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
function anchorOf(n) { return n.boxed ? n : glyphArea(n); }

function snowPath(cx, cy, r) {
  let d = "";
  for (let i = 0; i < 3; i++) { const t = (i * Math.PI) / 3; d += `M${F1(cx - Math.cos(t) * r)} ${F1(cy - Math.sin(t) * r)}L${F1(cx + Math.cos(t) * r)} ${F1(cy + Math.sin(t) * r)}`; }
  return d;
}
function flamePath(cx, top, r) {
  const h = r * 2.2, b = top + h;
  return `M${F1(cx - r * 0.1)} ${F1(top)}C${F1(cx + r * 0.9)} ${F1(top + h * 0.35)} ${F1(cx + r * 1.05)} ${F1(top + h * 0.7)} ${F1(cx + r * 0.6)} ${F1(b - h * 0.08)}C${F1(cx + r * 0.3)} ${F1(b)} ${F1(cx - r * 0.45)} ${F1(b)} ${F1(cx - r * 0.75)} ${F1(b - h * 0.12)}C${F1(cx - r * 1.05)} ${F1(top + h * 0.62)} ${F1(cx - r * 0.65)} ${F1(top + h * 0.5)} ${F1(cx - r * 0.45)} ${F1(top + h * 0.3)}C${F1(cx - r * 0.3)} ${F1(top + h * 0.48)} ${F1(cx - r * 0.1)} ${F1(top + h * 0.5)} ${F1(cx)} ${F1(top + h * 0.42)}C${F1(cx + r * 0.1)} ${F1(top + h * 0.28)} ${F1(cx)} ${F1(top + h * 0.12)} ${F1(cx - r * 0.1)} ${F1(top)}Z`;
}
