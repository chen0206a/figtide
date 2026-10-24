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
  // 数据集属于具体项目，只通过 rememberDataset 记录。地址里的 ?dataset= 可能
  // 是别的项目的（例如从别处复制来的链接），不能原样写进这个项目的记忆。
  const url = workspaceUrl(
    r.page,
    r.project,
    r.chart,
    r.page === "data" ? 0 : r.dataset,
  );
  if (memory[r.project]?.[r.page] === url) return memory;
  return { ...memory, [r.project]: { ...memory[r.project], [r.page]: url } };
}
/** 记住某个项目最近使用的数据集；dataset 必须已经确认属于该项目。 */
export function rememberDataset(
  memory: WorkspaceMemory,
  project: number,
  dataset: number,
): WorkspaceMemory {
  if (!project || dataset <= 0) return memory;
  const url = workspaceUrl("data", project, null, dataset);
  if (memory[project]?.data === url) return memory;
  return { ...memory, [project]: { ...memory[project], data: url } };
}
/** 读出某个项目最近使用的数据集；没有记过则返回 0。 */
export function workspaceDataset(
  memory: WorkspaceMemory,
  project: number,
): number {
  const url = memory[project]?.data;
  if (!url) return 0;
  const [path, query] = url.split("?");
  const r = readWorkspaceRoute(path, query || "");
  return String(r.project) === String(project) ? r.dataset : 0;
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
        if (String(r.project) === project && r.page === page) {
          result = rememberWorkspace(result, path, query || "");
          // 旧记忆把数据集存在数据页地址里，这里迁移到 rememberDataset。
          if (r.page === "data" && r.dataset > 0)
            result = rememberDataset(result, r.project, r.dataset);
        }
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
