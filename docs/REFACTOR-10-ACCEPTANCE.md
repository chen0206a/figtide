# 任务 10 验收记录

日期：2026-10-23。分支：`refactor/frontend`，基线 `0255dfe`（任务 09 收尾提交）。范围 10-0 至 10-6 共七节，每节单独提交。原始运行记录、失败与修复过程见 [TEST-RESULTS.md](TEST-RESULTS.md) 顶部「10-0」至「10-6」各节。

10-0 至 10-3 由 codex 实现并提交；10-4 在其额度中断后接手完成验证与提交，10-5、10-6 本轮完成。

## 分节提交与验证

| 小节 | 提交 | 规模 | 主要改动 | 单测 / 构建 | 该节 E2E |
| --- | --- | --- | --- | --- | --- |
| 10-0 动效基础 | `2f73188` | 7 文件 +76 | `AGENTS.md` 动效规范、`styles/motion.css`、`lib/useMotion.ts` | 213/213；构建通过 | home 2/2 |
| 10-1 首次访问 | `f01816a` | 39 文件 +117/−38 | `welcome/`、`lib/intro`、路由、`e2e/workspace-test.ts` | 214/214；通过 | intro、home、navigation 7/7 |
| 10-2 介绍页 | `6289b71` | 11 文件 +384 | `welcome/ProductIntro.tsx`、`product-intro.css`、59 个尺寸令牌 | 218/218；通过 | intro、product-intro 4/4 |
| 10-3 首页 v2 | `206376a` | 14 文件 +233/−231 | `components/home/*`、`FigurePreview`、`HomePage` | 220/220；通过 | home、home-v2、home-workspace、styles-library、navigation 10/10 + 2/2 |
| 10-4 画布预览 | `d522e2b` | 25 文件 +389/−22 | `workbench/{CanvasAsk,ProposalPaper,useProposalCanvas,proposalMarkers}`、`agent-canvas.css`、`AgentAssistant`、`FigureCanvas`、`EditorToolbar` | 229/229；构建 18.68s | agent 8/8 + assistant-layout 1/1；整轮 68/68 |
| 10-5 公开展示页 | `9ca0c26` | 8 文件 +618/−285 | `site/index.html`、`scripts/test-site.cjs`、4 张站点截图 | — | 站点自测 4/4（390/768/1280/1440） |
| 10-6 动效与验收 | `d1d4f3b` | 5 文件 +324 | `e2e/motion.spec.ts`、性能与对照证据、助手预览截图 | 229/229；构建 18.13s | motion 3/3；整轮 70/71（1 条并行抖动，单独重跑通过） |

另有 `c5f6efe`（3 文件 ±54）刷新任务 09 的首页布局基线——10-3 改版后 `.home-continue` 几何变化，属有意改版，非回归。

## 实现要点

- **动效**：只动 `transform`/`opacity`/`clip-path`/`stroke-dashoffset`；`useEntrance(key)` 会话内首次 `full`、之后 `quick`、减少动效 `none`；首页最后一项 1.18s 结束，工作区整段不超过 1.2s。隐藏按钮/输入在入场中也保持可点（`motion.spec.ts` 用 `click({trial:true})` 验证）。
- **首次访问**：根路径首访渲染懒加载 `ProductIntro`，进入后写 `labflow-intro-seen`；`/welcome` 始终可开；深链接不拦截；存储异常直接进工作区；圆形 View Transition 无 API / 减少动效时降级。
- **介绍页**：首屏 CSV→彩色论文图、可追溯三步、7 秒助手示意、6 张固定 SVG 图；三处 CTA 走同一真实入口；颜色字体尺寸全部改令牌（新增 59 个尺寸令牌），无新依赖。
- **首页 v2**：问候 + 命令栏 + 2:1 深色展台（真实图表、最近两版、可选本机草稿）+ 最近图表 + 2×2 入口 + 实验/项目表。`FigurePreview` 新增 `fit` 模式（按容器实际宽度渲染，不做 CSS 缩放）供首页展台使用，默认 `exact` 保留样式库行为。
- **助手画布预览**：画布底部输入条默认不勾选「发送给模型」，未勾不可发送；提案画在画布上（`预览中 · 尚未应用` 胶囊、原图/预览切换、编号对应右侧 diff）；预览不写草稿、不进撤销栈、不保存；只有「应用这组调整」走既有的校验 + 一次撤销链路。
- **公开展示页**：正文复用 10-2 已 token 化的标记 + `welcome.css`，从 `tokens.css`、`motion.css` 解析出 96 个 `--lf-*` 令牌内联；三处按钮改为指向 README 的链接；滚动渐显用原生 IntersectionObserver，无 JS 或减少动效时直接显示最终状态。

## 总验收发现与修复

