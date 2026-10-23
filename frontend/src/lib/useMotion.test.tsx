import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEntrance, useReducedMotion } from "./useMotion";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });
function media(initial=false) {
  let reduced=initial;
  const listeners=new Set<()=>void>();
  vi.stubGlobal("matchMedia",()=>({get matches(){return reduced},addEventListener:(_:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_:string,fn:()=>void)=>listeners.delete(fn)}));
  return (value:boolean)=>act(()=>{reduced=value;listeners.forEach(fn=>fn())});
}
it("reacts to reduced-motion changes and unsubscribes",()=>{
  const change=media(); const h=renderHook(useReducedMotion);
  expect(h.result.current).toBe(false);change(true);expect(h.result.current).toBe(true);h.unmount();change(false);
});
it("plays once per page and session, then uses quick entrance",()=>{
  media();const first=renderHook(()=>useEntrance("home"));expect(first.result.current).toBe("full");first.unmount();
  expect(renderHook(()=>useEntrance("home")).result.current).toBe("quick");
  expect(renderHook(()=>useEntrance("welcome")).result.current).toBe("full");
});
it("shows final state immediately with reduced motion",()=>{
  media(true);expect(renderHook(()=>useEntrance("home")).result.current).toBe("none");expect(sessionStorage.getItem("labflow-entrance:home")).toBeNull();
});
it("unavailable session storage never blocks rendering",()=>{
  media();vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw Error("blocked")});
  vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw Error("blocked")});
  expect(renderHook(()=>useEntrance("home")).result.current).toBe("quick");
});
