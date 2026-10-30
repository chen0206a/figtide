import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(here, "..");
const repository = path.resolve(mcpRoot, "..");
const jar = process.env.FIGTIDE_DESKTOP_JAR || path.join(repository, "backend", "target", "figtide.jar");
const bundle = path.join(mcpRoot, "dist", "figtide-mcp.cjs");

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function javaCommand(): string {
  const executable = process.platform === "win32" ? "java.exe" : "java";
  return process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", executable) : executable;
}

async function waitFor(url: string, child: ChildProcess, logs: () => string): Promise<void> {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`FigTide exited ${child.exitCode}\n${logs()}`);
    try {
      const response = await fetch(`${url}/api/desktop/ping`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`FigTide did not become ready\n${logs()}`);
}

function config(datasetVersionId: number) {
  return {
    schema_version: 1,
    datasetVersionId,
    type: "line",
    x: "epoch",
    group: "",
    heatY: "epoch",
    heatZ: "score",
    series: [
      { id: "s1", y: "score", name: "Score", error: "", color: "#6758ce", opacity: 1, width: 2.5, dash: "solid", symbol: "circle", size: 6, visible: true },
    ],
    axes: {
      x: { title: "Epoch", min: "", max: "", log: false, grid: false, dtick: "" },
      y: { title: "Score", min: "", max: "", log: false, grid: true, dtick: "" },
    },
    style: { title: "Before MCP", font: "Arial", fontSize: 14, bold: false, width: 760, height: 500, background: "#ffffff", top: 70, bottom: 70, left: 75, right: 35, preset: "Clean Academic" },
    legend: { show: true, position: "top", orientation: "h" },
    annotations: [],
    transforms: [],
  };
}

function parsed(result: any): any {
  const block = result.content.find((item: any) => item.type === "text");
  if (!block || block.type !== "text") throw new Error("missing MCP text result");
  return JSON.parse(block.text);
}

