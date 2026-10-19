# 第一阶段验收记录

## 最新增量：第二批实验关联与对比（2026-10-18 晚）

Java 24/24（真实 MySQL 集成测试）、Vitest 14/14、Chrome E2E 8/8 通过；TypeScript / Vite 构建通过。更新事务隔离及异步衔接后又单独复验新增 E2E 通过。测试涵盖实验表单、复制配置、筛选、数据版本关联、参数差异、缺失值、对比图保存与重新打开、原实验修改后来源快照保持不变。既有 E2E 同时验证 SVG/PNG 导出。

本次发现并修复实验备注与状态控件的可访问标签定位问题。Java 打包曾因运行中 JAR 被 Windows 锁定失败，停止本项目后端后重新打包并启动成功；没有跳过测试。Plotly 构建体积警告仍存在。详情与截图见 [第二批记录](BATCH-2.md)。下文为此前验收历史，不代表当前数据库记录数量。

执行日期：2026-10-18（Asia/Shanghai）。全部在独立 `LabFlow` 目录完成，没有修改其他现有工程。未推送远端。

## 环境

- Windows；Node 24.15.0；Microsoft OpenJDK 21.0.12.1。
- Spring Boot 3.5.7；MySQL Community 8.0.42（原生独立实例，loopback:33316）。
- Vite 7.3.7；React 19；Plotly.js；Vitest 5.0.5；Playwright Chromium。
- 使用真实 Java API 与 MySQL。未使用 H2、浏览器本地 Mock 或付费 API。

## 自动化结果

| 项目 | 实际结果 | 覆盖 |
|---|---|---|
| Java 单元与集成测试 | **16 / 16 通过** | 导入 10、配置合约 4、真实 MySQL 集成 2 |
| 前端组件/纯函数测试 | **8 / 8 通过** | 表格分页、缺失值、撤销重做、过滤不修改数据、样式保留、对数告警、热力图重复值和矢量矩形 |
| Chromium E2E | **3 / 3 通过** | 完整主流程、配置交互与历史、实验记录与坏 CSV |
| TypeScript + Vite 生产构建 | **通过** | 首页包约 399 kB；绘图按需包约 4.88 MB（未压缩） |
| npm audit | **0 漏洞** | 当前 lockfile，包含开发依赖 |
| 本地启动 | **通过** | 私有数据库初始化、Flyway、Java 服务、Vite 代理 |

Java 测试摘要保存在 `test-evidence/`。完整 XML 日志重新运行后位于 `backend/target/surefire-reports/`；Playwright HTML 报告位于 `frontend/playwright-report/`，运行产物目录不提交。

### 浏览器验证的具体路径

1. 从 UI 新建项目 → 上传真实 CSV → 检查数据预览 → 打开编辑器 → 添加序列、改颜色/字体/轴范围 → 保存 MySQL → 刷新并重开 → 配置对比一致 → 切换散点及撤销 → 实际下载 SVG / PNG。
2. 两份数据间切换保留样式 → 撤销恢复另一份真实数据 → 绑定误差列 → 柱状图 → 注释 → 保存多个版本 → 历史恢复并生成新版本 → 热力图 → 实际导出矢量 SVG。
3. 创建与编辑实验参数/指标/备注 → 上传重复表头 CSV → 显示真实后端校验错误。

SVG 检查：有文本标签，无嵌入 `<image>`；热力图色块为矢量路径。PNG 为 1520 × 1000（760 × 500 的 2 倍）；与 SVG 共用配置。标题与顶部图例增加浏览器 bounding-box 防碰撞断言。

## 视觉检查

实际浏览器截图：

- [项目首页](screenshots/home.png)
- [实验记录](screenshots/experiments.png)
- [数据管理](screenshots/data.png)
- [绘图编辑器 · 1560px](screenshots/editor.png)
- [绘图编辑器 · 1280px](screenshots/editor-1280.png)
- [热力图](screenshots/heatmap.png)

已打开并人工视觉检查首页、编辑器、1280px 布局、热力图和 PNG 导出。修复了标题/图例重叠、顶部状态文字换行；热力图采用矢量矩形，避免栅格嵌入。

测试过程中还修复了数据集切换/撤销与草稿状态的同步、实验编辑后 label 选择不稳定、Windows 运行中的 JAR 重打包锁冲突。最终上述回归均通过，不将首次失败当作成功。

## 交付与已知边界

- 本地数据库保留 1 个合成演示项目、3 个实验、2 份数据与 2 张图表；本轮生成的 E2E 测试项目已定向清理，集成测试数据保留在独立 `labflow_test`。
- 图表主包较大，已按需加载，构建仍有 chunk-size 提示；不是构建失败。后续可定制 Plotly bundle。
- 检查了 Chromium 桌面 1560px / 1280px，未声称测试 Firefox、Safari、移动端、百万行数据或并发团队部署。
- 图表任意极端尺寸/字号/超长文本组合未穷举；导出前应使用预览。热力图上限 10000 格；不计算显著性。
- 本地无认证模式不适合公网，具体边界见 README。Docker 备选配置未实际启动测试。
- PDF、多子图、箱线图、小提琴图、论文写作辅助和团队协作留待第二阶段。

