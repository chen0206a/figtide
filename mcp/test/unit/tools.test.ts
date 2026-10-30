import { describe, expect, it } from "vitest";
import { FigTideClient, type FetchLike } from "../../src/client.js";
import { FigTideTools } from "../../src/tools.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fixture(handler: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (input, init) => {
    const path = new URL(input.toString()).pathname + new URL(input.toString()).search;
    if (path === "/api/desktop/ping") return json({ instance_id: "unit" });
    calls.push({ path, init });
    return handler(path, init);
  };
  return {
    calls,
    tools: new FigTideTools(
      new FigTideClient({ env: { FIGTIDE_URL: "http://127.0.0.1:49100" }, fetch }),
    ),
  };
}

describe("FigTide tools", () => {
  it('reviews through the read-only HTTP endpoint without any render or raw data payload', async () => {
    const f = fixture((path, init) => {
      expect(path).toBe('/api/projects/1/figure-tools/review');
      expect(JSON.parse(String(init?.body))).toEqual({protocol_version: 1, config: {schema_version: 1}, target: {width_mm: 88}, chart_id: 4});
      return json({protocol_version: 1, rules_version: 'review-v1', issues: [], passed: ['R1'], skipped: [{rule: 'R7',reason: '需要编辑器中的渲染信息'},{rule: 'R8',reason: '需要编辑器中的渲染信息'}]});
    });
    const result = await f.tools.reviewChart(1,{schema_version: 1},{width_mm: 88},4);
    expect(result.skipped).toHaveLength(2);
    expect(f.calls).toHaveLength(1);
  });
  it("maps all read tools to their documented endpoints", async () => {
    const f = fixture((path) => {
      if (path === "/api/projects") return json([{ id: 1 }]);
      if (path === "/api/projects/1/datasets")
        return json([
          {
            id: 7,
            dataset_id: 3,
            filename: "private.csv",
            name: "private.csv",
            warnings: ["raw-value"],
            version: 1,
            sha256: "abc",
            row_count: 2,
            fields: [{ name: "score", type: "number", samples: [0.91] }],
          },
        ]);
      if (path === "/api/projects/1/data/7/profile")
        return json({
          dataset_version_id: 7,
          filename: "private.csv",
          fields: [{ name: "score", samples: [0.91] }],
          head: [{ score: 0.91 }],
        });
      if (path === "/api/projects/1/charts") return json([{ id: 4, revision: 2 }]);
      if (path === "/api/projects/1/charts/4") return json({ id: 4, revision: 2, config: {} });
      if (path === "/api/projects/1/charts/4/versions") return json([{ version: 2 }, { version: 1 }]);
      if (path === "/api/figure-tools/spec?type=line") return json({ filtered_by: "line" });
      if (path === "/api/figure-tools/catalog") return json({ tools: [{ name: "set_style" }] });
      throw new Error(`unexpected ${path}`);
    });

    expect(await f.tools.listProjects()).toEqual([{ id: 1 }]);
    const datasets = await f.tools.listDatasets(1);
    expect(JSON.stringify(datasets)).not.toMatch(/private|samples|warnings|raw-value/);
    expect(datasets).toMatchObject([{ id: 7, fields: [{ name: "score", type: "number" }] }]);
    const profile = await f.tools.getDatasetProfile(1, 7);
    expect(JSON.stringify(profile)).not.toMatch(/private|samples|head|0\.91/);
    expect(await f.tools.listCharts(1)).toEqual([{ id: 4, revision: 2 }]);
    expect(await f.tools.getChart(1, 4)).toMatchObject({ id: 4, revision: 2, version_count: 2 });
    expect(await f.tools.getFigureSpec("line")).toEqual({ filtered_by: "line" });
    expect(await f.tools.listFigureTools()).toEqual({ tools: [{ name: "set_style" }] });
  });

  it("sends lint and preview envelopes without changing their config", async () => {
    const f = fixture((_path, init) => json({ ok: true, echoed: JSON.parse(String(init?.body)) }));
    const config = { schema_version: 1, datasetVersionId: 7 };
    const lint = (await f.tools.lintChart(1, config, 4, 2)) as any;
    expect(lint.echoed).toEqual({
      protocol_version: 1,
      chart_id: 4,
      base_revision: 2,
      config,
    });
    const preview = (await f.tools.previewChartChanges(
      1,
      2,
      config,
      [{ tool: "set_style", arguments: { title: "After" } }],
      4,
    )) as any;
    expect(preview.echoed.operations).toEqual([
      { tool: "set_style", arguments: { title: "After" } },
    ]);
    expect(f.calls.map((call) => call.path)).toEqual([
      "/api/projects/1/figure-tools/lint",
      "/api/projects/1/figure-tools/preview",
    ]);
  });

  it("lints before save/create, returns links, and stops invalid writes", async () => {
    let lintOk = true;
    const f = fixture((path, init) => {
      if (path.endsWith("figure-tools/lint")) return json({ ok: lintOk, issues: [{ message: "bad" }] });
      if (path === "/api/projects/1/charts/4")
        return json({ id: 4, revision: 3, config: JSON.parse(String(init?.body)).config });
      if (path === "/api/projects/1/charts") return json({ id: 9, revision: 1 });
      throw new Error(`unexpected ${path}`);
    });
    const config = { schema_version: 1, datasetVersionId: 7 };
    expect(await f.tools.saveChartVersion(1, 4, "Chart", 2, config)).toMatchObject({
      saved: true,
      chart: { id: 4, revision: 3 },
      editor_url: "http://127.0.0.1:49100/projects/1/figures/4",
    });
    expect(await f.tools.createChart(1, "New", config)).toMatchObject({
      created: true,
      chart: { id: 9, revision: 1 },
      editor_url: "http://127.0.0.1:49100/projects/1/figures/9",
    });

    lintOk = false;
    const before = f.calls.length;
    expect(await f.tools.saveChartVersion(1, 4, "Chart", 2, config)).toEqual({
      saved: false,
      issues: [{ message: "bad" }],
    });
    expect(await f.tools.createChart(1, "New", config)).toEqual({
      created: false,
      issues: [{ message: "bad" }],
    });
    expect(f.calls.slice(before).every((call) => call.path.endsWith("figure-tools/lint"))).toBe(true);
  });

  it("removes classification reports without changing lint status, issues or safe source metadata", async () => {
    const response = {
      protocol_version: 1, ok: true, issues: [], base_revision: 2,
      source: { dataset_version_id: 7, sha256: "abc" },
      report: { source: { filename: "private.csv" }, reports: [{ group: "patient-123", sampleRows: [1, 2] }] },
    };
    const f = fixture(() => json(response));
    expect(await f.tools.lintChart(1, {}, 4, 2)).toEqual({
      protocol_version: 1, ok: true, issues: [], base_revision: 2,
      source: { dataset_version_id: 7, sha256: "abc" },
    });
    expect(response.report.source.filename).toBe("private.csv");
  });
});
