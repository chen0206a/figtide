# 任务 18：审稿引擎与多 agent 协作

**先读**：`AGENTS.md`、`docs/development/design/18-multi-agent.md`（设计）、设计画布「任务 18 · 多 agent 与审稿」一页、`docs/FIGURE-TOOLS.md`、`docs/AGENT-PROVIDER.md`、`docs/AGENT-SESSIONS.md`、`docs/AGENT-AUDIT.md`、`docs/AGENT-EVALUATION.md`。
**前置**：任务 17（MCP）和任务 16（独立窗口）已合并到 `main`。
**分支**：从 `main` 新建 `feature/agent-team`，每一节单独提交，不推送。
**分两段交付**：先做 **18-A（审稿引擎）**，完成后按 AGENTS.md 格式汇报一次并**停下**，等仓库主人确认后再做 **18-B（多 agent 协作与评测）**。18-A 单独合并也是一个完整功能。

---

## 本任务的授权范围（覆盖 AGENTS.md「不改后端」）

允许：
- 新增后端代码：`dev.labflow.review` 包（审稿规则）、`dev.labflow.agent.team` 包（编排）；
- 新增接口（第 18-2、18-6 节列出的接口）；在 `POST /agent/runs` 请求里**新增可选字段** `mode`；在运行详情里**新增**字段（`phase`、`roles`、`review`）；
- 新增迁移 `V9__agent_team.sql`，MySQL（`db/migration/`）和 H2（`db/migration-h2/`）各一份；
- 新增前端组件和样式。

不允许：
- 修改 V1–V8 任何迁移；修改或删除现有接口字段；改变现有 `status` 取值的含义；
- 改变单助手模式的行为。单助手模式下，现有评测回放（suite v1.5）必须**原样**通过，现有后端、前端测试不改断言；
- 修改预算预留和结算、请求幂等、断线恢复、取消和超时、乐观锁、提案校验的现有逻辑。协作模式**调用**这些逻辑，不复制、不绕过。如果确实必须改动某个共享方法（例如加一个参数），在汇报里单独列出改了什么、为什么，并证明原有测试全部不改就能通过；
- 把原始数据行、文件名、样例值发给模型（沿用 `get_dataset_profile` 的过滤）；
- 调用收费模型服务。真实模型评测由仓库主人手动运行（见 18-8）。

---

# 18-A 审稿引擎

## 18-1 期刊规则表

1. 新建 `backend/src/main/resources/review/journal-rules-v1.json`，收录 5–8 家期刊或出版社，建议：Nature 系列、Science、Cell Press、PLOS、IEEE、Elsevier、ACS、Springer Nature（任选 5–8 家，以能核实为准）。
2. 每条只记录**数字要求和来源**，不复制作者指南原文：
   ```json
   {
     "id": "nature",
     "name": "Nature Portfolio",
     "single_column_mm": 89,
     "double_column_mm": 183,
     "min_font_pt": 5,
     "max_font_pt": 7,
     "min_line_pt": null,
     "source_url": "https://...",
     "checked_at": "2026-11-xx"
   }
   ```
   上面的数字只是格式示例，**必须逐条到官方作者指南核实**。查不到、或者指南里没写的项填 `null`，不要凭印象填。`source_url` 必须是出版社自己的页面。
3. 另有一条内置的 `default`：单栏 88 mm、双栏 180 mm、最小字号 **6 pt**、最小线宽 0.5 pt，`source_url` 为空，名称「通用（FigTide 默认）」。
4. 加一个单元测试：每条规则的 `source_url` 为 https 链接（`default` 除外），数字在合理范围内（栏宽 40–200 mm，字号 4–12 pt），`id` 唯一。
5. 前端「论文尺寸」面板加一个「目标期刊」下拉框：选中后自动填栏宽，并作为审稿的最小字号来源。默认「通用」。这是可选的配置字段 `publication.journal`，旧配置没有这个字段时按「通用」处理（schema v1 兼容）。

## 18-2 审稿规则（确定性，纯 Java，不调用模型）

新建 `dev.labflow.review`：

```
ReviewService         入口：review(project, config, renderFacts, target) → ReviewResult
ReviewRule (接口)     id()、check(ctx) → List<Issue>
rules/                每条规则一个类：R1FontSize、R2LineWidth、R3ColorVision、R4ColorCount、
                      R6ErrorMeaning、R7LegendOverlap、R8TextOverlap、R9AxisMarking、R10ProjectColors
ColorVision           色觉缺陷模拟 + 色差计算
```

