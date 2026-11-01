import { describe, expect, it } from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const fixture=JSON.parse(readFileSync(resolve(process.cwd(),"../backend/src/test/resources/diagram-doc-v1.json"),"utf8"));
import type { DiagramDoc } from "./model";
import { alignSelection, commit, diagramDraftKey, duplicateSelection, history, moveSelection, readDiagramDraft, redo, removeSelection, undo, withinBounds } from "./editing";
import { layoutDiagram } from "./layout";
import {edgePoints,nodeLayout} from "./render/geometry";
const doc=()=>structuredClone(fixture) as DiagramDoc;
describe("diagram edits preserve reversible structure and millimetres",()=>{
  it("undoes style switches without moving nodes and invalidates redo after new edits",()=>{
    const original=doc(),h=history(original),changed=doc();changed.style.preset="sketch";
    const next=commit(h,changed);expect(next.present.nodes).toEqual(original.nodes);expect(undo(next).present).toEqual(original);expect(redo(undo(next)).present).toEqual(changed);
    const other=doc();other.style.preset="isometric";expect(commit(undo(next),other).future).toEqual([]);expect(commit(h,original)).toBe(h);
  });
  it("moves a whole zone with its nodes and clamps the whole group at the canvas boundary",()=>{
    const original=doc(),moved=moveSelection(original,new Set(["z1"]),3,4);expect(moved.nodes[0].x-original.nodes[0].x).toBe(3);expect(moved.nodes[0].y-original.nodes[0].y).toBe(4);expect(withinBounds(moved)).toBe(true);
    expect(withinBounds(moveSelection(original,new Set(["z1","n1"]),999,-999))).toBe(true);expect(original).toEqual(doc());
  });
  it("deletes dangling edges/annotations and detaches nodes when removing zones",()=>{
    const d=doc();d.annotations.push({id:"a1",kind:"note",target:"n1",text:"test"});
    const removed=removeSelection(d,new Set(["n1"]));expect(removed.edges.some(e=>e.from==="n1"||e.to==="n1")).toBe(false);expect(removed.annotations).toEqual([]);
    expect(removeSelection(d,new Set(["z1"])).nodes.every(n=>n.zone===null)).toBe(true);
  });
  it("duplicates zones and contained nodes with internal edge and annotation remapping",()=>{
    const d=doc();d.annotations.push({id:"a1",kind:"note",target:"n1",text:"test"});const next=duplicateSelection(d,new Set(["z1"]));
    expect(next.zones).toHaveLength(2);expect(next.nodes).toHaveLength(6);expect(next.edges).toHaveLength(4);expect(next.annotations).toHaveLength(2);expect(next.annotations[1].target).not.toBe("n1");expect(withinBounds(next)).toBe(true);
    expect(new Set([...next.nodes,...next.zones,...next.edges,...next.annotations].map(n=>n.id)).size).toBe(14);
  });
  it("aligns and distributes selected nodes without changing unrelated structure",()=>{
    const d=doc(),ids=new Set(d.nodes.map(n=>n.id)),next=alignSelection(d,ids,"horizontal");expect(next.edges).toEqual(d.edges);expect(withinBounds(next)).toBe(true);expect(alignSelection(d,ids,"top").nodes.every(n=>n.y===35)).toBe(true);
  });
  it("uses a separate draft key, keeps old base revision, and handles broken/unavailable storage",()=>{
    expect(diagramDraftKey(1,2)).toBe("figtide-diagram-draft-v1:1:2");expect(readDiagramDraft({getItem:()=>JSON.stringify({doc:doc(),revision:2})},"key")?.revision).toBe(2);
    expect(readDiagramDraft({getItem:()=>"{"},"key")).toBeNull();expect(readDiagramDraft({getItem:()=>{throw new Error("blocked");}},"key")).toBeNull();expect(readDiagramDraft({getItem:()=>JSON.stringify({doc:doc(),revision:0})},"key")).toBeNull();
  });
  it("lays out deterministically with no changes to semantics or input, rejecting insufficient space",()=>{
    const d=doc(),next=layoutDiagram(d);expect(next).toEqual(layoutDiagram(d));expect(withinBounds(next)).toBe(true);expect(next.edges).toEqual(d.edges);expect(d).toEqual(doc());
    const narrow=doc();narrow.zones[0].w=10;expect(()=>layoutDiagram(narrow)).toThrow(/放不下/);
  });
  it("connects scientific glyph bodies rather than the reserved label strip",()=>{
    const d=doc();d.nodes[0]={...d.nodes[0],kind:"glyph",glyph:"receptor",h:24,label_pos:"below"};
    const area=nodeLayout(d.nodes[0]),points=edgePoints(d,d.edges[0]);expect(area.anchor.y+area.anchor.h).toBeLessThan(area.label.y);expect(points[0].y).toBeLessThan(area.label.y);
    d.nodes[0].label_pos="right";const right=nodeLayout(d.nodes[0]);expect(right.anchor.x+right.anchor.w).toBeLessThan(right.label.x);
    d.nodes[0].boxed=true;expect(nodeLayout(d.nodes[0]).anchor).toEqual({x:d.nodes[0].x,y:d.nodes[0].y,w:d.nodes[0].w,h:d.nodes[0].h});
  });
});
