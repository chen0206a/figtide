# AGENTS.md — FigTide 前端重构

> 放到仓库根目录。Codex 每次开工前先读本文件，再读 `docs/development/REFACTOR-PLAN.md` 和当前要做的 `docs/development/tasks/NN-*.md`。

## 你在做什么

按 `docs/development/tasks/` 的编号**逐个**完成前端重构。每个任务文件都写明了目标、要改的文件、具体步骤和验收标准。一次只做一个任务，做完、验证、提交，然后停下来汇报，再开始下一个。

参考实现放在 `docs/development/reference/`，目录结构和仓库一致（例如 `docs/development/reference/frontend/src/styles/tokens.css` 对应 `frontend/src/styles/tokens.css`）。参考代码没有在真实依赖下编译过，复制过去以后**必须**让 `tsc` 和测试通过，不要假设它一定正确。

## 不能动的东西（硬约束）

1. **不改后端**。唯一例外是任务 01 中给可选字段 `evaluation.legendMetric` 补 Java 校验和测试，那一处任务文件里写明了。不改 API 字段，不改 Flyway 迁移。
2. **schema v1 兼容**：旧图表配置必须能打开，渲染结果除了任务 01 列出的修复项以外不能变化。新增配置字段只能是可选字段。
3. **数据语义**：原始数据只读；不伪造误差、样本或显著性；过滤和统计必须有显式规则。
4. **编辑器行为**：撤销/重做、本机草稿（`labflow-draft-v1:*`）、乐观锁 revision、离开提示、Ctrl+S、Ctrl+Z、Ctrl+K 的行为不能改变。
5. **绘图助手**：「提案 → 校验 → 预览 → 用户确认」流程不变，不自动保存，不自动发送模型请求。预算预留/结算、请求 ID 幂等、断线恢复的逻辑**一行都不要改**，任务 06 只调整布局。
6. **可访问性**：可点击的东西必须是 `<button>` 或 `<a href>`；纯图标按钮要有 `aria-label`；正文对比度至少 4.5:1。
7. 不删除用户工作区数据，不调用收费模型服务。E2E 只使用测试库和本地协议夹具。

## 视觉规则（任务 02 之后生效）

- 颜色、字号、圆角、间距、阴影只能使用 `frontend/src/styles/tokens.css` 里的 `--lf-*` 变量。组件 CSS 里不要再新增十六进制颜色（图表 SVG 和 Plotly 配置除外）。
- 字体只用 Inter 和 JetBrains Mono，系统中文字体作为回退。**不再使用衬线字体**。
- 编号、规格、ID、哈希、时间这类信息用 `.lf-mono` 或 `.lf-kicker`。
- 工具页面不放大标语，统一用 `PageHeader`（任务 03）。
- 主按钮是墨黑色（`--lf-primary`），链接和选中态用蓝色（`--lf-link`、`--lf-selected`）。朱红色 `--lf-accent` 只用来突出关键数字，每屏最多一两处。

## 动效规则（任务10起）

只对 `transform`、`opacity`、`clip-path`、`stroke-dashoffset` 做动画，不对布局属性做动画。微交互150–250ms，元素入场500–900ms；工作区整段入场不超过1.2s，产品介绍页可以更长。缓动统一使用 `--lf-ease-out`（`cubic-bezier(.22,1,.36,1)`）和 `--lf-ease-in-out`（`cubic-bezier(.65,0,.35,1)`）。`prefers-reduced-motion: reduce` 时关闭所有入场和循环动画，内容直接显示最终状态。动画不能阻塞操作，入场过程中按钮也必须可以点击。

## 每个任务的固定流程

```bash
# 开工前
git status                      # 必须干净
git switch -c refactor/NN-name  # 每个任务一个分支，或者在同一分支上逐个提交

# 改完后（在 frontend 目录）
npm test                        # vitest 全部通过
npm run build                   # tsc -b + vite build 通过
npx playwright test <任务文件列出的 spec>   # 需要本地后端 + 测试库

# 提交
git add -A && git commit -m "refactor(NN): <一句话>"
```

