import {builtinIconIds} from './builtinIconIds';
import {safeArtwork} from './artwork';
import type {DiagramDoc} from './model';

export type IconAssets=Readonly<Record<string,string>>;
let snapshot:IconAssets=Object.freeze({});
const pending=new Map<string,Promise<string>>(),errors=new Map<string,Error>(),listeners=new Set<()=>void>();
export const cachedIcons=()=>snapshot;
export const subscribeIcons=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
const emit=()=>listeners.forEach(fn=>fn());
export const iconError=(id:string)=>errors.get(id);
export const diagramIconIds=(doc:DiagramDoc)=>[...new Set(doc.nodes.filter(n=>n.kind==='icon'&&n.icon).map(n=>n.icon!))].sort();
/** Only shipped IDs reach the existing loopback API. In-flight and successful requests are shared. */
export function loadIcon(id:string,retry=false):Promise<string>{
  if(!builtinIconIds.has(id))return Promise.reject(new Error('未知科研图标'));
  if(snapshot[id])return Promise.resolve(snapshot[id]);
  const inFlight=pending.get(id);if(inFlight)return inFlight;
  if(errors.has(id)&&!retry)return Promise.reject(errors.get(id));
  errors.delete(id);
  const request=(async()=>{
    try{
      const response=await fetch(`/api/diagram-icons/${encodeURIComponent(id)}.svg`,{credentials:'same-origin'});
      if(!response.ok)throw new Error(`科研图标载入失败（${response.status}）`);
      const svg=await response.text();if(!safeArtwork(svg))throw new Error('科研图标SVG未通过安全检查');
      snapshot=Object.freeze({...snapshot,[id]:svg});return svg;
    }catch(e){const error=e instanceof Error?e:new Error('科研图标载入失败');errors.set(id,error);snapshot=Object.freeze({...snapshot});throw error;}
    finally{pending.delete(id);emit();}
  })();pending.set(id,request);return request;
}
export async function prepareDiagramIcons(doc:DiagramDoc):Promise<IconAssets>{await Promise.all(diagramIconIds(doc).map(id=>loadIcon(id,true)));return snapshot;}
