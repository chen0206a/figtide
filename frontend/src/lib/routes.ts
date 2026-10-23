export type WorkspacePage = "home" | "experiments" | "data" | "editor" | "welcome";
export type WorkspaceRoute = {
  page: WorkspacePage;
  project: number;
  chart: number | null;
  dataset: number;
  valid: boolean;
};
const positiveId = (value: string | null | undefined) => {
  if (!value || !/^[1-9]\d*$/.test(value)) return 0;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : 0;
};
export function readWorkspaceRoute(
  pathname: string,
  search = "",
): WorkspaceRoute {
  const base: WorkspaceRoute = {
    page: "home",
    project: 0,
    chart: null,
    dataset: 0,
    valid: true,
  };
  if (pathname === "/") return base;
  if (pathname === "/welcome" || pathname === "/welcome/") return { ...base, page: "welcome" };
  const workspace = pathname.match(
    /^\/workspace\/(experiments|data|figures\/new)\/?$/,
  );
  if (workspace)
    return {
      ...base,
      page:
        workspace[1] === "experiments"
          ? "experiments"
          : workspace[1] === "data"
            ? "data"
            : "editor",
    };
  const match = pathname.match(
    /^\/projects\/([1-9]\d*)\/(experiments|data|figures)(?:\/(new|[1-9]\d*))?\/?$/,
  );
  if (!match) return { ...base, valid: false };
  const [, project, area, figure] = match;
  if (
    !positiveId(project) ||
    (area !== "figures" && figure) ||
    (area === "figures" && !figure)
  )
    return { ...base, valid: false };
  const chart = figure && figure !== "new" ? positiveId(figure) : null;
  if (figure !== "new" && area === "figures" && !chart)
    return { ...base, valid: false };
  return {
    page:
      area === "figures" ? "editor" : area === "data" ? "data" : "experiments",
    project: positiveId(project),
    chart,
    dataset: positiveId(new URLSearchParams(search).get("dataset")),
    valid: true,
  };
}
export function workspaceUrl(
  page: WorkspacePage,
  project: number,
  chart: number | null = null,
  dataset = 0,
) {
  if (page === "home") return "/";
  if (page === "welcome") return "/welcome";
  if (!Number.isSafeInteger(project) || project <= 0)
    return `/workspace/${page === "editor" ? "figures/new" : page}`;
  const path = `/projects/${project}/${page === "editor" ? `figures/${chart || "new"}` : page}`;
  return dataset > 0 && (page === "data" || (page === "editor" && !chart))
    ? `${path}?dataset=${dataset}`
    : path;
}
