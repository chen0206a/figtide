import { expect, it } from "vitest";
import {
  readWorkspaceMemory,
  rememberDataset,
  rememberWorkspace,
  workspaceDataset,
  workspaceTargets,
} from "./workspaceMemory";
it("resumes each module at its own chart and the project's own dataset", () => {
  let memory = rememberWorkspace({}, "/projects/3/figures/7", "");
  memory = rememberWorkspace(
    memory,
    "/projects/3/data",
    "?dataset=12&ignored=yes",
  );
  memory = rememberDataset(memory, 3, 12);
  expect(workspaceTargets(memory, 3)).toMatchObject({
    editor: "/projects/3/figures/7",
    data: "/projects/3/data?dataset=12",
    experiments: "/projects/3/experiments",
  });
});
it("remembers the selected dataset per project and never carries it across", () => {
  const memory = rememberDataset({}, 3, 12);
  expect(rememberDataset(memory, 3, 12)).toBe(memory);
  expect(workspaceTargets(memory, 3).data).toBe("/projects/3/data?dataset=12");
  expect(workspaceDataset(memory, 3)).toBe(12);
  expect(workspaceTargets(memory, 4).data).toBe("/projects/4/data");
  expect(workspaceDataset(memory, 4)).toBe(0);
});
it("does not trust a dataset that arrives in another project's address", () => {
  const memory = rememberWorkspace({}, "/projects/2/data", "?dataset=1");
  expect(workspaceTargets(memory, 2).data).toBe("/projects/2/data");
  expect(workspaceDataset(memory, 2)).toBe(0);
});
it("migrates a persisted dataset only for its own project", () => {
  const memory = readWorkspaceMemory({
    getItem: () =>
      JSON.stringify({
        "3": { data: "/projects/3/data?dataset=12" },
        "5": { data: "/projects/3/data?dataset=12" },
      }),
  });
  expect(workspaceTargets(memory, 3).data).toBe("/projects/3/data?dataset=12");
  expect(workspaceTargets(memory, 5).data).toBe("/projects/5/data");
});
it("keeps project routes separate and ignores invalid routes", () => {
  const memory = rememberWorkspace(
    {},
    "/projects/3/figures/new",
    "?dataset=12",
  );
  expect(workspaceTargets(memory, 4).editor).toBe("/projects/4/figures/new");
  expect(rememberWorkspace(memory, "/invalid", "")).toBe(memory);
});
it("rejects foreign and cross-project persisted destinations", () => {
  const raw = {
    "3": {
      editor: "/projects/4/figures/7",
      data: "https://example.com",
      experiments: "/projects/3/experiments",
    },
  };
  const memory = readWorkspaceMemory({ getItem: () => JSON.stringify(raw) });
  expect(workspaceTargets(memory, 3).editor).toBe("/projects/3/figures/new");
  expect(workspaceTargets(memory, 3).experiments).toBe(
    "/projects/3/experiments",
  );
  expect(readWorkspaceMemory({ getItem: () => "{bad" })).toEqual({});
});
