# 任务 17：FigTide MCP server

**先读**：`AGENTS.md`、`docs/FIGURE-TOOLS.md`、`docs/API.md`、README「数据与隐私」一节、`docs/desktop/` 下的桌面版文档。
**目标**：让电脑上的 AI 客户端（Claude 桌面版、Claude Code、Codex、Cursor 等）通过 MCP 读取 FigTide 的项目和数据摘要，预览并保存图表修改。所有写入都经过现有的校验和乐观锁，不绕过任何规则。
**分支**：从 `main` 新建 `feature/mcp`，每节单独提交，不推送；发布另行授权。

---

## 17-0 设计原则

1. **薄转接层**：MCP server 只调用 FigTide 已有的 HTTP 接口，不复制任何校验逻辑，不直接读写数据库。
2. **隐私与内置助手一致**：数据只返回字段摘要（与内置助手的 `get_dataset_profile` 相同的过滤：不含原始数据行、文件名、样例值）。**不提供读取原始数据行的工具。** README 的隐私说明补一段：MCP 客户端会收到这些工具返回的内容，以及客户端使用的模型服务会看到它们。
3. **写入可撤回**：只提供「预览」和「保存为新版本」两类写操作。不提供删除、归档、修改数据集或原始文件的工具。保存一定会生成新版本，用户可以在版本历史里恢复。
4. **冲突不覆盖**：保存时必须带 `base_revision`，后端返回 409 时，把它转换成清楚的提示（「图表已被修改，请重新读取后再试」），不自动重试、不强制覆盖。
5. **工具注解**：只读工具标 `readOnlyHint: true`；写入工具标 `readOnlyHint: false`、`destructiveHint: false`、`idempotentHint: false`，让客户端在调用前请用户确认。

## 17-1 包结构与连接

1. 新建 `mcp/`（TypeScript），使用官方 `@modelcontextprotocol/sdk` 和 `zod`，锁定确切版本；stdio 传输。
2. 用 esbuild 打成**单个零依赖文件** `mcp/dist/figtide-mcp.cjs`，用户只需要 `node figtide-mcp.cjs` 即可运行（要求 Node 18+，启动时检查版本并给出清楚的报错）。
3. 连接地址按顺序确定：环境变量 `FIGTIDE_URL` → 读取 `%LOCALAPPDATA%\FigTide\data\app.port` → 默认 `http://127.0.0.1:17861`。连接后调用 `GET /api/desktop/ping` 确认对方是 FigTide 桌面版；连不上时，返回「请先启动 FigTide」这样的可读错误，而不是堆栈。
4. 也要支持开发模式（`FIGTIDE_URL=http://127.0.0.1:8086`）。
5. 确认桌面版的 Host / Origin 校验允许这类本机请求（Node 发出的请求 Host 为 `127.0.0.1:<端口>`，不带 Origin），并补一条后端测试固定这个行为；不得为 MCP 放宽任何现有校验。

## 17-2 工具清单

| 工具 | 类型 | 对应接口 / 说明 |
|---|---|---|
| `list_projects` | 只读 | 项目列表（含归档标记、数量统计） |
| `list_datasets` | 只读 | 某项目的数据集和版本（不含原始行） |
| `get_dataset_profile` | 只读 | 字段摘要，过滤规则与内置助手一致 |
| `list_charts` | 只读 | 图表列表 |
| `get_chart` | 只读 | 图表当前配置、revision、版本数 |
| `get_figure_spec` | 只读 | 11 类图需要的字段角色 |
| `list_figure_tools` | 只读 | 来自 `/api/figure-tools/catalog`，动态生成，后端新增工具时自动跟上 |
| `lint_chart` | 只读 | 检查配置，返回问题列表 |
| `preview_chart_changes` | 只读 | 传入 operations，返回差异，不保存 |
| `save_chart_version` | 写入 | 带 `base_revision` 保存；返回新 revision 和编辑器链接 |
| `create_chart` | 写入 | 在指定数据版本上按图表类型和字段映射新建图表；先 lint，有问题就返回问题、不创建 |

每个写入工具的返回内容都要包含编辑器链接（`http://127.0.0.1:<端口>/projects/<p>/figures/<id>`），方便用户点开查看。

工具描述用中文写清楚：什么时候用、参数含义、常见错误。描述本身就是给模型看的提示词，要准确、不夸大。

## 17-3 测试

1. **单元测试**：每个工具的参数校验、错误映射（连接失败、404、409、400 校验错误），使用模拟的 fetch。
2. **集成测试**：用临时数据目录启动桌面版 jar，用 MCP SDK 的客户端通过 stdio 连接 `figtide-mcp.cjs`：
   - 列出工具，核对注解；
   - 读取示例项目 → 预览修改 → 保存 → 再读取，确认 revision 加 1、配置变化正确；
   - 用旧的 `base_revision` 保存，确认返回冲突提示、图表未被修改；
   - 确认没有任何工具能返回原始数据行（对返回内容做断言）。
3. **E2E**：MCP 保存之后，用浏览器打开编辑器，能看到新版本，版本历史里可以恢复到上一版。
4. CI：`mcp/` 的单元测试和集成测试加入现有工作流，Linux 和 Windows 都跑。

## 17-4 文档与发布准备

1. 新建 `docs/MCP.md`：
   - 是什么、能做什么、不能做什么（不读原始数据行、不删除）；
   - 接入方法：Claude 桌面版（`claude_desktop_config.json`）、Claude Code（`claude mcp add`）、Codex（`~/.codex/config.toml`）、Cursor，各给一段可复制的配置；
   - 隐私说明：客户端所用的模型服务会看到工具返回的内容；
   - 常见问题：FigTide 没启动、端口变了、保存冲突。
2. README 功能列表和隐私一节补充 MCP；GUIDE.md 加一节「让 AI 客户端操作 FigTide」。
3. `desktop-release` 工作流把 `figtide-mcp.cjs` 作为单独的 Release 附件发布，并写入 SHA256SUMS（本任务只改工作流并在 PR 上验证，不打标签）。
4. CHANGELOG 新增「未发布」一节，记录 MCP server。

## 总验收

- `mcp/` 单元测试、集成测试通过；后端 `mvn test`（MySQL 和 H2）、前端测试和构建通过；桌面模式完整 E2E 加 MCP 用例一次全绿。
- 用 MCP Inspector 手动连一次，截图工具列表放进 `docs/MCP.md`。
- 汇报按 AGENTS.md 格式，列出每个工具和它调用的后端接口；最后写出仓库主人在 Claude 桌面版或 Codex 里自己试用的步骤。
