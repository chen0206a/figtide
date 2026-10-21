import { expect, it } from "vitest";
import {
  readWorkspaceMemory,
  rememberWorkspace,
  workspaceTargets,
} from "./workspaceMemory";
it("resumes each module at its own chart or data version", () => {
  let memory = rememberWorkspace({}, "/projects/3/figures/7", "");
  memory = rememberWorkspace(
    memory,
    "/projects/3/data",
    "?dataset=12&ignored=yes",
  );
  expect(workspaceTargets(memory, 3)).toMatchObject({
    editor: "/projects/3/figures/7",
    data: "/projects/3/data?dataset=12",
    experiments: "/projects/3/experiments",
  });
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