describe("FigTide desktop MCP stdio integration", () => {
  let directory = "";
  let baseUrl = "";
  let backend: ChildProcess;
  let output = "";
  let client: Client;
  let transport: StdioClientTransport;
  let projectId = 0;
  let chartId = 0;
  let initialConfig: ReturnType<typeof config>;

  beforeAll(async () => {
    await readFile(jar);
    await readFile(bundle);
    directory = await mkdtemp(path.join(os.tmpdir(), "figtide-mcp-"));
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    backend = spawn(
      javaCommand(),
      [
        "-Duser.timezone=UTC",
        "-jar",
        jar,
        "--spring.profiles.active=desktop",
        `--labflow.data-dir=${path.join(directory, "data")}`,
        `--labflow.desktop.port=${port}`,
        "--labflow.desktop.open-browser=false",
        "--labflow.desktop.tray=false",
      ],
      { cwd: repository, stdio: ["ignore", "pipe", "pipe"] },
    );
    backend.stdout?.on("data", (chunk) => (output += chunk.toString()));
    backend.stderr?.on("data", (chunk) => (output += chunk.toString()));
    await waitFor(baseUrl, backend, () => output);

    const project = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "MCP 集成测试", description: "合成数据" }),
    }).then((response) => response.json());
    projectId = project.id;
    const form = new FormData();
    form.append("file", new Blob(["epoch,score,secret,truth,predicted\n1,0.7,private-a,A,A\n2,0.8,private-b,B,A"], { type: "text/csv" }), "private-input.csv");
    const dataset = await fetch(`${baseUrl}/api/projects/${projectId}/datasets`, { method: "POST", body: form }).then((response) => response.json());
    initialConfig = config(dataset.id);
    const chart = await fetch(`${baseUrl}/api/projects/${projectId}/charts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "MCP chart", config: initialConfig }),
    }).then((response) => response.json());
    chartId = chart.id;

    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    env.FIGTIDE_URL = baseUrl;
    transport = new StdioClientTransport({ command: process.execPath, args: [bundle], env, stderr: "pipe" });
    client = new Client({ name: "figtide-integration", version: "1" });
    await client.connect(transport);
  }, 120000);

  afterAll(async () => {
    await client?.close().catch(() => undefined);
    backend?.kill();
    if (backend && backend.exitCode === null)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 5000);
        backend.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("does not expose classification reports through either MCP result channel", async () => {
    const candidate = {
      ...structuredClone(initialConfig), type: "confusion", group: "secret",
      series: initialConfig.series.map((series) => ({ ...series, prediction: "predicted" })),
      classification: {
        algorithm: "classification-v1", label: "truth", input: "labels",
        positive: "A", threshold: 0.5, classes: ["A", "B"], normalization: "count",
        seriesId: "", groupValue: "", xTitle: "", yTitle: "",
      },
    };
    const args = { project_id: projectId, config: candidate };
    const raw = await fetch(`${baseUrl}/api/projects/${projectId}/figure-tools/lint`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocol_version: 1, base_revision: 0, config: candidate }),
    }).then((response) => response.json());
    expect(raw.report.source.filename).toBe("private-input.csv");
    expect(JSON.stringify(raw.report)).toContain("private-a");
    const response = await client.callTool({ name: "lint_chart", arguments: args });
    expect(parsed(response)).toMatchObject({ ok: true, issues: [] });
    expect(parsed(response)).not.toHaveProperty("report");
    expect(JSON.stringify(response)).not.toMatch(/private-input|private-a|private-b|filename|sampleRows/);
  });

  it("lists annotations, keeps profiles private, previews, saves and rejects stale revision", async () => {
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(12);
    expect(listed.tools.find((tool) => tool.name === "save_chart_version")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });

    const projects = parsed(await client.callTool({ name: "list_projects", arguments: {} }));
    expect(projects.some((project: any) => project.id === projectId)).toBe(true);
    const datasets = parsed(await client.callTool({ name: "list_datasets", arguments: { project_id: projectId } }));
    const profileResult = await client.callTool({
      name: "get_dataset_profile",
      arguments: { project_id: projectId, dataset_version_id: initialConfig.datasetVersionId },
    });
    const privacyText = JSON.stringify([datasets, parsed(profileResult)]);
    expect(privacyText).not.toMatch(/private-input|private-a|private-b|filename|samples|head/);

    const chart = parsed(await client.callTool({ name: "get_chart", arguments: { project_id: projectId, chart_id: chartId } }));
    expect(chart).toMatchObject({ revision: 1, version_count: 1 });
    const preview = parsed(
      await client.callTool({
        name: "preview_chart_changes",
        arguments: {
          project_id: projectId,
          chart_id: chartId,
          base_revision: 1,
          config: chart.config,
          operations: [{ tool: "set_style", arguments: { title: "Saved through MCP" } }],
        },
      }),
    );
    expect(preview.config.style.title).toBe("Saved through MCP");

    const saved = parsed(
      await client.callTool({
        name: "save_chart_version",
        arguments: { project_id: projectId, chart_id: chartId, name: "MCP chart", base_revision: 1, config: preview.config },
      }),
    );
    expect(saved).toMatchObject({ saved: true, chart: { revision: 2 } });
    expect(saved.editor_url).toBe(`${baseUrl}/projects/${projectId}/figures/${chartId}`);
    const reread = parsed(await client.callTool({ name: "get_chart", arguments: { project_id: projectId, chart_id: chartId } }));
    expect(reread).toMatchObject({ revision: 2, version_count: 2 });
    expect(reread.config.style.title).toBe("Saved through MCP");

    const stale = await client.callTool({
      name: "save_chart_version",
      arguments: { project_id: projectId, chart_id: chartId, name: "MCP chart", base_revision: 1, config: initialConfig },
    });
    expect(stale.isError).toBe(true);
    expect(stale.content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "text", text: "图表已被修改，请重新读取后再试" })]),
    );
    const afterConflict = await fetch(`${baseUrl}/api/projects/${projectId}/charts/${chartId}`).then((response) => response.json());
    expect(afterConflict.revision).toBe(2);
    expect(afterConflict.config.style.title).toBe("Saved through MCP");
  });
  it('reviews a saved chart through real stdio without geometry or private source data', async () => {
    const before=await fetch(`${baseUrl}/api/projects/${projectId}/charts/${chartId}`).then(response=>response.json());
    const response=await client.callTool({name:'review_chart',arguments:{project_id:projectId,chart_id:chartId,config:before.config}});
    expect(response.isError).not.toBe(true);
    const review=parsed(response);expect(review.rules_version).toBe('review-v1');
    expect(review.skipped.map((item:any)=>item.rule)).toEqual(['R7','R8']);
    expect(JSON.stringify(response)).not.toMatch(/private-input|private-a|private-b|filename|sampleRows/);
    const after=await fetch(`${baseUrl}/api/projects/${projectId}/charts/${chartId}`).then(response=>response.json());
    expect(after).toEqual(before);
  });
});
