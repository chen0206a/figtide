import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigTideClient } from "./client.js";

type JsonObject = Record<string, unknown>;

const positiveId = z.number().int().positive();
const revision = z.number().int().nonnegative();
const jsonObject = z.record(z.string(), z.unknown());
const chartTypes = [
  "line",
  "bar",
  "scatter",
  "heatmap",
  "box",
  "violin",
  "histogram",
  "ecdf",
  "roc",
  "pr",
  "confusion",
] as const;
const operation = z
  .object({ tool: z.string().min(1).max(80), arguments: jsonObject })
  .strict();

const readAnnotations = { readOnlyHint: true } as const;
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
} as const;

function jsonResult(value: unknown) {
  const structuredContent =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonObject)
      : { items: value };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

async function safe<T>(run: () => Promise<T>) {
  try {
    return jsonResult(await run());
  } catch (error) {
    return errorResult(error);
  }
}

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

function put(body: unknown): RequestInit {
  return { method: "PUT", body: JSON.stringify(body) };
}

function sanitizeFields(fields: unknown): unknown[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) return field;
    const copy = { ...(field as JsonObject) };
    delete copy.samples;
    return copy;
  });
}

export function sanitizeDatasetProfile(profile: unknown): JsonObject {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return {};
  const copy = { ...(profile as JsonObject) };
  delete copy.head;
  delete copy.filename;
  copy.fields = sanitizeFields(copy.fields);
  return copy;
}

export function sanitizeDatasetList(datasets: unknown): unknown[] {
  if (!Array.isArray(datasets)) return [];
  return datasets.map((dataset) => {
    if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) return dataset;
    const source = dataset as JsonObject;
    return {
      id: source.id,
      dataset_id: source.dataset_id,
      version: source.version,
      sha256: source.sha256,
      row_count: source.row_count,
      fields: sanitizeFields(source.fields),
      created_at: source.created_at,
    };
  });
}

export class FigTideTools {
  constructor(private readonly client: FigTideClient) {}

  async reviewChart(projectId: number, config: JsonObject, target?: {width_mm?: number; journal?: string}, chartId?: number) {
    return (await this.client.request<JsonObject>(`projects/${projectId}/figure-tools/review`, post({
      protocol_version: 1, config, ...(target ? {target} : {}), ...(chartId ? {chart_id: chartId} : {}),
    }))).data;
  }

  async listDiagrams(projectId:number){return (await this.client.request<unknown[]>(`projects/${projectId}/diagrams`)).data;}
  async getDiagram(projectId:number,diagramId:number){return (await this.client.request<JsonObject>(`projects/${projectId}/diagrams/${diagramId}`)).data;}
  async getDiagramBrief(projectId:number,diagramId:number){return (await this.client.request<JsonObject>(`projects/${projectId}/diagrams/${diagramId}/brief`)).data;}
  async reviewDiagram(projectId:number,diagramId:number){const current=await this.getDiagram(projectId,diagramId);return (await this.client.request<JsonObject>(`projects/${projectId}/diagram-tools/review`,post({protocol_version:1,diagram_id:diagramId,base_revision:current.revision,doc:current.doc}))).data;}
  async previewDiagramChanges(projectId:number,diagramId:number,baseRevision:number,operations:Array<{tool:string;arguments:JsonObject}>){const current=await this.getDiagram(projectId,diagramId);return (await this.client.request<JsonObject>(`projects/${projectId}/diagram-tools/preview`,post({protocol_version:1,diagram_id:diagramId,base_revision:baseRevision,doc:current.doc,operations}))).data;}
  async saveDiagramVersion(projectId:number,diagramId:number,baseRevision:number,operations:Array<{tool:string;arguments:JsonObject}>){const preview=await this.previewDiagramChanges(projectId,diagramId,baseRevision,operations);const {data,endpoint}=await this.client.request<JsonObject>(`projects/${projectId}/diagrams/${diagramId}`,put({base_revision:baseRevision,doc:preview.doc}));return {saved:true,diagram:data,editor_url:this.client.editorUrl(endpoint,projectId,diagramId,"diagrams")};}
  async importDiagramSvg(projectId:number,diagramId:number,baseRevision:number,svg:string,name?:string){const {data,endpoint}=await this.client.request<JsonObject>(`projects/${projectId}/diagrams/${diagramId}/import-svg`,post({base_revision:baseRevision,svg,...(name?{name}:{})}));return {saved:true,diagram:data,editor_url:this.client.editorUrl(endpoint,projectId,diagramId,"diagrams")};}

