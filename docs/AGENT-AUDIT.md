# Step 2c：运行审计与用户决策

2026-10-26 · 18-A：运行增加可选确定性 `review`。V9 review_json 存审稿结果和上下文指纹；accepted_fixes_json 存选择的修复 ID 与最终配置指纹。新接受请求的 accepted_fixes/review_hash 经相同 revision/lint 和原决定事务保护，失败回滚，不自动保存。报告可能含项目图表名称及绘图修复参数，仅存本机，不包含原始行/文件名/样例或完整配置；这是旧审计自由文本脱敏说明之外的新增报告范围。详见 [REVIEW.md](REVIEW.md)。预算、恢复、原决定幂等及项目备份不包含审计的边界保持不变。

本轮继续使用 Java Harness，不新增 Python 服务、模型 SDK 或收费调用。运行结束时把脱敏的 trace、用量和提案摘要存进 MySQL；用户接受／拒绝由独立接口记录。后续已补齐[2d的30条双模式评测](AGENT-EVALUATION.md)，真实模型语义效果仍需手动评审。

## 界面

编辑器「绘图助手」有「调整图表」「运行历史」两个页签。历史按当前图表或整个项目查询，可按结果筛选、翻页，查看模型、服务、提示词版本、工具目录哈希、源版本、用量和调用明细。没有配置模型也能查历史。工具参数／返回折叠显示，文本内容以脱敏标记、长度和指纹代替。

提案生成后仍不改变画布。点击「应用这组调整」先校验来源与revision，再持久化用户接受决策；确认成功后才调用编辑器一步历史操作。「不采用这份提案」可填写可选原因并明确拒绝，画布不变。关闭面板、重新生成、撤销或未保存都**不会被推断成拒绝**。

`accepted` 表示用户确认过提案，**不代表图表已保存，也不保证浏览器最终应用成功**。浏览器与MySQL没有跨端原子事务：如果确认写入期间画布变化或页面关闭，接受记录保留，但不会覆盖新草稿。界面在可见时明确提示“确认已记录，但画布已变化，本次未应用”。需要应用时重新生成。接受请求若未写入则不应用草稿，允许重试同一决策。

历史记录只用于追溯：不保存完整图表配置，重启/淘汰后的提案不能直接应用；未决定的历史提案仍可明确拒绝。图表正式版本继续由原来的保存API管理。

## 表与生命周期

Flyway `V5__agent_audit.sql` 新增一张 `agent_runs` 表，一次运行一行：

| 字段 | 内容 |
|---|---|
| run_id / project_id / instance_id | UUID、项目归属、Java进程标识 |
| chart_id / base_revision | 图表逻辑标识和保存基准，新草稿允许空图表 |
| dataset_version_id / source_sha256 / snapshot_hash | 不可变源版本、原文件指纹、原草稿规范化JSON指纹 |
| model / endpoint | 实际返回的模型名和服务来源，不含密钥 |
| prompt_version / catalog_hash | 提示词版本、实际模型函数定义SHA-256 |
| status / outcome / reason_code | 执行终态、用户决策、受控原因代码 |
| steps / max_steps / max_tokens / timeout_seconds | 执行步数与预算 |
| prompt_tokens / completion_tokens / tokens / budget_used | 实际上报用量和保守预算消耗 |
| usage_complete / latency_ms | 用量是否完整、整体耗时 |
| trace_json | 模型请求/响应摘要、工具调用和返回（已脱敏） |
| proposal_json / proposal_hash | 操作和差异摘要、完整候选配置的指纹；没有完整config |
| decision_reason / created_at / finished_at / decision_at | 拒绝原因及各阶段时间 |

`project_id`有外键并随项目删除级联清理；图表和数据版本ID是审计引用，不给旧图表版本增加写入行为。记录按项目和创建时间、图表查询建立索引。现有项目备份格式保持不变，**项目ZIP不包含Agent审计**；审计保存在本机MySQL目录中，需保留这类历史时应备份数据库。

创建运行时先写一条最小排队标记，确保强制退出后可识别未完成任务；这一步失败直接503且不调用模型。完整trace和提案只在终态一次写入。终态SQL只允许更新排队/运行标记，决策另用行锁与条件更新，不会被迟到响应覆盖。

正常关闭会取消在途任务并写终态；新Java进程启动时，把旧进程遗留的排队/运行标记设成 `status=incomplete,outcome=interrupted,usage_complete=false`。不自动重试或继续调用模型。中断前未收到的用量无法确认，不能当成完整零消耗。仍采用一个工作区一个Java后端的本地模式，**不支持多个Java进程同时写同一工作区数据库**。