`Issue` 的结构（同时作为接口返回格式）：

```json
{
  "id": "R1:tick-font",            // 规则 ID + 稳定的问题键，同一张图重复审稿时 ID 不变
  "rule": "R1",
  "severity": "error | warning | info",
  "title": "刻度和图例字号太小",
  "detail": "按单栏 88 mm 成品换算，刻度和图例只有 4.6 pt，低于 6 pt。",
  "fixable": true,
  "fix": [ { "tool": "set_style", "args": { "fontPt": 6.5 } } ],  // 只用现有 10 个绘图工具的操作
  "anchor": { "kind": "axis", "ref": "y" }                         // 画布标记的位置，见 18-4
}
```

**关键约束：修复操作只能是现有绘图工具（`FigureOperations` 目录里的 10 个工具）的操作。** 这样修复会经过与提案完全相同的校验链（apply → ConfigValidator → lint），不新增任何写配置的路径。

各规则要求：

| 规则 | 实现 | 修复 |
|---|---|---|
| R1 字号 | 论文尺寸模式下按 `publication` 的成品宽度换算；未开启时按请求里的 `target` 换算。最小字号取目标期刊，默认 6 pt。换算方法与前端 `publicationMetrics` 一致，写一个两端用同一组样例的对照测试 | 论文尺寸模式用 `set_style.fontPt`，否则用 `set_style.fontSize`；修到「最小字号 + 0.5 pt」 |
| R2 线宽 | 各序列 `width` 换算成 pt | `set_series.width` |
| R3 色觉 | 对所有序列颜色两两比较：分别模拟红色盲、绿色盲、蓝色盲（Machado 2009 矩阵，严重度 1.0），计算 CIEDE2000 色差；任意一对 < 20 即报问题。阈值写成常量并在文档说明 | 换成 Okabe–Ito 配色（按序列顺序），用 `set_series.color` |
| R4 颜色数 | 序列数 > 8 | 不修，给意见：建议分面或合并 |
| R6 误差含义 | 有误差列或区间带时：如果数据来自处理规则（派生数据集），从规则里读出 `sd/sem` 和分组 n，检查图注或标题里是否说明；如果是原始误差列，统计口径未知 | 派生数据：可修，补图注（若现有配置没有图注字段，则改为意见并附建议文字）；原始误差列：不修，要求用户确认，**不得猜测是 SD 还是 SEM** |
| R7 图例遮挡 | 使用渲染事实（18-3）：图例边界框与数据点像素坐标求交，重叠点数 > 0 报问题 | 在四个角里选重叠点最少的位置，`set_legend.position`；四个角都重叠时改为意见 |
| R8 文字重叠 | 渲染事实：标题、轴标题、刻度、注释的边界框两两求交，以及是否超出画布 | 不自动修，给意见（指出哪两处文字重叠） |
| R9 对数/截断轴 | 配置里开启了对数轴但轴标题没有标示（如 log、对数） | 不修，给意见 |
| R10 项目内配色 | 读取同一项目其他图表的最新版本，同名序列颜色不同 | 不修，给意见（列出不一致的图表名） |

R5（轴标题是否像物理量、有没有单位）需要模型判断，放到 18-B 的审稿专家里，确定性引擎只检查「轴标题是否为空」。

**缺少渲染事实时**（例如 MCP 调用），R7、R8 返回 `status: "skipped"` 和原因「需要编辑器中的渲染信息」，不能当作通过。

## 18-3 渲染事实（前端采集，只有几何信息）

1. 前端在 Plotly 渲染完成后（`plotly_afterplot`）采集：
   ```ts
   type RenderFacts = {
     version: 1;
     canvas: { width: number; height: number };            // 像素
     plot: Box;                                            // 绘图区
     legend?: Box;
     texts: { role: "title"|"xTitle"|"yTitle"|"tick"|"legend"|"annotation"; box: Box; fontPx: number }[];
     points: { trace: number; x: number; y: number }[];    // 像素坐标，每条序列最多抽样 200 点
     bands: { trace: number; polygon: [number, number][] }[]; // 区间带轮廓，最多 100 个顶点
   };
   ```
2. **只能包含像素坐标、尺寸、字号、颜色**，不能包含任何数据值、字段名、类别名、文字内容。写一个前端单测：用带有可识别数据值和文字的示例图采集事实，断言序列化结果里不出现这些值。
3. 后端校验 `render_facts`：拒绝未知字段，数量上限（文字 ≤ 300、点 ≤ 3000、带 ≤ 20），超限返回 400。
4. 抽样必须确定性（等间隔抽样），同一张图两次采集结果相同，保证审稿结果可复现。

