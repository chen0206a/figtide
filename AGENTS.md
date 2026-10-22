# AGENTS.md — LabFlow 前端重构

> 放到仓库根目录。Codex 每次开工前先读本文件，再读 `refactor/REFACTOR-PLAN.md` 和当前要做的 `refactor/tasks/NN-*.md`。

## 你在做什么

按 `refactor/tasks/` 的编号**逐个**完成前端重构。每个任务文件都写明了目标、要改的文件、具体步骤和验收标准。一次只做一个任务，做完、验证、提交，然后停下来汇报，再开始下一个。

参考实现放在 `refactor/reference/`，目录结构和仓库一致（例如 `refactor/reference/frontend/src/styles/tokens.css` 对应 `frontend/src/styles/tokens.css`）。参考代码没有在真实依赖下编译过，复制过去以后**必须**让 `tsc` 和测试通过，不要假设它一定正确。

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
