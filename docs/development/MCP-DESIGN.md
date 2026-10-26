# FigTide MCP server 设计

任务：17-0。实现必须保持为已有 HTTP API 的薄转接层。

## 边界

- MCP 进程只通过 loopback HTTP 访问 FigTide；不连接数据库，不读取工作区文件，不执行模型生成的代码、SQL 或路径。
- 不提供原始数据、原文件、删除、归档、数据集修改或任意 HTTP 请求工具。
- `get_dataset_profile` 调用现有 profile API 后执行与内置助手相同的裁剪：删除 `head`、`filename` 和每个字段的 `samples`。其他数据工具只使用不含 `rows` 的列表接口。
- 预览只调用现有 `figure-tools/preview`，不持久化。保存和创建分别调用现有 charts PUT/POST；所有配置先调用现有 lint，后端仍执行同一套最终校验。
- 已保存图表的写入必须携带调用者给出的 `base_revision`。409 不重试，转换为“图表已被修改，请重新读取后再试”。每次成功 PUT 都由现有后端生成新版本，可在版本历史恢复。

## 连接

基址解析顺序为 `FIGTIDE_URL`、`%LOCALAPPDATA%\FigTide\data\app.port`、`http://127.0.0.1:17861`。只接受 `http` 和 loopback 主机。桌面地址必须通过 `/api/desktop/ping`；显式 `FIGTIDE_URL` 允许开发模式在 ping 为 404 时用 `/api/health` 确认 FigTide。网络错误统一返回“请先启动 FigTide”，不向 MCP 客户端返回堆栈。

Node 请求使用地址本身生成正确的 `Host`，不发送 `Origin`。现有桌面安全过滤器已经允许这种本机请求；任务只增加回归测试，不放宽过滤器。

## 工具与接口

| MCP 工具 | HTTP 调用 | MCP 类型 |
|---|---|---|
| `list_projects` | `GET /api/projects` | 只读 |
| `list_datasets` | `GET /api/projects/{p}/datasets` | 只读 |
| `get_dataset_profile` | `GET /api/projects/{p}/data/{v}/profile` 后脱敏 | 只读 |
| `list_charts` | `GET /api/projects/{p}/charts` | 只读 |
| `get_chart` | `GET /api/projects/{p}/charts/{id}` + `GET .../versions` | 只读 |
| `get_figure_spec` | `GET /api/figure-tools/spec` | 只读 |
| `list_figure_tools` | `GET /api/figure-tools/catalog` | 只读、动态 |
| `lint_chart` | `POST /api/projects/{p}/figure-tools/lint` | 只读 |
| `preview_chart_changes` | `POST /api/projects/{p}/figure-tools/preview` | 只读 |
| `save_chart_version` | lint 后 `PUT /api/projects/{p}/charts/{id}` | 写入、非破坏、非幂等 |
| `create_chart` | lint 后 `POST /api/projects/{p}/charts` | 写入、非破坏、非幂等 |

只读工具注解 `readOnlyHint=true`。两个持久写入工具注解 `readOnlyHint=false`、`destructiveHint=false`、`idempotentHint=false`。预览不写数据，因此仍标为只读。

## 创建图表

`create_chart` 接收调用者提供的完整 schema v1 配置，其中 `datasetVersionId`、图表类型和字段映射必须明确。MCP 不在本地复制前端默认值或 Java 校验规则；先 lint，`ok=false` 时直接返回问题且不创建，`ok=true` 才调用 charts POST。这样支持所有 11 类图及后端未来兼容字段，同时保持唯一校验真值在 FigTide。

## 验证

单元测试覆盖 11 个工具的参数边界、脱敏、动态目录和 HTTP 错误映射。真实集成测试以临时 H2 数据目录启动桌面 JAR，经 SDK stdio 客户端验证工具注解、读取、预览、保存、冲突和隐私。浏览器 E2E 在 MCP 保存后检查版本历史恢复。CI 在 Linux 与 Windows 构建并运行 MCP 测试；发布工作流只准备独立 bundle 附件，不在任务 17 发布。