## 18-4 接口

```
POST /api/projects/{p}/figure-tools/review
请求：{ protocol_version: 1, config, render_facts?, target?: { width_mm, journal } }
响应：{ protocol_version: 1, rules_version: "review-v1", journal, issues: Issue[], passed: string[], skipped: {rule, reason}[] }
```

- 只读，事务标记只读，不写库，不调用模型；
- 校验项目归属和配置，规则与 lint 相同；
- `issues` 按严重度、规则号排序，顺序稳定；
- 文档写进 `docs/FIGURE-TOOLS.md` 新的一节，并更新 `docs/API.md`。
- 如果任务 17 的 MCP 已合并：在 `mcp/` 新增只读工具 `review_chart`（不带渲染事实，R7/R8 会显示跳过），补单测并更新 `docs/MCP.md`。

## 18-5 界面：「审稿这张图」（对应画布 18-2）

1. 编辑器顶栏在「绘图助手」左边新增按钮「审稿这张图」（图标 + 文字）。没配置模型也可用。
2. 点击后右侧面板显示「审稿报告」：
   - 顶部：「N 个问题 · M 个可自动修复」；成品尺寸切换（单栏 / 双栏，以及当前目标期刊），切换后重新审稿；
   - 问题卡片：编号、标题、规则号、标签（可自动修复 / 需要你判断 / 已忽略）、说明、修复内容；可修复的有「修复」勾选框（**默认勾选**），每条都有「忽略」和「恢复」；
   - 「已通过」一行列出通过的检查；被跳过的检查单独列出原因；
   - 底部：「以上是确定性检查 · 没有调用模型 · 0 token」；
   - 主按钮「预览修复所选（n）」→ 调用现有 preview 接口得到差异，画布进入「预览中 · 尚未应用」状态 → 「应用到草稿」进入现有撤销栈，一步可撤销。**不自动保存。**
3. 画布标记：橙色编号标记标在 `anchor` 对应的位置（轴、图例、序列末端、文字框）；已修复的问题标记消失；图例遮挡时用虚线框标出图例边界框。标记颜色、编号样式沿用现有提案的编号标记组件，只换颜色。
4. 「忽略」只在当前编辑会话里有效，不写入配置。
5. 深度审稿的勾选框在 18-A 中先显示为禁用，提示「将在后续版本提供」；18-B 中启用。

## 18-6 每份助手提案都附带确定性审稿（单助手模式也一样）

1. 助手提案在前端渲染预览后，前端调用：
   ```
   POST /api/projects/{p}/agent/runs/{id}/review
   请求：{ render_facts?, target? }
   ```
   后端对**提案的配置**运行确定性审稿，结果存进运行记录（V9 新增的 `review_json` 列），并返回 `issues`。
   - 只有 `status = proposed` 且尚未决定的运行可以审稿，否则 409；
   - 重复调用：同一提案哈希、同一渲染事实哈希返回已存结果（幂等）；
   - 不消耗模型预算。
2. **不推翻用户的要求**：如果某条修复操作改动的配置路径，正好是这次提案按用户要求改过的路径（用 `FigureOperations.changes` 比对），这条修复降级为「审稿意见」，`detail` 里说明「与你这次的要求冲突，未自动修改」。写单测覆盖：用户要求图例放上方 → 审稿不会把图例挪走。
3. 提案界面按设计稿 18-1 分三组：「你要求的修改」（蓝色编号）、「审稿修复 · 可逐条取消」（橙色，默认勾选）、「审稿意见 · 不改图」。底部仍然只有一个「应用这组调整（n 项）」。
4. **决定接口扩展**：`POST /agent/runs/{id}/decision` 新增可选字段 `accepted_fixes: string[]`（问题 ID 列表）。后端：
   - 最终配置 = 提案配置依次应用所选修复操作；
   - 对最终配置重新 lint，不通过返回 409「提案不再有效，请重新生成」；
   - 审计记录最终配置的哈希和所选修复 ID；
   - 不传 `accepted_fixes` 时行为与现在完全一样（旧前端、MCP 不受影响）。
5. 预览时取消勾选某条审稿修复，画布实时变回去（前端用现有 preview 接口重新计算）。

## 18-7 迁移 V9