数据库不可用时，终态暂留内存，API返回 `persisted:false,audit_error:true` 并隐藏可应用提案；查询该运行或点「重试保存记录」可重试同一行。直到记录成功才允许决策。若此时进程也被强制结束，只能恢复已有标记并注明中断，不能保证恢复尚未成功写入的详细trace。

## 状态与决策

| status | 初始outcome | 决策 |
|---|---|---|
| queued / running | running | 不允许 |
| proposed | pending | accepted、rejected 或由有效续改替代为 superseded |
| answered | answered | 不允许；包含回复/拒绝/追问，2d规则初筛不改变此运行状态，语义仍需评审 |
| cancelled | cancelled | 不允许 |
| failed | failed | 不允许 |
| incomplete | incomplete 或 interrupted | 不允许 |

接受和拒绝是终态决策：完全相同的重复请求返回200且原决策时间不变；相反决策或不同拒绝原因返回409。指纹不一致返回409，额外字段和非法原因返回400。接受时必须仍有本进程的合法提案，并重新验证图表保存版本；决策事务对图表revision使用共享锁。决策和图表保存保持分离，不生成 `chart_versions`。

## API

均以 `/api` 开头，所有查询按项目限制：

| 方法 | 路径 | 结果 |
|---|---|---|
| GET | `/projects/{p}/agent/history?chart_id=&outcome=&page=0&size=10` | `{items,page,size,has_more}`；chart/outcome可省略，size最大50 |
| GET | `/projects/{p}/agent/runs/{id}/audit` | 始终从MySQL读取的脱敏审计详情 |
| GET | `/projects/{p}/agent/runs/{id}` | 本进程活动/缓存快照；内存不存在时返回审计详情并标 `historical:true` |
| POST | `/projects/{p}/agent/runs/{id}/decision` | `{outcome:"accepted"或"rejected",proposal_hash,reason?:"可选拒绝原因"}` |

审计详情包含 `persisted:true,historical:true,proposal_summary`，不包含可应用的 `proposal.config`，也不包含原始提示词或模型回复文本。历史列表是轻量元数据，完整trace只在详情读取。

## 脱敏规则和边界

- 不持久化原始数据行、文件、字段样例、数值极值、完整config、用户提示词、模型回复正文或 `reasoning_content`。
- 参数只保留工具白名单字段：数值、布尔、受控枚举、十六进制颜色可以明文；标题、字段名、序列标识/名称、未知参数与错误消息使用 `{redacted:true,chars,sha256}`。SHA-256用于关联比较，不是加密，不提供可逆恢复。
- 字段画像返回保留类型、缺失/唯一计数和字段名的指纹，去除行、样例和极值；图型规范等大型结果记录摘要指纹。非法工具名统一记 `unknown_tool`。
- 每个模型请求保留消息指纹和输出预算；响应保留用量、耗时与消息指纹，不存正文。每个已开始的工具调用有参数摘要和关联call_id；完成批次后记录返回摘要，失败批次所有返回标为撤回。取消/中断可能留下有调用无返回的尾项，不编造成功结果。
- 限长：运行需求2000字（不入审计），参数沿用8000字符上限；参数摘要最多24个已知字段、字段画像最多80列；操作最多30项、差异摘要最多200项，超限标记truncated；拒绝原因最多500字。
- 拒绝原因是用户明确提交的备注，会保留可读内容，同时替换当前配置的API Key及常见Bearer、键值/JSON凭据、sk-token、URL密码格式。此规则不是通用敏感信息识别器，主动备注中的其他研究内容不会自动全部隐藏。
- 接口仍是本地单用户模式，项目归属检查不等于多用户认证。没有新增对公网部署的授权能力。

## 验证命令

```powershell
./scripts/test-agent.ps1       # 助手/快捷操作E2E + 真实Java进程重启验收
./scripts/test-agent.ps1 -All  # 完整Chrome回归 + 重启验收
```

脚本只用本机协议fixture，独立 `labflow_e2e` 库、构建目录和端口。重启验收先创建已拒绝的完整审计及一个慢速在途运行，终止测试Java进程后启动新进程，确认完整审计逐字段不变、在途标记中断且用量不完整，再清理测试项目。不会停止普通8086工作台，不调用真实收费模型。


2026-10-22：Flyway V6 新增 `parent_run_id`。成功续改与父提案 superseded 同事务提交，写入失败回滚；失败/取消/纯追问保留父提案。历史保留父运行入口，superseded 不能覆写为用户接受/拒绝。详见 [连续调整的并发与审计](AGENT-REFINEMENT.md)。


2026-10-22补充：V7/V8增加会话额度、run预留/结算及轮次序号；开始与终态事务同时管理预算，补写不重复扣额，进程恢复按未知用量保守结算。审计仍不保存完整配置或原始对话。详见 [AGENT-SESSIONS.md](AGENT-SESSIONS.md)。
