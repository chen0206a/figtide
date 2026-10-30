const signature=[137,80,78,71,13,10,26,10];
export function pngDimensions(widthMm:number,heightMm:number,dpi:number) {
  if(![300,600].includes(dpi)||![widthMm,heightMm].every(v=>Number.isFinite(v)&&v>0))throw new Error("PNG尺寸或分辨率无效");
  const width=Math.round(widthMm/25.4*dpi),height=Math.round(heightMm/25.4*dpi);
  if(width>16384||height>16384||width*height>64000000)throw new Error("导出像素过大，请使用较低分辨率、缩小成品尺寸或选择SVG/PDF。");
  return {width,height};
}
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return (crc^0xffffffff)>>>0;}
/** Preserve all image chunks while recording the requested physical resolution, not canvas's 96dpi. */
export function pngWithDpi(bytes:Uint8Array,dpi:number):Uint8Array {
  if(![300,600].includes(dpi)||!signature.every((v,i)=>bytes[i]===v))throw new Error("无效PNG");
  const physical=new Uint8Array(21),view=new DataView(physical.buffer),ppm=Math.round(dpi/.0254);
  view.setUint32(0,9);physical.set([112,72,89,115],4);view.setUint32(8,ppm);view.setUint32(12,ppm);physical[16]=1;view.setUint32(17,crc32(physical.slice(4,17)));
  const chunks:Uint8Array[]=[bytes.slice(0,8)];let offset=8,inserted=false,ended=false;
  while(offset<bytes.length){if(offset+12>bytes.length)throw new Error("PNG条目损坏");const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0),end=offset+12+length;if(end>bytes.length)throw new Error("PNG条目损坏");const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(type==="IDAT"&&!inserted){chunks.push(physical);inserted=true;}if(type!=="pHYs")chunks.push(bytes.slice(offset,end));if(type==="IEND")ended=true;offset=end;}
  if(!inserted||!ended)throw new Error("PNG缺少图像条目");const total=chunks.reduce((n,c)=>n+c.length,0),out=new Uint8Array(total);offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}
export async function rasterPng(svg:string,widthMm:number,heightMm:number,dpi:number):Promise<Blob> {
  const {width,height}=pngDimensions(widthMm,heightMm,dpi);await document.fonts.ready;
  const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
  try {const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("无法渲染机制图SVG"));image.src=url;});const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const context=canvas.getContext("2d");if(!context)throw new Error("浏览器不支持PNG导出");context.drawImage(image,0,0,width,height);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG编码失败")),"image/png"));return new Blob([pngWithDpi(new Uint8Array(await blob.arrayBuffer()),dpi).slice().buffer as ArrayBuffer],{type:"image/png"});}
  finally{URL.revokeObjectURL(url);}
}
