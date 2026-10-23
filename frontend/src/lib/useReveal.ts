import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useMotion";
/** Visible by default. Only a functioning observer opts content into reveal. */
export function useReveal() {
  const root=useRef<HTMLElement>(null);
  const reduced=useReducedMotion();
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const items=el.querySelectorAll<HTMLElement>('.reveal,.trace');
    if(reduced || typeof IntersectionObserver==='undefined'){
      items.forEach(node=>{delete node.dataset.reveal;delete node.dataset.in});
      return;
    }
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        const node=entry.target as HTMLElement;
        if(node.dataset.demo){node.dataset.playing=String(entry.isIntersecting);}
        if(entry.isIntersecting){node.dataset.in='true';delete node.dataset.reveal;if(!node.dataset.demo)observer.unobserve(node);}
      }
    },{threshold:0.08});
    items.forEach(node=>{node.dataset.reveal='pending';observer.observe(node)});
    return ()=>{observer.disconnect();items.forEach(node=>{delete node.dataset.reveal;delete node.dataset.in})};
  },[reduced]);
  return root;
}
