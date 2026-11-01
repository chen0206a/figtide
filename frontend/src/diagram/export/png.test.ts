import {expect,it} from "vitest";
import {pngDimensions,pngWithDpi} from "./png";
const pixel=()=>new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64"));
function chunks(bytes:Uint8Array){const out:{type:string;data:Uint8Array}[]=[];for(let i=8;i<bytes.length;){const n=new DataView(bytes.buffer,bytes.byteOffset+i,4).getUint32(0);out.push({type:String.fromCharCode(...bytes.slice(i+4,i+8)),data:bytes.slice(i+8,i+8+n)});i+=n+12;}return out;}
it("converts finished millimetres to 300/600dpi pixels and bounds memory",()=>{
  expect(pngDimensions(180,110,300)).toEqual({width:2126,height:1299});expect(pngDimensions(180,110,600)).toEqual({width:4252,height:2598});
  expect(()=>pngDimensions(2000,2000,600)).toThrow(/像素过大/);expect(()=>pngDimensions(180,110,96)).toThrow();expect(()=>pngDimensions(NaN,110,300)).toThrow();
});
it("writes exactly one physical-resolution chunk and preserves compressed pixels",()=>{
  const original=pixel(),encoded=pngWithDpi(original,300),a=chunks(original),b=chunks(encoded),physical=b.filter(c=>c.type==="pHYs");
  expect(physical).toHaveLength(1);expect(new DataView(physical[0].data.buffer).getUint32(0)).toBe(11811);expect(physical[0].data[8]).toBe(1);
  expect(b.find(c=>c.type==="IDAT")?.data).toEqual(a.find(c=>c.type==="IDAT")?.data);
  const replaced=chunks(pngWithDpi(encoded,600)).filter(c=>c.type==="pHYs");expect(replaced).toHaveLength(1);expect(new DataView(replaced[0].data.buffer).getUint32(0)).toBe(23622);
  expect(()=>pngWithDpi(new Uint8Array([1,2,3]),300)).toThrow();expect(()=>pngWithDpi(original.slice(0,20),300)).toThrow();
});
