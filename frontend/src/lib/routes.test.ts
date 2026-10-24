import { describe, expect, it } from "vitest";
import { readWorkspaceRoute, workspaceUrl } from "./routes";
describe("workspace routes", () => {
  it("opens welcome without a project", () => {
    expect(readWorkspaceRoute("/welcome")).toMatchObject({page:"welcome",valid:true,project:0});
    expect(workspaceUrl("welcome",0)).toBe("/welcome");
  });
  it("restores explicit project and saved figure regardless of local selection", () => {
    expect(readWorkspaceRoute("/projects/17/figures/23")).toMatchObject({
      page: "editor",
      project: 17,
      chart: 23,
      valid: true,
    });
  });
  it("round trips the exact data version into a new plot", () => {
    const url = workspaceUrl("editor", 17, null, 45);
    const [path, query] = url.split("?");
    expect(readWorkspaceRoute(path, query)).toMatchObject({
      page: "editor",
      project: 17,
      chart: null,
      dataset: 45,
    });
  });
  it("does not attach unrelated datasets to a saved figure", () =>
    expect(workspaceUrl("editor", 17, 23, 45)).toBe("/projects/17/figures/23"));
  it("keeps data selection in the URL", () =>
    expect(workspaceUrl("data", 17, null, 45)).toBe(
      "/projects/17/data?dataset=45",
    ));
  it("provides real workbench destinations before the first project", () => {
    expect(workspaceUrl("data", 0)).toBe("/workspace/data");
    expect(readWorkspaceRoute("/workspace/data")).toMatchObject({
      page: "data",
      valid: true,
      project: 0,
    });
  });
  it.each([
    "/unknown",
    "/projects/0/data",
    "/projects/-1/experiments",
    "/projects/1/figures",
    "/projects/1/data/2",
    "/projects/9007199254740992/data",
    "/projects/1/figures/9007199254740992",
  ])("rejects malformed routes: %s", (path) =>
    expect(readWorkspaceRoute(path).valid).toBe(false),
  );
  it("does not accept malformed dataset identifiers", () =>
    expect(
      readWorkspaceRoute("/projects/17/data", "?dataset=1e4").dataset,
    ).toBe(0));
});
