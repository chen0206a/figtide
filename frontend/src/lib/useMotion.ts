import { useEffect, useState, useSyncExternalStore } from "react";
const query = "(prefers-reduced-motion: reduce)";
const snapshot = () => typeof matchMedia === "function" && matchMedia(query).matches;
const subscribe = (notify: () => void) => {
  if (typeof matchMedia !== "function") return () => {};
  const media = matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
export function useEntrance(key: string): "full" | "quick" | "none" {
  const reduced = useReducedMotion();
  const [mode] = useState<"full" | "quick">(() => {
    try { return sessionStorage.getItem(`labflow-entrance:${key}`) ? "quick" : "full"; }
    catch { return "quick"; }
  });
  useEffect(() => {
    if (!reduced) try { sessionStorage.setItem(`labflow-entrance:${key}`, "1"); } catch { /* optional preference */ }
  }, [key, reduced]);
  return reduced ? "none" : mode;
}
