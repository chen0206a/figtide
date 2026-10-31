import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
import {drawGlyph,glyphKinds,glyphMarkup,membraneMarkup,nuclearEnvelopeMarkup} from "./glyphs";
import type {DiagramStyle} from "../model";
const root=resolve(process.cwd(),"../backend/src/main/resources/diagram");
const catalog=JSON.parse(readFileSync(resolve(root,"glyphs.json"),"utf8")) as {id:string}[];
describe.each(["nature-flat","soft-illustration","line-minimal","conference-framework","isometric","sketch"])("%s native glyphs",id=>{
  const style=JSON.parse(readFileSync(resolve(root,`styles/${id}.json`),"utf8")) as DiagramStyle;
  it("renders phospholipid bilayers and double nuclear membranes as layered vectors",()=>{expect(membraneMarkup(100,8,style)).toMatchSnapshot("bilayer");expect(nuclearEnvelopeMarkup(40,30,style)).toMatchSnapshot("nuclear envelope");});
  it.each(glyphKinds)("renders %s as deterministic multi-layer vectors",kind=>{
    const drawing=drawGlyph(kind,24,18,style),markup=glyphMarkup(kind,24,18,style);
    expect(drawing.layers.length).toBeGreaterThanOrEqual(1);expect(drawing.layers.some(l=>l.fill!=="none"||l.stroke!=="none")).toBe(true);expect(markup).toEqual(glyphMarkup(kind,24,18,style));expect(markup).not.toMatch(/NaN|Infinity|undefined|<image|<script|https?:/);
    const svg=new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,"image/svg+xml");expect(svg.querySelector("parsererror")).toBeNull();if(kind==="phospho"||kind==="number"){expect(svg.querySelector("circle")?.getAttribute("fill")).toBe("#F0C040");expect(svg.querySelector("text")?.getAttribute("font-weight")).toBe("700");}else expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(drawing.bounds.x).toBeGreaterThanOrEqual(0);expect(drawing.bounds.x+drawing.bounds.w).toBeLessThanOrEqual(24.001);
    if(style.fill==="outline")expect(drawing.layers.every(l=>["none","#FFFFFF"].includes(l.fill))).toBe(true);
    expect(markup).toMatchSnapshot();
  });
});
it("implements every server-catalog glyph and rejects unknown IDs and invalid dimensions",()=>{
  expect([...glyphKinds].sort()).toEqual(catalog.map(g=>g.id).sort());
  const style=JSON.parse(readFileSync(resolve(root,"styles/nature-flat.json"),"utf8")) as DiagramStyle;
  expect(()=>drawGlyph("unknown" as never,20,20,style)).toThrow();expect(()=>drawGlyph("protein",NaN,20,style)).toThrow();expect(()=>drawGlyph("protein",20,0,style)).toThrow();
});
