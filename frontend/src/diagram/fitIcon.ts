/** Measure only an already allowlisted/sanitized vector; keep all geometry and aspect ratio. */
export function fitIconContent(svg:string):string{
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-30000px;top:0;visibility:hidden;pointer-events:none';host.innerHTML=svg;
  const root=host.querySelector('svg');if(!root||typeof root.getBBox!=='function')return svg;
  document.body.append(host);
  try{
    root.setAttribute('width','512');root.setAttribute('height','512');const box=root.getBBox();
    if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0)return svg;
    const pad=Math.max(box.width,box.height)*.025,viewBox=`${box.x-pad} ${box.y-pad} ${box.width+2*pad} ${box.height+2*pad}`;
    return /\bviewBox="[^"]*"/.test(svg)?svg.replace(/\bviewBox="[^"]*"/,`viewBox="${viewBox}"`):svg.replace(/<svg\b/,`<svg viewBox="${viewBox}"`);
  }finally{host.remove();}
}