- 任务文件里列出的 E2E spec 必须跑。跑不了时（例如没有后端），在汇报里写「未执行」和原因，**不能**写成通过。
- 改动了 UI 文案或结构，导致已有测试失败时：先确认是任务文件**明确要求**的改动，再更新测试。不要为了让测试通过而删除断言；只能把断言改成新文案或新结构的等价断言。
- 每个任务结束时，在 `docs/TEST-RESULTS.md` 顶部追加一段：日期、任务编号、实际运行的命令和结果（通过数 / 失败数 / 未执行项）。

## 汇报格式（每个任务结束时）

```
任务 NN：<名称>
改动文件：<列表>
验证：npm test x/y；build 通过/失败；E2E <spec> x/y（或未执行：原因）
与任务文件的偏差：<没有 / 具体说明>
需要人决定的事：<没有 / 具体问题>
```

## 常用定位

- 路由与外壳：`frontend/src/App.tsx`、`components/WorkspaceNav.tsx`、`lib/routes.ts`
- 首页：`components/HomePage.tsx`（任务 04 用 `components/home/` 替换）
- 编辑器：`editor/Editor.tsx`（`Workbench` 位于第 181–2339 行）
- 绘图管线：`editor/plot.ts` → `plot-core.ts` → `evaluation.ts`、`confusion.ts`、`distribution.ts`、`empirical.ts`、`heatmap.ts`、`bands.ts`
- 草稿：`lib/chartDraft.ts`、`lib/draftWriter.ts`
- 助手：`editor/AgentAssistant.tsx`、`agent-assistant.css`
- 全局样式：`styles.css` 和 `components/*.css`（任务 02 和 08 会整合）

## 桌面版后端授权（任务 14）

> **桌面版后端授权（任务 14）**：在任务 14 的任务书明确列出的范围内，允许修改后端：新增 H2 依赖、`desktop` profile、`db/migration/h2/` 迁移脚本；为了两种数据库通用而做的可移植性修改（如显式赋值 `updated_at`、用 Java 计算替代数据库专有函数）；测试数据源参数化。仍然禁止：修改已有的 MySQL 迁移脚本（`db/migration/V*.sql`）；改变 API 的请求和响应；改变乐观锁、预算、幂等、恢复的业务语义；连接或修改真实工作区数据库。每一处后端改动都要在汇报里写明属于哪一类授权。
>
> 新增迁移必须同时提供 MySQL 和 H2 两个版本（`db/migration/` 与 `db/migration-h2/`，版本号与文件名一一对应；`MigrationParityTest` 会校验）。
>
> H2 迁移脚本放在 `db/migration-h2/`（与任务书写的 `db/migration/h2/` 不同）：Flyway 11 的 `classpath:` 位置会**递归扫描子目录**，H2 目录若放在 `db/migration/` 之下，默认 MySQL profile（locations=`classpath:db/migration`，一行不改）会同时扫到两套 V1–V8 并报 `Found more than one migration with version 1`。因此 H2 脚本目录必须与 `db/migration/` 平级。实测证据见 `docs/desktop/H2-PROBE.md`。

## 桌面启动器授权（任务 14-2）

按 `docs/development/tasks/14-2-launcher.md`，允许新增 desktop 启动/托盘/静态页面配置、仅 desktop profile 的 `GET /api/desktop/ping`、desktop 的 Host/Origin 校验和测试/构建脚本；默认开发 profile 的行为、已有 API、MySQL 迁移与业务语义不变。

## 桌面迁移工具授权（任务 14-3）

按 `docs/development/tasks/14-3-migration.md`，允许：`BackupService` 的备份大小上限改为配置项（默认值不变，仅 `desktop` profile 调大）及配套 multipart 配置；新增 `scripts/migrate-to-desktop.ps1`（及其 Node 实现）与 `docs/desktop/MIGRATION.md`；恢复后用现有 `PUT /api/projects/{p}` 接口补齐归档状态（不改 `restore()` 语义）；在隔离测试库上验证迁移的测试设施。**仍然禁止**：对旧版发任何写请求（只用 `GET /api/projects` 与 `GET /api/projects/{p}/backup`）；连接或修改真实工作区（`labflow` 库 / 8086）与用户桌面数据目录；在任何真实数据上运行迁移工具；修改已有 MySQL 迁移脚本或 API 的请求/响应。

