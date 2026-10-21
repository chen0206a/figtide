# Step 2b：可取消的绘图提案助手

## 能力与边界

编辑器顶部「绘图助手」：输入调整要求 → 明确同意发送元数据 → Java 工具循环 → 当前数据实时预览与修改明细 → 用户确认 → 一步撤销/重做 → 手动保存。与快捷操作共用 `ProposalPreview`、Java `FigureToolService` 和编辑器历史栈。

未配置模型时明确显示设置说明。普通科研绘图仍完全本地、零 API 成本。连接外部模型后，只有用户勾选并发起的请求才发送当前图表配置、需求及按需读取的字段摘要（包括字段名、类型、计数、极值）；**不发送原始数据行、字段样例、文件或密钥**。配置中的标题、注释、序列名也会发送，请据此选择合适服务。

本轮没有调用真实收费模型。兼容性通过本机真实 HTTP 协议服务验证；不能据此宣称已通过 DeepSeek 线上验收。协议依据 [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) 与 [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)。部分服务不支持函数调用、用量字段或所用 JSON Schema 关键字，需自行确认。

## 本地配置

Windows本机可运行 `scripts/connect-agent.ps1` 打开隐藏密钥输入窗口，填写平台控制台的准确模型ID和API Key。默认地址为 `https://maas.qianwenaiapi.com/compatible-mode/v1`；其他HTTPS兼容基地址可通过 `-BaseUrl` 显式指定，窗口始终显示实际目标地址。此入口是本机启动配置工具，尚不是网页里的连接管理页。

窗口确认后核对8086进程与本项目跟踪记录，再仅重启Java后端。密钥不作为命令行参数、不写文件或Git，只由该Java进程继承；前端和MySQL保持运行。普通重启后需重新输入。加载成功仅表示本地适配器配置可用，不代表已通过上游鉴权、工具调用或模型效果验收；脚本不会调用推理接口。`.runtime/agent-connection-status.json` 只记录无凭据的阶段/通用状态。

