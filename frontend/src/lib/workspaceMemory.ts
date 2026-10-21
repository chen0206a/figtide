import { readWorkspaceRoute, workspaceUrl, type WorkspacePage } from "./routes";
export type WorkspaceMemory = Record<
  string,
  Partial<Record<WorkspacePage, string>>
>;
export function rememberWorkspace(
  memory: WorkspaceMemory,
  pathname: string,
  search: string,
): WorkspaceMemory {
  const r = readWorkspaceRoute(pathname, search);
  if (!r.valid || !r.project || r.page === "home") return memory;
  const url = workspaceUrl(r.page, r.project, r.chart, r.dataset);
  if (memory[r.project]?.[r.page] === url) return memory;
  return { ...memory, [r.project]: { ...memory[r.project], [r.page]: url } };
}
export function readWorkspaceMemory(
  storage: Pick<Storage, "getItem">,
): WorkspaceMemory {
  try {
    const raw = JSON.parse(
      storage.getItem("labflow-workspace-tabs-v1") || "{}",
    );
    let result: WorkspaceMemory = {};
    for (const [project, pages] of Object.entries(raw).slice(-32)) {
      if (!pages || typeof pages !== "object") continue;
      for (const [page, url] of Object.entries(pages)) {
        if (typeof url !== "string") continue;
        const [path, query] = url.split("?");
        const r = readWorkspaceRoute(path, query);
        if (String(r.project) === project && r.page === page)
          result = rememberWorkspace(result, path, query || "");
      }
    }
    return result;
  } catch {
    return {};
  }
}
export function workspaceTargets(memory: WorkspaceMemory, project: number) {
  return Object.fromEntries(
    (["home", "experiments", "data", "editor"] as const).map((page) => [
      page,
      memory[project]?.[page] || workspaceUrl(page, project),
    ]),
  ) as Record<WorkspacePage, string>;
}
