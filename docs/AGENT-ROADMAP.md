# Agent 接入路线图（2026-10-21）

承接 [Step 1 工具面清单](AGENT-STEP1-PLAN.md)。工具与校验已经在 Java 侧闭环，模型只负责给出提案；`config / chart_id / base_revision / source` 一律由可信编辑器或 Harness 绑定，不能把模型自带的完整配置透传成当前草稿。

分四步，**每步单独提交**，前一步验收通过再开下一步。

## 2a 只读工具与原子性（已完成，提交 `Step 2a`）

- `GET /figure-tools/spec`（`get_figure_spec`）：十一类图的必填/可选角色、所需专业配置块、固定 X 类型、硬规则；纯静态、无默认值。
- `POST /projects/{p}/figure-tools/lint`（`lint_figure`）：包现有 `validateAndReport`，合法返回 `{ok:true, source}`，不合法返回 `{ok:false, issues:[{code,message}]}` 而不是 400；协议/信封/跨项目/旧 revision 仍 400/404/409；只读。
- 目录新增 `read_tools`（`get_figure_spec`、`lint_figure`、`get_dataset_profile`），与十个可预览工具分开。
- 批次原子性固化：全过或全不生效、预览一次、撤销一步；失败批次不动 `revision` 与 `chart_versions`。
- 测试隔离：E2E `globalSetup` 记水位、`globalTeardown` 调 `DELETE /api/test/projects?after=` 清理；接口只在 `--labflow.test-support=true` 时注册，要求 `X-LabFlow-Test-Run: 1` 且 `after>=1`。2b核查后增加仅允许 `labflow_test/labflow_e2e` 库、普通启动默认关闭；水位清理只能用于独占测试库。

已交付判据：Java 73/73、Vitest 124/124、E2E 42/42（清理 37 个项目，库计数不变）。

## 2b 模型适配层（已实现，验证与边界见 AGENT-PROVIDER.md）

实现为 `ModelProvider` + Chat Completions HTTP 适配器 + 有界 Java 运行循环与编辑器提案确认。详见 [运行协议、配置与边界](AGENT-PROVIDER.md)。未进行收费服务实测，完整持久审计和30条评测仍属于2c/2d。

- **最小 provider 接口**：输入「消息列表 + 工具定义」，输出「文本或工具调用」。先接一家 OpenAI 兼容的 DeepSeek 端点；密钥只从环境变量读，不落库、不写日志、不进仓库。
- **循环用 Java 写**，不引入 LangGraph / FastAPI / 额外 Python 服务：工具、校验、数据都在 Java，多起一个进程只会增加部署与调试面。Harness 的价值在预算、取消、校验、审计、评测，不在框架名字。
- 循环必须有：最大步数、最大 token（或等价预算）、超时、可取消、每次运行唯一 `run_id`。
- **agent 只产出提案**：`operations` 回到现有预览链路 → diff 卡片 → 用户确认 → 一步撤销。没有用户确认就没有写入。
- 失败语义：模型给出不存在列/越界参数时，先用 `lint_figure` 自检，把 `issues[0].message` 回灌再试；超预算或超时以「未完成」结束并保留 trace，不自动放宽限制。

## 2c 审计与 trace

一张表（Flyway 新版本）记录：

| 列 | 内容 |
| --- | --- |
| `run_id` | 唯一运行 id（UUID） |
| `model` | 实际模型名与端点的可读标识（不含密钥） |
| `prompt_version` | 提示词模板版本 |
| `catalog_version` / `catalog_hash` | 工具目录版本与内容哈希。`protocol_version` 仍是 1，所以评测必须靠哈希区分「哪一版工具集」 |
| `steps` | 每次工具调用与返回（截断到上限）、步数 |
| `tokens` / `latency_ms` | 用量与耗时 |
| `proposal` | 最终 `operations` 与预览结果摘要 |
| `outcome` | `accepted` / `rejected` / `cancelled` / `failed`，以及用户拒绝时的可选原因 |

写入时机：运行结束或取消时一次性落库（含失败），不记录用户数据内容本身。

## 2d 评测集与运行器

- 30 条用例，三类：**正常**（能直接提案并 lint 通过）、**应拒绝**（要求越权写入、改数据、伪造列、超预算、注入指令）、**应追问**（信息不足应提问而不是猜）。
- 运行器两种模式，同一套断言：
  - **回放**：用录好的模型输出跑，快、确定、不需要密钥，进 CI。
  - **真实**：调真模型，出对比表（通过率、步数、token、耗时、被拒绝率），用于版本对比。
- 断言只看行为：是否调用了允许的工具、是否产生非法操作、是否在预算内结束、是否正确地拒绝/追问、最终 proposal 能否通过 lint。

## 不在本路线图内

认证与多用户、云端部署、任意代码执行、第三方 Skill、自动保存、模型自带的完整配置透传。