```sql
-- MySQL: db/migration/V9__agent_team.sql
ALTER TABLE agent_runs
  ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT 'single',
  ADD COLUMN review_json JSON NULL,
  ADD COLUMN accepted_fixes_json JSON NULL;
```
H2 版本用 CLOB 代替 JSON，其余一致。`roles` 等运行过程信息写在现有 `trace_json` 里（每条步骤新增 `role` 字段），不另建表。补迁移测试：MySQL 和 H2 都能从 V8 升级，旧记录 `mode = 'single'`；备份恢复往返比对通过。

## 18-A 验收

- 后端 `mvn test`（MySQL、H2）全部通过，新增测试覆盖 9 条规则的触发与不触发、色觉模拟数值（用文献给出的样例颜色核对）、R1 前后端换算对照、修复与用户要求冲突时降级、决定接口带 `accepted_fixes` 的成功和 409、审稿接口幂等；
- 现有 agent 评测回放 suite v1.5 原样 30/30；
- 前端 `npm test`、`npm run build` 通过；渲染事实的隐私单测通过；
- 新增 E2E `review.spec.ts`：打开示例图 → 审稿 → 取消一条修复 → 预览 → 应用 → 撤销，检查画布标记和撤销栈；以及一份助手提案（协议夹具）带审稿修复，取消一条后应用；
- 桌面模式完整 E2E 一次全绿；
- 截图：审稿报告、提案三组、画布标记，放进 `docs/REVIEW.md`（新建，写清规则、阈值、来源、局限）。

**完成 18-A 后汇报并停下。**

---

# 18-B 多 agent 协作与评测

## 18-8 编排（Java 后端，`dev.labflow.agent.team`）

1. **入口**：`POST /agent/runs` 新增可选字段 `mode: "single" | "team"`，不传等于 `single`。`team` 由 `TeamOrchestrator` 执行，其余字段、预算、会话、幂等、取消、超时、审计与单助手完全共用。
2. **角色和工具**（每个角色有独立的系统提示词和工具子集，提示词版本号单独记录）：
   | 角色 | 工具 | 产出 |
   |---|---|---|
   | 协调者 | 只读：字段摘要、图表规格、当前配置 | 计划：最多 4 个子任务，每个指定角色和目标；或直接追问 / 拒绝 |
   | 数据专家 | 只读字段摘要 + 新增工具 `propose_processing`（参数就是现有 `ProcessingRules`，内部调用 `ProcessingService.preview`，不写库） | 处理规则 + 派生字段列表 |
   | 绘图专家 | 现有 10 个绘图工具（预览）+ 3 个读取工具 | 绘图操作 |
   | 审稿专家 | 无写工具；输入为确定性审稿结果 + 提案配置摘要 + 渲染事实摘要 | R5 判断、R6 的建议文字，以及对确定性问题的中文解释 |
3. **流程是一个显式状态机**，写在代码里，不由模型决定下一步：
   ```
   queued → planning → (data) → plotting → proposed → [前端提交渲染事实] → reviewing → proposed(带审稿)
   任意阶段 → cancelled / failed / budget_limited / timeout（沿用现有终态）
   ```
   `status` 取值保持不变（运行中一律是 `running`），新增 `phase` 字段表示当前阶段；现有前端只看 `status` 也能正常工作。
4. **预算**：一次运行只有一份预留（沿用现有预留逻辑）。各角色的上限按比例分配：协调者 15%、数据 30%、绘图 40%、审稿 15%；前一个角色没用完的额度顺延给后面的角色。任何时候累计用量都不能超过这次运行的预留。写测试：某个角色超出自己的上限时，以 `budget_limited` 结束，结算正确。
5. **数据专家的结果怎么落地**：
   - 提案里新增 `processing` 块：`{ source_dataset_version_id, name, rules, preview_hash }`；绘图专家基于派生字段生成操作，提案配置里的 `datasetVersionId` 用占位值 `"$derived"`；
   - 提案阶段的 lint：用派生数据的**内存预览**做校验（给 lint 加一个内部重载，接收预览数据，不新增公开接口）；
   - 用户确认时（`decision` 接口），后端先调用现有 `ProcessingService.commit` 创建派生数据集，再把占位值替换成新的数据版本 ID，对最终配置重新 lint，然后记录决定。**幂等**：用运行 ID 作为键，重复确认不会创建第二个派生数据集；commit 成功但后续 lint 失败时，返回 409，派生数据集保留（它本身是合法的数据，用户可在数据页看到），并在审计里记录；
   - 原始数据始终只读。