该平台[函数调用文档](https://platform.qianwenai.com/docs/developer-guides/tool-calling/function-calling)使用上述基地址；仍需选择实际支持当前非流式Chat Completions工具调用的模型。[平台客户端配置说明](https://platform.qianwenai.com/docs/developer-guides/clients-and-developer-tools/deepseek-harness)指出该兼容端点不提供GET /models，因此窗口要求手填模型ID，不伪造模型下拉列表。特定模型可能需要额外参数，尚未逐个验证。

在启动后端的 PowerShell 环境设置（密钥只读取环境变量，不进入浏览器、数据库或日志）：

```powershell
$env:LABFLOW_AGENT_BASE_URL = 'https://api.deepseek.com'
$env:LABFLOW_AGENT_MODEL = '<服务商提供的支持工具调用的模型名>'
$env:LABFLOW_AGENT_API_KEY = '<你自己的密钥>'
./scripts/start.ps1 -SkipBuild
```

如果后端已运行，先用 `scripts/stop.ps1` 正常停止，再启动，以便进程读取新环境。不要把真实密钥提交到脚本或 Git。可删除这些环境变量恢复禁用状态。

`BASE_URL` 是不带 `/chat/completions` 的基地址；适配器自动追加该路径。支持 HTTPS 服务和本机 HTTP 兼容服务（如 `http://127.0.0.1:端口/v1`），本机 HTTP 允许不设密钥。拒绝远程明文 HTTP、地址内凭据、查询参数、重定向。模型名称由本机部署者设定，本轮未提供浏览器端密钥表单或模型市场。

## API

所有路径以 `/api` 开头。

| 方法 | 路径 | 语义 |
|---|---|---|
| GET | `/agent/provider` | `{available,model,endpoint,reason}`，仅配置状态，不主动调用模型、不计费 |
| POST | `/projects/{p}/agent/runs` | 202，创建运行并返回快照 |
| GET | `/projects/{p}/agent/runs/{run_id}` | 查询状态、回复、用量、简要运行记录、最终提案 |
| POST | `/projects/{p}/agent/runs/{run_id}/cancel` | 取消仍在排队/运行的任务，终态幂等 |

创建请求为严格信封（额外字段拒绝）：

```typescript
{
  protocol_version: 1,
  chart_id: currentChartId,
  base_revision: savedRevision,
  config: currentEditorConfig, // 完整的 schema_version=1 草稿
  prompt: "把图例放右边，字号改为18",
  share_metadata: true,
  max_steps: 6,
  max_tokens: 32000,
  timeout_seconds: 60
}
```

新图 `chart_id:null,base_revision:0`。`config` 必须来自可信编辑器，不接受模型输出作为快照。创建前复用 lint，校验项目、数据归属和保存 revision。需求最长 2000 字，配置最长 24000 字符；超大图本轮不发送模型。

状态：`queued → running → proposed / answered / failed / incomplete / cancelled`。`answered` 包含普通答复、拒绝、追问或没有实际变化的回复；**这些分类的语义正确性仍需后续评测，不能把提示词当成安全证明**。只有 `proposed` 含可应用提案；预算耗尽、超时、失败、取消都不能应用半成品。

提案沿用工具预览字段 `protocol_version/config/changes/operation_count/base_revision/source`，另附 `operations`。浏览器核对原始指纹、数据版本、允许修改范围、当前草稿 token，再展示差异。用户点击应用时重新检查服务器 revision 和 lint；服务端从不调用图表保存路径。

## Harness 约束

- 两个 Java worker，有界等待队列，最多六个在途任务；每个运行 UUID。期限包括排队时间，取消会中断 HTTP future，响应体读取也在超时范围内；迟到响应不能改写已取消状态。取消停止本地运行，已发出请求的费用仍由服务商处理。
- `max_steps` 1–8（默认6）；`max_tokens` 2000–60000（默认32000）；超时1–120秒（默认60）。每轮最多8个工具调用，累计最多30项操作。
- 请求前以消息/工具 JSON 的 UTF-8 字节数加协议余量保守估计输入；`max_tokens` 限制单次输出，最多2048。请求后按实际用量与保守估计的较大值扣减总预算。`tokens` 是服务商上报的累计用量，`budget_used` 是保守预算消耗，两者可能不同。该策略不等价于特定分词器或精确账单上限，服务商实际计费仍以服务商为准。
- 拒绝缺少合法 usage 的响应；上游响应体最多1 MB。上游错误只返回通用状态，不透传可能含凭据/用户内容的错误体。
- 模型工具定义派生自现有十个操作工具；读工具参数由 harness 收窄：`get_dataset_profile({})` 只能读取绑定数据版本且去掉行与样例，`lint_figure({})` 只能检查候选配置，`get_figure_spec({type?})` 读取规范。模型不能注入项目 id、路径、config、revision 或密钥。
- 每个模型响应的修改调用收集后对完整批次校验；任何一项失败，本轮全部撤回，准确错误反馈给模型重试。先前已验证的候选批次保留，但始终未应用。最终提案再次 preview + lint。
- 提示词版本 `figure-assistant-v1`；`catalog_hash` 为实际模型函数定义的 SHA-256，保留协议版本1，避免新增工具后无法区分运行版本。

## 测试与下一步

```powershell
# 先启动本机 MySQL；独立测试使用 8087 / 5178 / 18769，不干扰工作台端口
./scripts/test-agent.ps1        # 助手与快捷操作浏览器测试
./scripts/test-agent.ps1 -All   # 完整 Chrome E2E
```

脚本在 `.runtime/agent-e2e-build` 独立编译打包，不覆盖正在运行的工作台JAR；创建/复用 `labflow_e2e` 数据库，显式开启仅测试库可用的清理接口；结束后按水位清理这一独占测试库，关闭自己启动的 Java/协议 fixture/Vite 进程。普通 `scripts/start.ps1` **不再开启破坏性清理接口**；即使误加开关，正式 `labflow` 库也返回403。测试库仍应独占，不应有人在测试期间写入其他需保留的项目。

后续Step 2c已增加MySQL持久审计与接受/拒绝决策，见 [AGENT-AUDIT.md](AGENT-AUDIT.md)。活动快照仍在内存保留最多100条；淘汰或重启后可查询脱敏历史，但不能重新应用旧提案。Step 2d已增加[30条回放/真实双模式评测](AGENT-EVALUATION.md)，本机HTTP验证只证明兼容协议与运行器路径，不代表真实模型语义效果已经通过验收。
