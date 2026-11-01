/** Diagram schema v1. Every coordinate and dimension is in finished millimetres. */
export type DiagramStyle = {
  id: string; name: string; zone_colors: string[]; accent_colors: string[];
  text_color: string; line_color: string; font_family: string;
  font_size_pt: number; line_width_pt: number; radius_mm: number;
  arrow: "open" | "filled"; fill: "flat" | "soft" | "outline";
  shadow: boolean; sketch: boolean; iso: boolean;
};
export type DiagramOverrides = Partial<Omit<DiagramStyle, "id" | "name">>;
export type DiagramRect = {x: number; y: number; w: number; h: number};
export type DiagramZone = DiagramRect & {
  id: string; kind: "compartment" | "membrane" | "nucleus" | "panel" | "zoom";
  label: string; zoom_of: string | null;
};
export type DiagramNode = DiagramRect & {
  id: string; kind: "box" | "pill" | "ellipse" | "glyph" | "icon" | "text";
  glyph?: string | null; label_pos?: "center"|"below"|"above"|"left"|"right";
  boxed?: boolean; badges?: string[];
  label: string; zone: string | null; icon: string|null;
  role: "actor" | "process" | "data" | "model" | "output" | "note";
  style_ref: DiagramNode["role"] | null;
};
export type DiagramEdge = {
  id: string; from: string; to: string;
  kind: "flow" | "activate" | "inhibit" | "transport" | "bind" | "indirect";
  label: string; route: "straight" | "orthogonal" | "curved";
};
export type DiagramDoc = {
  schema_version: 1; canvas: {width_mm: number; height_mm: number; background: string};
  style: {preset: string; palette?:string; role_colors?:Record<DiagramNode["role"],string>; overrides: DiagramOverrides}; label_language: "en" | "zh";
  zones: DiagramZone[]; nodes: DiagramNode[]; edges: DiagramEdge[];
  annotations: {id: string; kind: "panel_letter" | "callout" | "note"; target: string; text: string}[];
  legend: {mode: "auto" | "off"; position: "bottom-right" | "bottom-left" | "top-right" | "top-left"};
  meta: {skill: string | null; skill_version: string | null; template: string | null; brief: string; facts: string[]; source_text?:string; fact_sources?:{text:string;quote:string}[]; ai_labels?:{id:string;label:string}[]; include_icon_attribution?:boolean};
};
export type DiagramRecord = {id: number; project_id: number; name: string; revision: number; version_count: number; archived: boolean; doc: DiagramDoc};
export type DiagramTemplate = {id: string; name: string; pattern: string; documents: {en: DiagramDoc; zh: DiagramDoc}};
export type PaletteAudit = {id:string;preset:string;safe:boolean;threshold:number;outlines:Record<string,string>;failing_pairs:{roles:string[];colors:string[];minimum_delta_e:number;delta_e:number[]}[]};
export type DiagramIcon={id:string;name:{en:string;zh:string};tags:string[];category:string;source:string;author:string;license:"CC0-1.0"|"CC-BY-4.0";source_url:string;upstream_commit:string;modified:boolean;sha256:string;upstream_sha256:string;modifications:string[]};
export type DiagramSkill = {id:string;version:string;name:string;description:string;patterns:string[];templates:string[];recommended_styles:string[];allowed_nodes:string[];allowed_edges:string[];icon_tags:string[];checks:Record<string,boolean>};
export type DiagramCatalog = {schema_version: 1; palette_audits?:PaletteAudit[]; styles: DiagramStyle[]; templates: DiagramTemplate[]; skills: DiagramSkill[]; icons: DiagramIcon[]; glyphs:{id:string;name:string;category:string}[]; journals: {id: string; name: string; single_column_mm: number | null; double_column_mm: number | null}[]};
export const effectiveStyle = (doc: DiagramDoc, style: DiagramStyle): DiagramStyle => ({...style, ...doc.style.overrides});
