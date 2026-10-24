# FigTide v0.1.0 品牌改名盘点

2026-10-24，在 13-1 后、13-2 替换前按任务范围检索精确 `LabFlow`；逐处分类如下。历史验收、旧版本改动记录、原始截图与评测输出不回写。内部协议仍沿用原标识。

| 位置 | 分类与处理 |
|---|---|
| `frontend/src/App.tsx:179` | 用户可见（替换） |
| `frontend/src/App.tsx:314` | 用户可见（替换） |
| `frontend/src/App.tsx:316` | 用户可见（替换） |
| `frontend/src/App.tsx:335` | 用户可见（替换） |
| `frontend/src/App.tsx:437` | 用户可见（替换） |
| `frontend/src/styles.css:3` | 内部源码注释（同步品牌） |
| `frontend/src/components/ModelConnectionDialog.test.tsx:106` | 内部标识/原路径（保留） |
| `frontend/src/components/ModelConnectionDialog.tsx:74` | 内部标识/原路径（保留） |
| `frontend/src/components/ModelConnectionDialog.tsx:240` | 用户可见（替换） |
| `frontend/src/lib/privacy.ts:2` | 用户可见（替换） |
| `frontend/src/lib/privacy.ts:4` | 用户可见（替换） |
| `frontend/src/lib/sampleProject.ts:13` | 用户可见（替换） |
| `frontend/src/styles/tokens.css:2` | 内部源码注释（同步品牌） |
| `frontend/src/welcome/introMarkup.ts:3` | 用户可见（替换） |
| `site/index.html:4` | 用户可见（替换） |
| `site/index.html:6` | 用户可见（替换） |
| `site/index.html:362` | 用户可见（替换） |
| `site/index.html:364` | 用户可见（替换） |
| `site/index.html:377` | 用户可见（替换） |
| `site/index.html:589` | 用户可见（替换） |
| `site/index.html:591` | 用户可见（替换） |
| `site/index.html:603` | 用户可见（替换） |
| `scripts/connect-agent.ps1:32` | 用户可见（替换） |
| `scripts/connect-agent.ps1:67` | 用户可见（替换） |
| `scripts/connect-agent.ps1:85` | 用户可见（替换） |
| `scripts/connect-agent.ps1:160` | 用户可见（替换） |
| `scripts/connect-agent.ps1:165` | 用户可见（替换） |
| `scripts/start.ps1:84` | 用户可见（替换） |
| `scripts/stop.ps1:5` | 用户可见（替换） |
| `scripts/stop.ps1:19` | 用户可见（替换） |
| `README.md:1` | 用户可见（替换） |
| `README.md:27` | 用户可见（替换） |
| `README.md:31` | 用户可见（替换） |
| `README.md:42` | 内部标识/原路径（保留） |
| `AGENTS.md:1` | 用户可见（替换） |
| `docs/AGENT-EVALUATION.md:63` | 内部标识/原路径（保留） |
| `docs/AGENT-ROADMAP.md:13` | 内部标识/原路径（保留） |
| `docs/API.md:270` | 内部标识/原路径（保留） |
| `docs/API.md:284` | 内部标识/原路径（保留） |
| `docs/BATCH-1.md:3` | 历史记录（保留） |
| `docs/BATCH-1.md:18` | 历史记录（保留） |
| `docs/BATCH-6.md:36` | 历史记录（保留） |
| `docs/BATCH-7.md:22` | 历史记录（保留） |
| `docs/BATCH-8.md:28` | 历史记录（保留） |
| `docs/BATCH-9.md:45` | 历史记录（保留） |
| `docs/DESIGN.md:1` | 用户可见（替换） |
| `docs/DESIGN.md:136` | 内部标识/原路径（保留） |
| `docs/EDITOR-LAYOUT.md:9` | 用户可见（替换） |
| `docs/EDITOR-LAYOUT.md:10` | 用户可见（替换） |
| `docs/EDITOR-LAYOUT.md:11` | 用户可见（替换） |
| `docs/HOME-AND-ROUTING.md:28` | 历史记录（保留） |
| `docs/HOME-REDESIGN.md:5` | 历史记录（保留） |
| `docs/HOME-REDESIGN.md:27` | 历史记录（保留） |
| `docs/MODEL-CONNECTIONS.md:26` | 内部标识/原路径（保留） |
| `docs/PRODUCT-AUDIT.md:1` | 历史记录（保留） |
| `docs/PRODUCT-AUDIT.md:50` | 历史记录（保留） |
| `docs/PRODUCT-AUDIT.md:120` | 历史记录（保留） |
| `docs/PRODUCT-AUDIT.md:149` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:8` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:94` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:228` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:257` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:840` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:902` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:974` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:982` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:1072` | 历史记录（保留） |
| `docs/TEST-RESULTS.md:1168` | 历史记录（保留） |

## 兼容边界

- `X-LabFlow-Connection` / `X-LabFlow-Test-Run` 是实际请求头；前端、测试、API 文档保持一致。
- `labflow-*` 存储键、`labflow:assistant:*`、`#labflow-intro` DOM 锚点、`data-testid`、`LABFLOW_*` 环境变量均保留。
- Java 包、Maven artifactId、数据库名、后端版本/评测标识、备份结构及 `.labflow.zip` 格式扩展名不改。下载文件显示前缀可以改为 `figtide`。
- 历史记录包括 TEST-RESULTS、PRODUCT-AUDIT、TASK11 交接、BATCH 系列、HOME-REDESIGN、HOME-AND-ROUTING、LANDING-SITE 的旧发布说明，以及 docs/evaluations、test-evidence 与原截图。
- 新品牌入口使用 `https://github.com/chen0206a/figtide`。2026-10-24 已确认该公开仓库存在，当时为空；README、媒体 raw 链接将在所有者推送 main 后可用。本地未配置远端，不自动添加或推送。
- SVG/PNG/PDF 导出代码没有自定义的 LabFlow 创建工具元信息；未改动绘图、字体嵌入、文件内容和备份协议。

## 本轮等价断言调整

- intro.spec.ts：关于链接变为关于按钮 → 弹窗可见 → 产品介绍链接；保留进入介绍页断言。
- productize.spec.ts：离线提示中的 LabFlow 改为 FigTide。
- scripts/test-site.cjs：README / 仓库目标改为 figtide；新增新标题、品牌图标与社交元信息检查，原布局、目的地、图片、网络和可见性断言保留。
- 新增 release-brand.spec.ts，验证页面标题、品牌、关于入口及 favicon 资源；不替换或删除旧用例。
