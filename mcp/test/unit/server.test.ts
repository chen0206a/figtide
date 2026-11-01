import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("MCP protocol", () => {
  const close: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(close.splice(0).map((fn) => fn()));
  });

  async function connected() {
    const fetch = async (input: string | URL | Request) => {
      const path = new URL(input.toString()).pathname;
      if (path.endsWith("desktop/ping")) return json({ instance_id: "unit" });
      if (path.endsWith("projects")) return json([]);
      if (path.endsWith("figure-tools/catalog")) return json({ tools: [] });
      throw new Error(`unexpected ${path}`);
    };
    const server = createServer({
      env: { FIGTIDE_URL: "http://127.0.0.1:49101" },
      fetch,
    });
    const client = new Client({ name: "unit", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    close.push(() => client.close(), () => server.close());
    return client;
  }

  it("lists the exact tools with required annotations", async () => {
    const client = await connected();
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual([
      "list_diagrams", "get_diagram", "get_diagram_brief", "review_diagram", "preview_diagram_changes", "save_diagram_version", "import_diagram_svg",
      "review_chart",
      "list_projects",
      "list_datasets",
      "get_dataset_profile",
      "list_charts",
      "get_chart",
      "get_figure_spec",
      "list_figure_tools",
      "lint_chart",
      "preview_chart_changes",
      "save_chart_version",
      "create_chart",
    ]);
    for (const tool of listed.tools.filter(t=>!["save_diagram_version","import_diagram_svg","save_chart_version","create_chart"].includes(t.name))) expect(tool.annotations?.readOnlyHint).toBe(true);
    for (const tool of listed.tools.filter(t=>["save_diagram_version","import_diagram_svg","save_chart_version","create_chart"].includes(t.name)))
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      });
  });

  it("validates the parameters of every parameterized tool", async () => {
    const client = await connected();
    const invalid: Array<[string, Record<string, unknown>]> = [
      ['list_diagrams',{project_id:0}],['get_diagram',{project_id:1,diagram_id:0}],['get_diagram_brief',{project_id:1,diagram_id:-1}],['review_diagram',{project_id:'1',diagram_id:1}],['preview_diagram_changes',{project_id:1,diagram_id:1,base_revision:1,operations:[]}],['save_diagram_version',{project_id:1,diagram_id:1,base_revision:0,operations:[{tool:'set_style',arguments:{}}]}],['import_diagram_svg',{project_id:1,diagram_id:1,base_revision:1,svg:''}],
      ['review_chart', {project_id: 1, config: {}, target: {width_mm: -1}}],
      ["list_datasets", { project_id: 0 }],
      ["get_dataset_profile", { project_id: 1, dataset_version_id: -1 }],
      ["list_charts", { project_id: "1" }],
      ["get_chart", { project_id: 1, chart_id: 0 }],
      ["get_figure_spec", { chart_type: "pie" }],
      ["lint_chart", { project_id: 1, config: [] }],
      ["preview_chart_changes", { project_id: 1, config: {}, operations: [], base_revision: 1 }],
      ["save_chart_version", { project_id: 1, chart_id: 1, name: "x", base_revision: 0, config: {} }],
      ["create_chart", { project_id: 1, name: "", config: {} }],
    ];
    for (const [name, args] of invalid) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, name).toBe(true);
    }
  });
});
