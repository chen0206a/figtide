import { useEffect, useRef, useState } from "react";

type usePanelLayoutProps = {};
export function usePanelLayout() {
  const [widths, setWidths] = useState(() => {
    try {
      const w = JSON.parse(
        localStorage.getItem("labflow-panel-widths") || "{}",
      );
      return {
        left: Math.min(340, Math.max(180, Number(w.left) || 236)),
        right: Math.min(420, Math.max(240, Number(w.right) || 292)),
      };
    } catch {
      return { left: 236, right: 292 };
    }
  });
  const stage = useRef<HTMLDivElement>(null);
  const [autoFit, setAutoFit] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("labflow-panel-widths", JSON.stringify(widths));
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [widths]);
  function resizer(side: "left" | "right") {
    return (
      <div
        className={`panel-resize resize-${side}`}
        role="separator"
        aria-label={side === "left" ? "调整数据栏宽度" : "调整属性栏宽度"}
        aria-orientation="vertical"
        aria-valuenow={widths[side]}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const step = e.key === "ArrowRight" ? 10 : -10;
            setWidths((w) => ({
              ...w,
              [side]: Math.min(
                side === "left" ? 340 : 420,
                Math.max(side === "left" ? 180 : 240, w[side] + step),
              ),
            }));
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.dataset.x = String(e.clientX);
          e.currentTarget.dataset.width = String(widths[side]);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            const delta = e.clientX - Number(e.currentTarget.dataset.x);
            const width =
              Number(e.currentTarget.dataset.width) +
              (side === "left" ? delta : -delta);
            setWidths((w) => ({
              ...w,
              [side]: Math.min(
                side === "left" ? 340 : 420,
                Math.max(side === "left" ? 180 : 240, width),
              ),
            }));
          }
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      />
    );
  }

  const [panels, setPanels] = useState<{ left: boolean; right: boolean }>(
    () => {
      try {
        return (
          JSON.parse(localStorage.getItem("labflow-panels") || "null") || {
            left: true,
            right: true,
          }
        );
      } catch {
        return { left: true, right: true };
      }
    },
  );
  function togglePanel(side: "left" | "right") {
    const next = { ...panels, [side]: !panels[side] };
    setPanels(next);
    try {
      localStorage.setItem("labflow-panels", JSON.stringify(next));
    } catch {}
  }

  return { widths, stage, autoFit, setAutoFit, resizer, panels, togglePanel };
}