导出示例均为合成数据： [SVG](exports/learning-dynamics.svg)、[PNG](exports/learning-dynamics.png)、[热力图 SVG](exports/heatmap.svg)。

## 第二阶段：视觉重构验收（杂志版，2026-10-18）

背景：第二次视觉重构由另一模型执行，因上游 API 余额不足（`402`）与上下文压缩中断，只写入半套设计令牌、未覆盖既有布局类，页面破版；随后一版「深色玻璃 + 极光渐变」方案经评审否决。最终采用编辑 / 杂志风格：暖纸底色、衬线标题、1px 发丝线、单一陶土强调色，并加入按期刊规范渲染的示例图版。

### 变更范围

| 文件 | 变更 |
|---|---|
| `frontend/src/styles.css` | 全量重写：暖纸 `#f7f4ee` + 卡片 `#fffdf9` + 陶土 `#b65c3a`；报头 / 目录导航替代左侧导轨；双列 PLATES 图版区、双列能力条目；编辑器改为纸色外壳 + 白纸画布 |
| `frontend/src/components/Plates.tsx` | **新增**：6 幅手绘 SVG 图版，按 Nature / Science / Cell / NeurIPS / eLife 规范渲染（89 mm 单栏、5–7 pt、a–d 面板字母、Okabe–Ito 配色、误差棒、箱线 + 抖动散点） |
| `frontend/src/App.tsx` | 报头 + 目录导航；Hero（衬线大标 + 陶土斜体行 + Contents 目录 + 规格行）；图版区与能力条目替换原能力卡片 |
| `frontend/src/main.tsx` | 引入 Inter / Newsreader / JetBrains Mono 三款可变字体 |
| `frontend/package.json` | 新增 `@fontsource-variable/newsreader` |
| `frontend/index.html` | `theme-color` 改为 `#f7f4ee` |
| `frontend/playwright.config.ts` | 默认使用系统 Chrome（`PLAYWRIGHT_CHANNEL` 可覆盖） |
| `frontend/e2e/capture.mjs` | 截图前等待入场动画结束（900ms） |

### 自动化结果

| 项目 | 实际结果 |
|---|---|
| TypeScript 项目构建 | **0 错误**（`tsc -b --force`） |
| Vite 生产构建 | **通过**；CSS 51.0 kB、主包约 393 kB、绘图按需包 4.66 MB |
| Vitest 单元/组件测试 | **8 / 8 通过** |
| Playwright Chromium/Chrome E2E | **3 / 3 通过（11.7s）**：完整主流程 + 配置/历史 + 实验记录与坏 CSV |
| 浏览器控制台 | 无 error |

### 视觉检查

1560×1000 与 1280×800 真实浏览器截图为本轮重新生成（2026-10-18 15:00），数据来自真实 MySQL 演示项目：

- [项目首页](screenshots/home.png) · Hero、Contents、统计条、六幅图版、能力条目
- [实验记录](screenshots/experiments.png)
- [数据管理](screenshots/data.png)
- [绘图编辑器 · 1560px](screenshots/editor.png)
- [绘图编辑器 · 1280px](screenshots/editor-1280.png)
- [热力图](screenshots/heatmap.png)

另人工核对了新建项目、实验记录、导出、版本历史四个弹窗与编辑器底部数据面板，均无溢出或截断；1280px 下 Hero、图版与编辑器三栏布局均正常。

图版规格依据：[Nature · Building and exporting figure panels](https://research-figure-guide.nature.com/figures/building-and-exporting-figure-panels/)（89 / 183 mm、5–7 pt、Arial、Okabe–Ito 配色）、Science / AAAS 图件要求、NeurIPS 与 eLife 常见图式。图版数值取自 `samples/` 合成数据，由 LabFlow 自行渲染，未嵌入任何受版权保护的论文图形。

### 数据清理

E2E 生成的 3 个测试项目（`配置交互验收`、`实验记录验收`、`视觉模型研究 · E2E`）已按外键顺序删除，演示库恢复为 **1 个项目 / 2 张图表 / 2 份数据 / 3 条实验 / 2+2 个版本**。

### 已知边界

- E2E 依赖本机 Chrome；未下载 Playwright 自带 Chromium（CDN 下载在本机超时），`PLAYWRIGHT_CHANNEL` 可切换。
- 图版为规范复刻的示例，不代表期刊对投稿的实际裁切与色值要求；如需真实论文图，应替换为 CC-BY 图件并保留署名。
- 仍未覆盖 Firefox、Safari、移动端与百万行数据；绘图引擎按需加载的体积提示仍在。
- 视觉层面覆盖 1280–1560px 桌面视口；<1120px 时布局横向滚动。
