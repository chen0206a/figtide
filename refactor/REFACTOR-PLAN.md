# LabFlow 前端重构方案

基线：2026-10-22 源码快照（Git 77ee2ba + 打包时未提交改动）。
范围：只做前端，包括视觉统一、页面替换、组件整理和图表 bug 修复。首页需要的数据都已有接口，**不需要新增后端接口**。唯一的后端改动是任务 01 给新增的可选配置字段补一行 Java 校验和测试，这是 CONTRIBUTING.md 对配置扩展的要求。
原则：沿用交接说明中「新功能不着急，把已有的先搞好」。保持 API、schema v1、Flyway、导出行为和助手提案流程兼容。

---

## 一、问题清单（按影响排序）

### A. 图表正确性（直接影响论文图）

| # | 问题 | 位置 | 根因 |
|---|---|---|---|
| A1 | 按类别分组后，同一序列的各组颜色完全相同（如 SEM 图的 Baseline 和 Method A 同为紫色） | `editor/plot-core.ts` 第 88–145 行；`evaluation.ts`、`distribution.ts`、`empirical.ts`、`bands.ts` 同样 | 每组 trace 都直接取 `s.color`，没有按组区分编码 |
| A2 | 分组图例过长：「Accuracy · mean ± SEM · Baseline」 | 同上 | 名称固定为「序列名 · 组名」 |
| A3 | 整数 X 轴（epoch / seed）出现 1.5、2.5 刻度 | `plot-core.ts` 中的 `axis()` | Plotly 在跨度很小时会自动选小数步长，代码没有处理整数数据 |
| A4 | 混淆矩阵副标题「Model A · 全部 · n=9」被色块压住 | `editor/confusion.ts` | 注释写在 `y=1, yshift=14`，但顶部边距没有为它预留空间 |
| A5 | 混淆矩阵色条：计数显示 0.5、1.5 刻度；英文图里出现中文标题「样本数」；标题和刻度重叠 | `confusion.ts` + `heatmap.ts` 中的 colorbar | 色条沿用通用热力图设置，没有针对计数或比例单独配置 |
| A6 | ROC/PR 图例里没有 AUC/AP，只能在底部标签页里看到 | `editor/evaluation.ts` | 没有这个选项 |
| A7 | 默认序列配色有两套来源：`model.ts` 的 `palettes` 与 `stylePresets.ts` 的 `colors` 不一致（新图默认是紫色，选「清晰学术」后又变成蓝色） | `model.ts` 第 162 行，`stylePresets.ts` | 重复定义 |

**A1–A6 已经写好补丁**：`patches/01-chart-fixes.patch`，附 11 个回归测试。A7 放在阶段 1 里一起处理。

### B. 视觉系统（「看起来不统一」的根源）

| # | 问题 | 证据 |
|---|---|---|
| B1 | **两套设计系统叠在一起**。`styles.css`（2533 行）仍然是「暖纸 + 衬线 + 陶土色」杂志风格，现在看到的冷灰现代风格是靠 `refinements.css` 里 `.refined-shell { --paper:… --clay:#3f71c9 }` 覆盖出来的 | `styles.css` 第 1–60 行、`components/refinements.css` 第 1–10 行 |
| B2 | 15 个 CSS 文件共 7820 行，硬编码颜色有 **417 种不同的十六进制值**，26 处 `!important` | 统计命令见阶段 0 |
| B3 | 仍在加载 Newsreader 衬线字体，`styles.css` 有 22 处 `var(--font-serif)`。数据页文件名显示成衬线体就是这个原因 | `main.tsx` 第 5 行 |
| B4 | `docs/DESIGN.md` 的「视觉规范」描述的还是暖纸杂志风格，和实际界面不一致 | DESIGN.md 第 110–117 行 |
| B5 | 首页的页头限宽 1200px 居中，工作台的页头铺满全宽，切换页面时导航栏会横向跳动 | `navigation.css`、`showcase.css` |
| B6 | 每个页面顶部都有一句约 200px 高的大标语（「把探索，沉淀为记录。」等），挤占工具页面的空间 | `App.tsx` DataPage、`Experiments.tsx` |
| B7 | 有内联样式写死的颜色，例如 DataPage 的 `planner-entry` 用了 `background:#f6f6f7` | `App.tsx` 第 684–695 行 |

### C. 组件结构

| # | 问题 | 位置 |
|---|---|---|
| C1 | `Editor.tsx` 共 2478 行，其中 `Workbench` 一个函数约 2150 行：包含 30 多个 state、草稿、渲染、保存、导出、快捷键，以及工具栏、左栏、画布、底栏、6 个属性页、导出与历史对话框 | `editor/Editor.tsx` 第 181–2339 行 |
| C2 | `App.tsx` 内联了 `DataPage`（220 行），也承担项目创建和上传状态 | `App.tsx` 第 554–771 行 |
| C3 | `AgentAssistant.tsx` 988 行，界面和运行状态机混在一起；预算设置放在输入框正上方，建议按钮和发送按钮被底部「应用」栏遮住 | `editor/AgentAssistant.tsx` 第 700–900 行，`agent-assistant.css` |
| C4 | 首页有图廊轮播（`FigureShowcase`）和 Matplotlib 示例 PNG。它和产品功能无关，还要额外维护许可证说明 | `components/FigureShowcase.tsx`、`public/showcase/` |
| C5 | 编辑器顶栏有 6 个纯文字按钮，面板开关和动作混在一起 | `Editor.tsx` 第 759–879 行 |
| C6 | 实验页底栏写「已选 0 / 8 个实验」，看起来像「共 8 个」，其实 8 是上限 | `experiments/Experiments.tsx` 第 292 行 |