  async listProjects() {
    return (await this.client.request<unknown[]>("projects")).data;
  }

  async listDatasets(projectId: number) {
    const { data } = await this.client.request<unknown[]>(`projects/${projectId}/datasets`);
    return sanitizeDatasetList(data);
  }

  async getDatasetProfile(projectId: number, datasetVersionId: number) {
    const { data } = await this.client.request<unknown>(
      `projects/${projectId}/data/${datasetVersionId}/profile`,
    );
    return sanitizeDatasetProfile(data);
  }

  async listCharts(projectId: number) {
    return (await this.client.request<unknown[]>(`projects/${projectId}/charts`)).data;
  }

  async getChart(projectId: number, chartId: number) {
    const chart = await this.client.request<JsonObject>(`projects/${projectId}/charts/${chartId}`);
    const versions = await this.client.request<unknown[]>(
      `projects/${projectId}/charts/${chartId}/versions`,
    );
    return { ...chart.data, version_count: versions.data.length };
  }

  async getFigureSpec(chartType?: string) {
    const query = chartType ? `?type=${encodeURIComponent(chartType)}` : "";
    return (await this.client.request<unknown>(`figure-tools/spec${query}`)).data;
  }

  async listFigureTools() {
    return (await this.client.request<unknown>("figure-tools/catalog")).data;
  }

  async lintChart(
    projectId: number,
    config: JsonObject,
    chartId?: number,
    baseRevision = 0,
  ) {
    const { data } = await this.client.request<JsonObject>(
      `projects/${projectId}/figure-tools/lint`,
      post({
        protocol_version: 1,
        ...(chartId === undefined ? {} : { chart_id: chartId }),
        base_revision: baseRevision,
        config,
      }),
    );
    // Match the built-in assistant: classification reports include filenames,
    // observed group values and sample row numbers, not just field summaries.
    const result = { ...data };
    delete result.report;
    return result;
  }

  async previewChartChanges(
    projectId: number,
    baseRevision: number,
    config: JsonObject,
    operations: Array<{ tool: string; arguments: JsonObject }>,
    chartId?: number,
  ) {
    return (
      await this.client.request<unknown>(
        `projects/${projectId}/figure-tools/preview`,
        post({
          protocol_version: 1,
          ...(chartId === undefined ? {} : { chart_id: chartId }),
          base_revision: baseRevision,
          config,
          operations,
        }),
      )
    ).data;
  }

  async saveChartVersion(
    projectId: number,
    chartId: number,
    name: string,
    baseRevision: number,
    config: JsonObject,
  ) {
    const lint = (await this.lintChart(projectId, config, chartId, baseRevision)) as {
      ok?: unknown;
      issues?: unknown;
    };
    if (lint.ok !== true) return { saved: false, issues: lint.issues ?? [] };
    const { data, endpoint } = await this.client.request<JsonObject>(
      `projects/${projectId}/charts/${chartId}`,
      put({ name, revision: baseRevision, config }),
    );
    return {
      saved: true,
      chart: data,
      editor_url: this.client.editorUrl(endpoint, projectId, Number(data.id ?? chartId)),
    };
  }

  async createChart(projectId: number, name: string, config: JsonObject) {
    const lint = (await this.lintChart(projectId, config, undefined, 0)) as {
      ok?: unknown;
      issues?: unknown;
    };
    if (lint.ok !== true) return { created: false, issues: lint.issues ?? [] };
    const { data, endpoint } = await this.client.request<JsonObject>(
      `projects/${projectId}/charts`,
      post({ name, config }),
    );
    return {
      created: true,
      chart: data,
      editor_url: this.client.editorUrl(endpoint, projectId, Number(data.id)),
    };
  }
}

