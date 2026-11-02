import {useEffect,useSyncExternalStore} from 'react';
import {cachedIcons,subscribeIcons,loadIcon,iconError,diagramIconIds} from './iconCache';
import type {DiagramDoc} from './model';

export function useIconAssets(ids:string[]){
  const assets=useSyncExternalStore(subscribeIcons,cachedIcons,cachedIcons),key=[...new Set(ids)].sort().join('|');
  useEffect(()=>{for(const id of key.split('|').filter(Boolean))void loadIcon(id).catch(()=>{});},[key]);
  const failed=ids.filter(id=>iconError(id)),loading=ids.some(id=>!assets[id]&&!iconError(id));
  return {assets,loading,failed,retry:()=>{for(const id of failed)void loadIcon(id,true).catch(()=>{});}};
}
export const useDiagramIcons=(doc:DiagramDoc)=>useIconAssets(diagramIconIds(doc));
