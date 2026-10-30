import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDiagram,edgeSymbol } from "./renderDiagram";
import type { DiagramDoc, DiagramStyle } from "../model";
const resource=(path:string)=>JSON.parse(readFileSync(resolve(process.cwd(),`../backend/src/main/resources/diagram/${path}.json`),"utf8"));
const styles=["nature-flat","soft-illustration","line-minimal","conference-framework","isometric","sketch"];
describe.each(styles)("%s renderer",preset=>{
  it.each(readdirSync(resolve(process.cwd(),"../backend/src/main/resources/diagram/templates")).filter(f=>f.endsWith(".json")).map(f=>f.slice(0,-5)))("has stable parseable finished-size SVG for %s",template=>{
    const doc=resource(`templates/${template}`).documents.en as DiagramDoc,style=resource(`styles/${preset}`) as DiagramStyle;
    doc.style.preset=preset;const svg=renderDiagram(doc,style),parsed=new DOMParser().parseFromString(svg,"image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    expect(parsed.documentElement.getAttribute("width")).toBe("180mm");expect(parsed.querySelectorAll("[data-node-id]")).toHaveLength(doc.nodes.length);expect(parsed.querySelectorAll("[data-edge-id]")).toHaveLength(doc.edges.length);
    expect(svg).toEqual(renderDiagram(doc,style));expect(svg).toMatchSnapshot();
  });
});
it("escapes labels instead of creating markup, and switches presets without changing geometry",()=>{
  const doc=resource("templates/pipeline").documents.en as DiagramDoc,style=resource("styles/nature-flat") as DiagramStyle;
  doc.nodes[0].label='<script>alert("x")</script> & 中文';const before=structuredClone(doc);
  const svg=renderDiagram(doc,style);expect(new DOMParser().parseFromString(svg,"image/svg+xml").querySelector("script,image,foreignObject")).toBeNull();expect(svg).toContain("&lt;");expect(doc).toEqual(before);
});

it("uses explicit physical arrowhead geometry that PDF cannot rescale as markers",()=>{
  expect(edgeSymbol({x:0,y:0},{x:10,y:0},"flow","#17212B",.44)).toContain('M10 0 L7.5 1.125 L7.5 -1.125 Z');
  expect(edgeSymbol({x:0,y:0},{x:10,y:0},"inhibit","#D55E00",.4)).toContain('stroke-width="0.68"');
  expect(edgeSymbol({x:0,y:0},{x:10,y:0},"bind","#17212B",.44)).toContain('cx="9.1"');
  const doc=resource("templates/mechanism").documents.en as DiagramDoc;
  expect(renderDiagram(doc,resource("styles/nature-flat"))).not.toContain('marker-end');
});
it("opens old documents without palette using exactly the default palette",()=>{
  const doc=resource("templates/mechanism").documents.en as DiagramDoc,style=resource("styles/nature-flat");
  delete doc.style.palette;const old=renderDiagram(doc,style);doc.style.palette="okabe-ito";expect(renderDiagram(doc,style)).toBe(old);
});

it("keeps the flagship inhibitor no wider than its neighbouring JAK protein",()=>{
  for(const language of ["en","zh"]){const doc=resource("templates/mechanism").documents[language] as DiagramDoc;expect(doc.nodes.find(n=>n.glyph==="small-molecule")!.w).toBeLessThanOrEqual(doc.nodes.find(n=>n.label==="JAK")!.w);}
});
