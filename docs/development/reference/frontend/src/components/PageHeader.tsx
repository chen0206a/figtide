import type { ReactNode } from "react";

/**
 * Compact header for tool pages (experiments, data). Replaces the old
 * eyebrow + slogan blocks; keeps one <h1> per page for accessibility and tests.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: ReactNode;
  /** Small mono line under the title, e.g. "视觉模型泛化研究 · 3 个实验". */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="lf-page-header">
      <div className="lf-page-header-text">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {meta && <span className="lf-kicker">{meta}</span>}
      </div>
      {actions && <div className="lf-page-header-actions">{actions}</div>}
    </header>
  );
}