## 桌面打包范围（任务14-4）

用户已授权14-3修复通过后进入14-4。现有DESKTOP-PLAN第6节已定义jlink/jpackage、图标/版本及标签Release构建；仓库没有既有14-4单独任务书，按该范围细化为`docs/development/tasks/14-4-packaging.md`。允许新增打包/产物探针/CI脚本与图标格式转换、给desktop构建记录产物元数据；不改后端业务或数据格式，不读写用户目录。仅本地提交，不替用户推送、打标签或发布。

## 桌面最终验收（任务14-5）

用户授权14-4通过后继续现有计划的后续任务并在全部验收后暂停。按DESKTOP-PLAN第6节细化为`docs/development/tasks/14-5-acceptance.md`，允许扩展隔离测试入口以运行真实EXE、补CI/文档/验收证据。不得修改产品业务语义或使用真实数据，未实际执行的系统托盘/SmartScreen人工项必须注明。

## v0.2.0发布授权（任务15）

仓库主人已确认任务15的人工检查前提通过。按当前任务书15-1到15-5执行，允许版本元数据、指南/截图、资料归档与发布工作流配套调整，不改变后端业务。仅15-4授权推送release/v0.2.0、开PR到main、等待包括H2在内的全部CI通过后merge-merge、在合并main打v0.2.0标签并推送；工作流只准备草稿，检查附件/校验后发布。遇到冲突或检查失败停止，不强推、不改写旧历史、不用本地ZIP替代CI失败产物。仅清理已经合并的指定远端发布/desktop分支，本地保留。15-5重新下载实际发布ZIP复核。完整范围以任务书为准。

2026-10-25补充授权：修复Windows行尾失败，新增Git换行规则并单独提交；DesktopPagesTest比较资源实际字节，保留缓存/404断言；PR到main也执行完整Windows构建测试且不创建Release。修复PR全部检查通过后普通merge，本次只允许删除并在新main重打v0.2.0这一个标签，禁止强推分支。随后遵守发布草稿核验、失败即停、Pages/已合并远端分支清理和重新下载冒烟流程，并追加处理结果。

## 独立窗口授权（任务 16）

按 `docs/development/tasks/16-edge-app-window.md`，允许：新增 Edge 应用模式启动（注册表/程序目录查找、`--app` 启动参数、固定 `user-data-dir`）、找不到 Edge 时退回默认浏览器、`--labflow.desktop.window` 配置项、托盘「在浏览器中打开」与升级气泡、前端 `manifest.webmanifest`、CHANGELOG/GUIDE/README 文档、`docs/desktop/APP-WINDOW.md`、单测与 Windows CI 进程探针脚本（`--remote-debugging-port=0` 仅限测试）。仍然禁止：改变已有 API 请求/响应与业务语义、修改 MySQL 迁移、改动默认开发 profile 行为、伪装任务栏图标。仅本地提交，不推送。

## MCP server 授权（任务 17）

按 `docs/development/tasks/17-mcp-server.md` 实施。允许新增独立 `mcp/` TypeScript 包、MCP 单元/集成/E2E、文档与构建发布接线，以及只为固定现有 Host/Origin 行为而补后端测试。MCP 只调用已有 HTTP API，不新增或放宽后端接口，不直接读写数据库，不返回原始数据行、文件名或样例值。写入必须使用现有 lint、预览、保存与 revision 冲突保护。每节单独本地提交；本任务不推送、不打标签、不发布。

2026-10-26 补充授权：用户要求修复任务 16/17 审查发现的问题，完成回归后推送功能分支。允许修复 MCP lint 报告脱敏、窗口早期异常退出回退、真实启动链路探针及相应测试/文档，并整合两项功能验证。不直接合并 main，不打标签或发布。
