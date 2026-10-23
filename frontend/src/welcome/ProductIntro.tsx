import type { MouseEvent } from "react";
import { useEntrance } from "../lib/useMotion";
import { useReveal } from "../lib/useReveal";
import { introMarkup } from "./introMarkup";
import "./welcome.css";
const TOP_CTA = 'class="cta pi-s10">开始创作';
const TOP_CTA_SEEN = 'class="cta pi-s10">进入工作区';
/** Only the top-bar entry changes wording for returning visitors; the three CTAs keep one destination. */
export function introMarkupFor(seen: boolean): string {
  return seen ? introMarkup.replace(TOP_CTA, TOP_CTA_SEEN) : introMarkup;
}
export default function ProductIntro({onStart,seen=false}:{onStart:(event:MouseEvent)=>void;seen?:boolean}) {
  const entrance=useEntrance('welcome');
  const root=useReveal();
  return <main id="labflow-intro" ref={root} data-entrance={entrance} data-intro-seen={seen?'true':'false'} className={`product-intro ${entrance==='none'?'':'lf-motion-on'}`} onClick={event=>{
    if((event.target as Element).closest('[data-start]')){event.preventDefault();onStart(event)}
  }} dangerouslySetInnerHTML={{__html:introMarkupFor(seen)}}/>;
}