import type { MouseEvent } from "react";
import { useEntrance } from "../lib/useMotion";
import { useReveal } from "../lib/useReveal";
import { introMarkup } from "./introMarkup";
import "./welcome.css";
export default function ProductIntro({onStart}:{onStart:(event:MouseEvent)=>void}) {
  const entrance=useEntrance('welcome');
  const root=useReveal();
  return <main id="labflow-intro" ref={root} data-entrance={entrance} className={`product-intro ${entrance==='none'?'':'lf-motion-on'}`} onClick={event=>{
    if((event.target as Element).closest('[data-start]')){event.preventDefault();onStart(event)}
  }} dangerouslySetInnerHTML={{__html:introMarkup}}/>;
}