---

## 二、目标形态

- **一套 token**：`src/styles/tokens.css` 是颜色、字号、圆角、间距和阴影的唯一来源。旧变量名（`--ink`、`--paper` 等）先映射到新 token 作为过渡，最后删除。
- **一套外壳**：顶栏统一 64px、铺满全宽。首页和工作台用同一个页头，只有内容区宽度不同。
- **工具页面去掉大标语**：统一使用 `PageHeader` 组件（小标题 + 一行说明 + 右侧按钮），高度不超过 96px。
- **首页 A**：打开就是工作台。最近一张图用真实渲染的大预览，下面是快速开始、项目表和实验表（设计稿见 `design/home-A.png`）。
- **公开展示页 B**：独立的静态站 `site/`，不依赖后端，可以部署到 GitHub Pages（设计稿见 `design/landing-B.png`）。
- **编辑器拆分**：拆成 hooks（草稿、渲染、保存、导出、快捷键）和面板组件。**行为和 DOM 结构保持不变**，现有 E2E 不需要大改。

---

## 三、阶段与顺序

每个阶段对应一份 `tasks/NN-*.md`，单独提交、单独验证，出问题可以逐个回滚。

| 阶段 | 内容 | 风险 | 预计改动 |
|---|---|---|---|
| 0 | 建分支、记录基线测试结果与 CSS 统计 | 无 | 只写文档 |
| 1 | 打入图表修复补丁，统一配色来源（A1–A7） | 低 | `editor/` 约 10 个文件 |
| 2 | 引入 `tokens.css`，删掉暖纸层和衬线字体，旧变量映射到新 token（B1–B3） | 中，全局视觉变化 | CSS 为主 |
| 3 | 统一外壳与 PageHeader，整理数据页与实验页，抽出 DataPage（B5–B7、C2、C6） | 中 | `App.tsx`、`experiments/` |
| 4 | 替换首页 A，删除图廊（C4） | 中，首页相关测试要重写 | `components/home/` |
| 5 | 拆分编辑器，整理顶栏（C1、C5） | **高**，最容易出回归 | `editor/` |
| 6 | 调整绘图助手面板布局（C3，只改布局，不改状态机） | 中 | `AgentAssistant.tsx`、CSS |
| 7 | 公开展示页静态站 + Pages 工作流 | 低 | 新目录 `site/` |
| 8 | 清理：删除旧 CSS 和旧变量别名，更新 DESIGN.md，重拍截图 | 低 | 文档、CSS |

阶段 5 放在首页之后，是为了让肉眼可见的改进先落地。如果时间紧，阶段 5 和 6 可以推迟，不影响其他阶段。

---

## 四、明确不做的事

- 不改后端 Java（任务 01 的一行校验除外）、数据库、Flyway 迁移，也不改 API 字段。
- 不改 schema v1 的必填结构。唯一新增的是可选字段 `evaluation.legendMetric`：后端会原样保留未知字段（见 `ConfigValidator.java` 第 171–182 行，只校验列出的键），旧图表没有这个字段时行为不变。
- 不改助手的「提案 → 校验 → 预览 → 确认」流程、预算预留与结算、请求幂等和恢复逻辑。
- 不新增图表类型或统计功能，不新增多用户和登录功能。

---

## 五、本方案自身的验证情况

- 打包环境无法访问 npm 源和 Maven 中央仓库，**没有**运行 `npm ci`、完整 vitest、`tsc -b`、Playwright 和 `mvn test`。
- 图表补丁（01）：
  - 在原始快照上 `git apply --check` 通过；
  - 用全局 TypeScript 对 `plot.ts` 的整个依赖树做严格类型检查，通过；
  - 用一个最小 vitest 兼容层运行新增的 11 个测试，全部通过；
  - 在修复前后分别运行 model、layoutPatch、plotPlans、evaluation、classification、professional 中不依赖 React 渲染的断言，两次结果完全一致，没有新增失败。
- Java 校验补丁（01b）：只改 1 行校验，另加 6 行测试，**未编译、未运行**，由 Codex 在本地执行 `mvn test` 确认。
- 首页参考实现：`homeData.test.ts` 的 7 项通过（在 Asia/Tokyo 和 UTC 两个时区都跑过）；TSX 语法检查没有发现错误（类型检查因缺少依赖的类型声明而不完整）；用桩数据把真实的 `HomePage.tsx` + `home.css` 打包渲染，结果见 `design/home-A-reference-render.png`，在 390px 和 1440px 下都没有横向滚动条。`HomePage.test.tsx` 没有运行。
- 展示页：在 390px 和 1440px 下渲染检查过，没有横向滚动条。
- 其余参考代码（tokens、shell、PageHeader、FigurePreview）没有在真实依赖下编译过。必须由 Codex 在本地跑完 `npm test` 和 `npm run build` 才算完成。