6. **失败处理**：协调者、数据专家、绘图专家任何一个失败，整次运行失败，**不交出半成品提案**。审稿专家（模型部分）失败时，提案照常交付，只带确定性审稿结果，并标注「深度审稿未完成：原因」。
7. **审计**：`trace_json` 每一步带 `role`；运行详情新增 `roles: [{ role, steps, tokens, status, summary }]`。审计页面能按角色展开。
8. **深度审稿（单独）**：「审稿这张图」里的深度审稿 = `mode: "review"` 的运行，只有审稿专家一个角色，走同样的预算、同意、审计流程；界面上需要用户勾选同意，说明会把图表配置和渲染事实（不含数据值）发给所配置的模型服务。

## 18-9 界面（对应画布 18-1）

1. 助手面板标题旁加模式切换「单助手 / 协作」，**默认单助手**，选择记在本机偏好里。默认值等评测结果出来后由仓库主人决定是否改。
2. 协作模式运行中按角色显示进度：协调者 → 数据专家 → 绘图专家 → 审稿专家；每段显示一句话摘要和 token 用量，可以展开看工具调用（复用 `AuditTrace` 组件的格式）。
3. 提案的三组和单助手模式一致（18-6）；如果有数据处理，「你要求的修改」第一项是「新建派生数据：……」，并说明确认后会创建一个新的派生数据集。
4. 取消按钮在任何阶段都可用。

## 18-10 评测

1. **改图任务集** `backend/src/test/resources/agent-eval/team-suite-v1.json`：120 条，三类各 40：单步样式、多步结构、需要数据处理（分组汇总、SEM/SD、过滤后绘图）。每条写明期望的配置变化、允许改动的路径、期望的处理规则（如有）。数据全部是合成数据，明确标注。
2. **审稿任务集** `review-suite-v1.json`：40 张「埋了问题」的图，每张埋 1–3 个 R1–R10 的问题，附带对应的渲染事实夹具。确定性部分（R1–R4、R6 派生数据部分、R7–R10）在 CI 里直接跑，报告召回率、精确率、修复后再审通过率。**这部分不需要模型，必须实际跑出结果。**
3. **单助手 vs 协作对比**（同一模型、同一预算上限）：
   - 指标：配置完全符合期望的比例、多余改动率、工具调用次数、token、延迟、预算耗尽率；
   - 回放模式：给每类各 4 条写协议级夹具（共 12 条 × 2 种模式），验证评测框架本身，在 CI 里跑；夹具必须标注为人工编写的协议测试录制，不是模型采样（沿用现有 `fixture_provenance` 约定）；
   - 真实模式：只提供命令，**由仓库主人手动运行**。命令必须沿用现有调用前预算预留（`EvaluationSpendBudget`），默认预估上限写进文档；支持 `-Cases` 选小批量。
4. **报告**：`docs/AGENT-EVALUATION.md` 新增一节「多 agent 协作」：
   - 审稿任务集的实际结果（CI 跑出的数字）；
   - 改图对比：回放结果 + 「真实模式待仓库主人运行」的说明和命令；不得填写未实际运行的数字；
   - 置信区间用 Bootstrap（1000 次重采样，固定随机种子），写清方法；
   - 结论模板：如实写。如果协作没有明显提升，就写明，并说明审稿功能独立有效。

## 18-B 验收

- 后端测试（MySQL、H2）、前端测试和构建通过；suite v1.5 原样 30/30；
- 状态机测试：每个阶段的取消、超时、预算耗尽、角色失败；幂等确认（重复确认只创建一个派生数据集）；提案阶段内存预览 lint；
- 审稿任务集 CI 结果写进报告；12 条协作回放夹具通过；
- E2E `agent-team.spec.ts`：协作模式（协议夹具）跑完四个角色 → 提案三组 → 取消一条审稿修复 → 应用 → 数据页出现派生数据集 → 撤销；
- 桌面模式完整 E2E 一次全绿；
- 截图：协作进度、提案三组、审计按角色展开；
- 汇报按 AGENTS.md 格式，列出新增接口和字段、改动的共享方法（如有）、真实评测的运行命令和预估费用。

## 文档

- `docs/REVIEW.md`（18-A 新建）：规则、阈值、期刊规则表来源、渲染事实的隐私边界、局限（例如色觉模拟是近似、R8 只能发现边界框重叠）。
- `docs/AGENT-TEAM.md`（18-B 新建）：角色、状态机图、预算分配、数据处理落地方式、失败处理、和单助手的区别。
- README 功能列表、GUIDE.md 各补一小节；CHANGELOG「未发布」记录审稿和协作模式。
