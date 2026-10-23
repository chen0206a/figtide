import { useEffect } from "react";
import { type Config } from "../model";
import "../styles-library.css";
import { fittedZoom } from "./fitZoom";

type useCanvasFitProps = {
  stage: React.RefObject<HTMLDivElement | null>;
  autoFit: boolean;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  c: Config;
};
export function useCanvasFit({
  stage,
  autoFit,
  setZoom,
  c,
}: useCanvasFitProps) {
  useEffect(() => {
    const el = stage.current;
    if (!el || !autoFit) return;
    const fit = () => setZoom(fittedZoom(el, c.style.width, c.style.height));
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, [autoFit, c.style.width, c.style.height]);
}