- **布局基线失配**：`cleanup-visual.spec.ts` 报 `.home-continue` 期望 863.75×529.80 @y=199、实际 827.75×410.77 @y=416。原因是 10-3 首页 v2 改版后未刷新任务 09 基线（基线最后改动停在任务 09 时期）。用 `LABFLOW_POLISH_UPDATE_BASELINE=1` 重跑生成新基线，diff 18 行且全部在 home 面（`.home-continue`、深色展台 `.home-stage` 的 padding/display/颜色、`.paper-group` 高度），experiments/data/editor 三面未变 → 判为有意改版。基线单独提交为 `c5f6efe`。
- **并行抖动**：10-6 整轮 71 条里 `refinements.spec.ts:3` 在满载并行时等 `getByTestId("file-upload")` 90s 超时，单独重跑 1 passed（9.2s）。该 spec 与本次改动无关（导入链路未动），属既有争用抖动；建议后续在该用例 `goto("/")` 后先等首页外壳再上传，可消除。
- **长任务归因**：Chrome CDP trace 实测（`test-evidence/refactor10-perf.json`）dev 有 2 个 >50ms 任务（59/87ms）、生产构建 1 个（60ms），**全部发生在入场开始之前**，入场窗口内为 0。Playwright 打开 trace 录制时会额外出现约 250ms 的首帧任务，属录制开销、无录制时不存在，因此该断言不放进 E2E，只作 trace 证据记录——不把工具开销写成页面问题。
- **导入预览 Draft 恢复**：10-4 修复的两处 bug（关闭后重开面板时父层 cleanup 误清子层刚恢复的预览；720px 高度下按钮挤压对话区）均补了回归用例，在 `agent.spec.ts`、`assistant-layout.spec.ts` 内通过。

## 运行方式

每节在 `frontend` 目录执行 `npm test -- --maxWorkers=4` 与 `npm run build`；E2E 用独立测试栈，不碰主工作区数据库，也不调用真实模型：

```bash
# 1) 模型兼容夹具（18769），2) 独立库后端（8087），3) 指向它的 dev 服务（5178）
node frontend/e2e/fixtures/compatible-provider.cjs
./.runtime/java/jdk-21.0.12.1+1/bin/java.exe -jar backend/target/labflow-0.1.0.jar \
  --server.port=8087 \
  --spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_e2e \
  --labflow.test-support=true --labflow.frontend-origin=http://127.0.0.1:5178 \
  --LABFLOW_AGENT_BASE_URL=http://127.0.0.1:18769 --LABFLOW_AGENT_MODEL=labflow-fixture \
  LABFLOW_AGENT_API_KEY=
LABFLOW_API=http://127.0.0.1:8087 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178 --strictPort

# 4) 跑测试
LABFLOW_API=http://127.0.0.1:8087 LABFLOW_WEB_URL=http://127.0.0.1:5178 NO_PROXY=127.0.0.1,localhost,::1 \
  node node_modules/@playwright/test/cli.js test
```

`vite.config.ts` 的 `/api` 代理读的是 vite 进程自身的 `LABFLOW_API`，起 dev 服务时必须带上，否则请求打到 8086 的真实后端（未运行时表现为返回空 JSON）。

站点页自测：`node scripts/test-site.cjs`（会生成 `docs/screenshots/refactor-10-site-*.png`）。

## 设计与实际对照

设计片段在 `refactor/design/09-10/static/`，只包含局部元素（不是整页），可测量的只有排印与组件规格；证据 `test-evidence/refactor10-parity.json`（1440×900）。

| 项目 | 设计片段 | 实现 | 差异原因 |
| --- | --- | --- | --- |
| 首页 h1 | 36px / 800 / -1.08px | 34px / 700 / -0.68px | 实现只用令牌 `--lf-text-3xl`（34px）+ `--lf-tracking-tight`；改 36/800 需动全站标题令牌 |
| 主按钮 | 高 42px / 圆角 11px / 内边距 18px | 高 44px / 11px / 18px | 高度取 `--lf-control-h` |
| 深色展台 | 片段以 `.paper` 示意 | 828×411，`#0e1116`，圆角 18px，内边距 24px | 与 10-3 说明一致 |
| 画布纸面 | 圆角 4px + 重投影 | 圆角 0、无阴影 | 编辑器改为白纸满铺，不做卡片化纸面 |
| 助手停靠栏 | 片段只有 `.pill/.msg-in` 等局部类 | 宽 432px、白底、左侧 1px `#e4e7ec` | 片段未定义整栏宽度 |
| 站点页与 `/welcome` | — | h1 76px（1440）/40px（390）、5 个 section、横向溢出 0，两侧一致 | 静态导出与真实页逐项对齐 |

截图：`screenshots/refactor-10-home.png`（首页）、`screenshots/refactor-10-editor-assistant.png`（编辑器 + 画布提案）、`screenshots/refactor-10-assistant-{idle,preview}.png`（助手空闲/预览）、`screenshots/refactor-10-site-{390,768,1280,1440}.png`（公开展示页）、`screenshots/refactor-10-intro-{1440,390}.png`（介绍页）。

## 边界与未执行

- **Firefox 未执行**：本机没有 Firefox，`%LOCALAPPDATA%\ms-playwright` 也没有 Playwright 浏览器（该网络下 CDN 不可达），全部 E2E 使用系统 Chrome（`channel: "chrome"`）。
- **快捷键偏差**：10-4 用 `Alt+A` 而非首选 Ctrl/⌘J。理由是无头测试只能证明该快捷键事件被取消，无法验证 Chrome 原生下载页行为；`test-evidence/refactor10-shortcut-probe.json` 在 `about:blank` 上采集，证据强度有限，不据此声明原生快捷键已验证。
- **10-5 未直接复用设计稿 HTML**：`refactor/design/09-10/static/ProductIntro.html` 全部是内联十六进制色与内联样式，与「只用 `--lf-*` 令牌」的视觉规则和站点自测的「无内联 UI 色」冲突，故复用 10-2 的 token 化产物，并以几何对比（上表末行）证明一致。
- **JS 依赖**：公开展示页只有 Google Fonts 一处外部请求；无框架运行时，断网时回退系统字体，版式不塌。
- 介绍页与首页的示意数据均在页面上标注「示意数据」，不冒充实测结果；公开展示页的 CTA 指向 README，不提供在线试用（后端只跑在本机）。