export function WorkbenchSkeleton() {
  return (
    <div
      className="workbench-skeleton"
      role="status"
      aria-label="正在加载绘图工作台"
      aria-busy="true"
    >
      <p>正在准备绘图工作台…</p>
      <div className="workbench-skeleton-layout" aria-hidden="true">
        <div>
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <span />
        <div>
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
