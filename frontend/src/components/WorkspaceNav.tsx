import { useLayoutEffect, useRef, useState } from "react";
import {
  House,
  FlaskConical,
  Database,
  ChartNoAxesCombined,
} from "lucide-react";
import { Link } from "react-router-dom";
import { workspaceUrl, type WorkspacePage } from "../lib/routes";
const icons = {
  home: House,
  experiments: FlaskConical,
  data: Database,
  editor: ChartNoAxesCombined,
};
const items = [
  ["home", "项目概览"],
  ["experiments", "实验记录"],
  ["data", "数据管理"],
  ["editor", "科研绘图"],
] as const;
export function WorkspaceNav({
  page,
  project,
  urls,
  onIntent,
}: {
  page: WorkspacePage;
  project: number;
  urls?: Partial<Record<WorkspacePage, string>>;
  onIntent?: (page: WorkspacePage) => void;
}) {
  const nav = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const root = nav.current;
    if (!root) return;
    const update = () => {
      const target = root.querySelector<HTMLElement>(
        `[data-page="${hovered || page}"]`,
      );
      if (target)
        setIndicator({ left: target.offsetLeft, width: target.offsetWidth });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [page, hovered]);
  return (
    <nav
      ref={nav}
      className="workspace-nav"
      aria-label="主导航"
      onMouseLeave={() => setHovered(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHovered(null);
      }}
    >
      <span
        className="nav-indicator"
        aria-hidden="true"
        style={{
          width: indicator.width,
          transform: `translateX(${indicator.left}px)`,
        }}
      />
      {items.map(([id, label]) => {
        const Icon = icons[id];
        return (
          <Link
            key={id}
            to={urls?.[id] || workspaceUrl(id, project)}
            data-page={id}
            className={`workspace-nav-link ${id === page ? "active" : ""}`}
            aria-current={id === page ? "page" : undefined}
            onMouseEnter={() => {
              setHovered(id);
              onIntent?.(id);
            }}
            onFocus={() => {
              setHovered(id);
              onIntent?.(id);
            }}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