export function registerTools(server: McpServer, tools: FigTideTools): void {
  const diagramIdentity={project_id:positiveId,diagram_id:positiveId};
  server.registerTool('list_diagrams',{title:'列出机制图',description:'只读列出指定项目的机制图，不读取数据集或原始数据。',inputSchema:{project_id:positiveId},annotations:readAnnotations},async({project_id})=>safe(()=>tools.listDiagrams(project_id)));
  server.registerTool('get_diagram',{title:'读取机制图',description:'读取当前文档、revision和版本数。外部SVG只作为整体图层，内部文字不能单独编辑。',inputSchema:diagramIdentity,annotations:readAnnotations},async({project_id,diagram_id})=>safe(()=>tools.getDiagram(project_id,diagram_id)));
  server.registerTool('get_diagram_brief',{title:'读取外部绘图简报',description:'返回简报、用户事实、节点分区连线语义、实际配色/线宽/字体和成品尺寸，提供Markdown与JSON。没有事实时先向用户确认，不自行编造。',inputSchema:diagramIdentity,annotations:readAnnotations},async({project_id,diagram_id})=>safe(()=>tools.getDiagramBrief(project_id,diagram_id)));
  server.registerTool('review_diagram',{title:'审稿机制图',description:'只读确定性审稿，不调用模型。没有浏览器渲染事实，D4/D5明确跳过；不能将其视为通过。',inputSchema:diagramIdentity,annotations:readAnnotations},async({project_id,diagram_id})=>safe(()=>tools.reviewDiagram(project_id,diagram_id)));
  const diagramChange={...diagramIdentity,base_revision:z.number().int().positive(),operations:z.array(operation).min(1).max(400)};
  server.registerTool('preview_diagram_changes',{title:'预览机制图操作',description:'对当前保存版本执行已有机制图操作，返回候选和差异，不保存。请让用户先核对；旧revision会报冲突。',inputSchema:diagramChange,annotations:readAnnotations},async({project_id,diagram_id,base_revision,operations})=>safe(()=>tools.previewDiagramChanges(project_id,diagram_id,base_revision,operations)));
  server.registerTool('save_diagram_version',{title:'保存机制图新版本',description:'用户确认后保存操作结果。先通过后端只读预览/校验，再带base_revision保存；冲突不覆盖、不重试。返回编辑器链接。',inputSchema:diagramChange,annotations:writeAnnotations},async({project_id,diagram_id,base_revision,operations})=>safe(()=>tools.saveDiagramVersion(project_id,diagram_id,base_revision,operations)));
  server.registerTool('import_diagram_svg',{title:'导入外部SVG为新图层',description:'经共享SvgSanitizer净化后新增artwork图层和保存版本，保留原图层与历史。须用户确认并带base_revision；图层整体可移动缩放锁定隐藏，内部文字不能单独编辑。不接受位图或外部资源。',inputSchema:{...diagramIdentity,base_revision:z.number().int().positive(),svg:z.string().min(1).max(2*1024*1024),name:z.string().trim().min(1).max(120).optional()},annotations:writeAnnotations},async({project_id,diagram_id,base_revision,svg,name})=>safe(()=>tools.importDiagramSvg(project_id,diagram_id,base_revision,svg,name)));
  server.registerTool('review_chart', {
    title: '确定性审稿', description: '只读检查图表规格，不调用模型，不写入配置。没有编辑器几何信息，R7/R8 明确跳过；修复须经预览并由用户确认。',
    inputSchema: {project_id: positiveId, config: jsonObject, chart_id: positiveId.optional(),
      target: z.object({width_mm: z.number().min(40).max(300).optional(), journal: z.string().max(64).optional()}).strict().optional()},
    annotations: readAnnotations,
  }, async ({project_id, config, target, chart_id}) => safe(() => tools.reviewChart(project_id, config, target, chart_id)));
  server.registerTool(
    "list_projects",
    {
      title: "列出 FigTide 项目",
      description: "列出本机 FigTide 的项目、归档标记以及实验、图表和数据集数量。用项目 ID 调用其他工具。",
      inputSchema: {},
      annotations: readAnnotations,
    },
    async () => safe(() => tools.listProjects()),
  );

  server.registerTool(
    "list_datasets",
    {
      title: "列出项目数据版本",
      description: "列出指定项目的数据版本和字段摘要，不返回原始行、文件名或样例值。project_id 必须来自 list_projects。",
      inputSchema: { project_id: positiveId.describe("FigTide 项目 ID") },
      annotations: readAnnotations,
    },
    async ({ project_id }) => safe(() => tools.listDatasets(project_id)),
  );

  server.registerTool(
    "get_dataset_profile",
    {
      title: "读取数据字段画像",
      description: "读取一个不可变数据版本的列名、类型、缺失数、唯一值数、角色和数值范围。不会返回原始行、文件名或样例值。",
      inputSchema: {
        project_id: positiveId.describe("FigTide 项目 ID"),
        dataset_version_id: positiveId.describe("数据版本 ID，来自 list_datasets 的 id"),
      },
      annotations: readAnnotations,
    },
    async ({ project_id, dataset_version_id }) =>
      safe(() => tools.getDatasetProfile(project_id, dataset_version_id)),
  );

  server.registerTool(
    "list_charts",
    {
      title: "列出项目图表",
      description: "列出指定项目已保存的图表及当前 revision。随后用 get_chart 读取配置再预览或保存修改。",
      inputSchema: { project_id: positiveId.describe("FigTide 项目 ID") },
      annotations: readAnnotations,
    },
    async ({ project_id }) => safe(() => tools.listCharts(project_id)),
  );

  server.registerTool(
    "get_chart",
    {
      title: "读取图表",
      description: "读取图表当前完整配置、revision 和版本数量。保存前必须使用这里返回的最新 revision。",
      inputSchema: {
        project_id: positiveId.describe("FigTide 项目 ID"),
        chart_id: positiveId.describe("图表 ID"),
      },
      annotations: readAnnotations,
    },
    async ({ project_id, chart_id }) => safe(() => tools.getChart(project_id, chart_id)),
  );

  server.registerTool(
    "get_figure_spec",
    {
      title: "读取图型规范",
      description: "读取 FigTide 11 类图的字段角色、序列数量和硬规则。可按 chart_type 过滤；这里没有默认配置。",
      inputSchema: { chart_type: z.enum(chartTypes).optional().describe("可选的图表类型") },
      annotations: readAnnotations,
    },
    async ({ chart_type }) => safe(() => tools.getFigureSpec(chart_type)),
  );

  server.registerTool(
    "list_figure_tools",
    {
      title: "读取可用绘图操作",
      description: "动态读取 FigTide 后端当前提供的绘图操作和参数 schema。修改配置前先调用，避免使用不存在或不适用的操作。",
      inputSchema: {},
      annotations: readAnnotations,
    },
    async () => safe(() => tools.listFigureTools()),
  );

  server.registerTool(
    "lint_chart",
    {
      title: "校验图表配置",
      description: "用 FigTide 保存时的同一套规则检查完整 schema v1 配置，只返回问题，不保存。已有图表请同时给 chart_id 和最新 base_revision。",
      inputSchema: {
        project_id: positiveId,
        config: jsonObject.describe("完整的 FigTide schema v1 图表配置"),
        chart_id: positiveId.optional(),
        base_revision: revision.default(0),
      },
      annotations: readAnnotations,
    },
    async ({ project_id, config, chart_id, base_revision }) =>
      safe(() => tools.lintChart(project_id, config, chart_id, base_revision)),
  );

  server.registerTool(
    "preview_chart_changes",
    {
      title: "预览图表修改",
      description: "按 list_figure_tools 的 operations 预览完整配置和逐字段差异，不保存、不增加版本。已有图表必须给最新 base_revision，冲突时重新读取。",
      inputSchema: {
        project_id: positiveId,
        config: jsonObject.describe("当前完整图表配置"),
        operations: z.array(operation).min(1).max(30),
        chart_id: positiveId.optional(),
        base_revision: revision,
      },
      annotations: readAnnotations,
    },
    async ({ project_id, config, operations, chart_id, base_revision }) =>
      safe(() =>
        tools.previewChartChanges(project_id, base_revision, config, operations, chart_id),
      ),
  );

  server.registerTool(
    "save_chart_version",
    {
      title: "保存新的图表版本",
      description: "把经过预览和确认的完整配置保存成新版本。必须携带 get_chart 返回的最新 base_revision；冲突不会覆盖或重试。成功返回可打开的编辑器链接。",
      inputSchema: {
        project_id: positiveId,
        chart_id: positiveId,
        name: z.string().trim().min(1).max(120).describe("图表名称"),
        base_revision: z.number().int().positive().describe("当前图表 revision"),
        config: jsonObject.describe("准备保存的完整 schema v1 配置"),
      },
      annotations: writeAnnotations,
    },
    async ({ project_id, chart_id, name, base_revision, config }) =>
      safe(() => tools.saveChartVersion(project_id, chart_id, name, base_revision, config)),
  );

  server.registerTool(
    "create_chart",
    {
      title: "创建 FigTide 图表",
      description: "在 config 指定的数据版本上创建图表。config 必须包含 schema_version、datasetVersionId、图表类型、字段映射和完整设置；先 lint，有问题时不创建。成功返回编辑器链接。",
      inputSchema: {
        project_id: positiveId,
        name: z.string().trim().min(1).max(120).describe("新图表名称"),
        config: jsonObject.describe("完整的 FigTide schema v1 图表配置"),
      },
      annotations: writeAnnotations,
    },
    async ({ project_id, name, config }) =>
      safe(() => tools.createChart(project_id, name, config)),
  );
}
