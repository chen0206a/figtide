/** Diagram schema v1. Every coordinate and dimension is in finished millimetres. */
export type DiagramStyle = {
  id: string; name: string; zone_colors: string[]; accent_colors: string[];
  text_color: string; line_color: string; font_family: string;
  font_size_pt: number; line_width_pt: number; radius_mm: number;
  arrow: "open" | "filled"; fill: "flat" | "soft" | "outline";
  shadow: boolean; sketch: boolean; iso: boolean;
};
export type DiagramOverrides = Partial<Omit<DiagramStyle, "id" | "name" | "arrow">>;
export type DiagramRect = {x: number; y: number; w: number; h: number};
export type DiagramZone = DiagramRect & {
  id: string; kind: "compartment" | "membrane" | "nucleus" | "panel" | "zoom";
  label: string; zoom_of: string | null;
};
export type DiagramNode = DiagramRect & {
  id: string; kind: "box" | "pill" | "ellipse" | "cell" | "molecule" | "text";
  label: string; zone: string | null; icon: null;
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
  style: {preset: string; overrides: DiagramOverrides}; label_language: "en" | "zh";
  zones: DiagramZone[]; nodes: DiagramNode[]; edges: DiagramEdge[];
  annotations: {id: string; kind: "panel_letter" | "callout" | "note"; target: string; text: string}[];
  legend: {mode: "auto" | "off"; position: "bottom-right" | "bottom-left" | "top-right" | "top-left"};
  meta: {skill: string | null; skill_version: string | null; template: string | null; brief: string; facts: string[]};
};
export type DiagramRecord = {id: number; project_id: number; name: string; revision: number; version_count: number; archived: boolean; doc: DiagramDoc};
export type DiagramTemplate = {id: string; name: string; pattern: string; documents: {en: DiagramDoc; zh: DiagramDoc}};
export type DiagramCatalog = {schema_version: 1; styles: DiagramStyle[]; templates: DiagramTemplate[]; skills: unknown[]; icons: unknown[]; journals: {id: string; name: string; single_column_mm: number | null; double_column_mm: number | null}[]};
export const effectiveStyle = (doc: DiagramDoc, style: DiagramStyle): DiagramStyle => ({...style, ...doc.style.overrides});
