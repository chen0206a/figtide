# LabFlow

面向 AI / ML 研究生的本地实验数据管理与科研绘图工作台。**第一阶段**：React 工作台 + Java 21 / Spring Boot 3 + 真实 MySQL 8，无 AI API、无订阅服务。

已完成八批功能增量：[导入与工作台体验](docs/BATCH-1.md)、[实验关联与对比](docs/BATCH-2.md)、[分布图与多子图](docs/BATCH-3.md)、[论文尺寸与经验分布](docs/BATCH-4.md)、[模型评估与实际区间](docs/BATCH-5.md)、[数据处理与重复实验汇总](docs/BATCH-6.md)、[混淆矩阵与共同样本](docs/BATCH-7.md)、[科研成果复用与交付](docs/BATCH-8.md)。当前支持 11 种图表，完整流程连接真实 Java API 和 MySQL。

最新布局整理：[设计依据、操作分区与验收](docs/EDITOR-LAYOUT.md)。

首页现已加入本地图表示例图廊，并提供独立工作台地址、刷新恢复和导航动效。见 [首页与路由说明](docs/HOME-AND-ROUTING.md)。

![产品首页](docs/screenshots/home-showcase.png)

[查看绘图工作台截图](docs/screenshots/routed-workbench.png)

## 启动（本机 Windows）

在 PowerShell 中执行：

```powershell
cd 'D:\RAG-agent项目\LabFlow'
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

首次启动需要联网下载免费 JDK 和 npm/Maven 依赖；依赖已安装后运行不需要外部服务。要求 Node 22.12+、Maven 3.6.3+、MySQL 8 二进制。脚本自动准备项目私有 JDK 21；如 MySQL 安装位置不同，添加 `-MySqlBin '你的MySQL/bin路径'`。

- 前端：<http://127.0.0.1:5176>
- API：<http://127.0.0.1:8086/api/health>
- 独立 MySQL：`127.0.0.1:33316`，数据库 `labflow`；集成测试数据库 `labflow_test`
- 本地开发用户：`labflow` / `labflow-local`。独立实例 root：`labflow-root-local`。仅用于本地开发。
- 数据存储：`.runtime/mysql`；日志：`.runtime/*.log`；不会访问现有 3306 数据库。

依赖和构建已准备好时可用 `scripts/start.ps1 -SkipBuild`。默认启动会重新构建并重启已跟踪的后端。服务以隐藏窗口运行。

```powershell
# 创建明确标注的合成演示项目（幂等；全部通过真实 API 保存）
node .\scripts\seed-demo.mjs

# 停止本项目进程，保留全部数据
powershell -ExecutionPolicy Bypass -File .\scripts\stop.ps1
```

## 手动开发启动

先运行上面的脚本建立私有 MySQL。若需独立调试，停止对应已跟踪服务后分别启动：

```powershell
$env:JAVA_HOME=(Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn -f backend/pom.xml spring-boot:run

# 另一个终端
cd frontend
npm ci --cache ../.runtime/npm-cache
npm run dev
```

也提供 `compose.yaml` 作为 MySQL 的可选 Docker 启动方案。本轮实际验证使用原生 MySQL 8.0.42，未使用 Docker。原生实例和 Docker 不可同时占用 33316。Docker 测试库需另外创建 `labflow_test` 并授权。更换数据库使用 `LABFLOW_DB_URL`、`LABFLOW_DB_USER`、`LABFLOW_DB_PASSWORD`；更换 API 端口需要同步 Vite proxy 和来源白名单。

## 使用路径

第九批完成前端体验优化：编辑器绘图包精简、属性编辑轻量更新、草稿合并写入、画布自动适配、首页项目搜索与分批显示，以及统一动效/焦点/弹窗。现有保存、数据与导出协议保持一致。[改动、测量与截图](docs/BATCH-9.md)。

第二批已增加实验表单、状态与标签筛选、固定数据版本关联、复制参数配置，以及 2–8 个实验的参数/指标对比。选中实验进入对比，选择指标和基线后生成对比图；保存后可重新打开并查看不可变的实验来源快照。缺失结果不会当作零值。[第二批说明](docs/BATCH-2.md)。

1. 创建项目；数据管理上传 `samples/demo-learning-curves.csv` 或真实 UTF-8 CSV / 无宏 XLSX。
2. 检查字段类型、缺失值、版本与 SHA-256；点击“用于绘图”。
3. 左侧选择图表类型、数据版本、序列与预设；右侧映射字段并即时修改样式。
4. 点击曲线选择对应序列；点击轴标题切换坐标轴属性。画布缩放不影响导出大小。
5. 保存到 MySQL。刷新页面后从最近图表重新打开；历史快照载入后再保存，产生新版本。
6. 导出 SVG、PNG 或 PDF；在“专业”开启论文物理尺寸，可按 mm / pt 设置图版、按 DPI 输出 PNG。普通模式保留 1–4 倍像素倍率。SVG 文本保留为文本，使用方需要相同字体。PDF 首版要求选择内置 Noto Sans SC，嵌入字体并保留矢量图形；不支持的字形、斜体或混合字体富文本会明确报错。
7. 左侧“样式与图表复用”可保存个人外观模板、跨项目应用；整图复制需选择同项目目标数据版本并逐项确认映射，创建新图。
8. 顶部“管理项目”下载项目备份，或选择 `.labflow.zip`，检查版本统计后恢复为新项目。含原文件及所有已保存数据/图表历史、实验关联和该项目的样式；不包含未提交草稿。备份有大小和格式限制，详见第八批说明。

快捷键：`Ctrl/Cmd+S` 保存；非文本输入状态下 `Ctrl/Cmd+Z` 撤销、`Ctrl/Cmd+Shift+Z` 重做。

## 已实现的第一阶段

- 项目创建与概览、真实统计、实验创建/编辑、JSON 参数与指标、备注。
- CSV/XLSX 解析、分页预览、字段元数据、原文件下载、追加数据版本。
- 服务端显式过滤/排序、按多个条件汇总重复观测、有效 n / 缺失 / 均值 / 样本 SD / SEM，派生数据保存与来源追溯。
- 折线、分组柱状、散点、长表热力图、箱线、小提琴、直方图、ECDF、ROC、PR、真实标签驱动的混淆矩阵；多序列、类别分组、真实误差列与上下界区间，以及按指标/类别分面。
- 标题、字体/字重/字号、序列颜色/透明度/线型/点型、坐标范围/网格/对数、图例、画布与边距、文本注释。
- 三种独立视觉预设、撤销重做、恢复默认、可记录过滤、配置 schema v1、乐观锁版本保存、历史恢复。
- SVG / PNG / 字体嵌入矢量 PDF 下载、个人外观模板、显式字段映射复用、全项目备份恢复及浏览器回归测试。绘图及 PDF 引擎按需加载，不占用首页首包。

热力图按离散 X/Y 分类绘制，每个色块是 SVG 矩形，SVG 导出无需栅格图；最多 10000 个网格，超过时要求过滤。色标与单元格采用相同线性插值。热力图保留但不应用其他图表的对数轴设置。

## 数据与安全边界

本版本为 **无认证的单用户本地模式**，只绑定 loopback。来源过滤阻止其他网站直接发起浏览器写请求，但不能代替认证，任何有本机访问权限的程序仍可访问 API。禁止直接公网部署；公开部署前必须补齐身份认证、项目授权、用户隔离和审计。

原始文件和每次解析结果在 MySQL 中不可变保存，图表展示转换不修改原数据。CSV 要求 UTF-8（支持 BOM）；XLSX 可选择单张工作表（默认第一张），拒绝宏与公式；最多 10 MB、20,000 行、100 列、200,000 个数据单元格。空值保留为 null；NaN/Infinity 转为缺失并告警；不生成统计显著性。热力图重复坐标会告警并停止绘制，不静默聚合。

顶部图例会为标题自动保留最小安全边距，避免文字碰撞。很长标题、多达 20 条序列或极小画布仍应由用户预览检查并调整画布、字体或图例位置。数据预览显示原始解析值，过滤只影响画布并记录在配置中。

`samples/` 及预置工作区中的数值**全部为合成演示数据**，不代表真实机器学习结果。预设不是任何期刊官方认证。

第三批已增加箱线图、小提琴图、按指标或类别分面的多子图，以及样本检查。选择新图表类型后在“专业”属性中配置四分位算法、观测点、带宽、子图间距和共享坐标范围。[第三批说明](docs/BATCH-3.md)。重复观测样例见 `samples/demo-repeat-observations.csv`，全部为合成演示。

本阶段未实现：认证、团队协作、任意混合类型/多数据源子图、显著性检验、Prompt 市场、论文写作 AI。热力图分面尚未实现。PDF 首版只支持内置字体的常规/粗体，其他字体或斜体继续使用 SVG/PNG。

第四批增加物理尺寸与成品字号、DPI 元数据、科学色板与热力图固定色阶和数字标注。第五批增加基于逐样本真实标签/分数的 ROC、PR、AUC/AP 与阈值指标，及实际上下界区间带。上传 `samples/synthetic-classification.csv`，选择 ROC/PR，在专业面板明确标签和正类，各序列 Y 映射为模型分数；画布下方查看与导出评估。上传 `samples/synthetic-intervals.csv`，在折线序列面板配置上下界。两组数据均为合成演示，不能作为真实科研结论。也可运行 `node scripts/seed-evaluation-demo.mjs` 创建可直接打开的本地演示图。

GitHub Actions 已配置 Java/MySQL 与前端测试工作流，尚未在远端执行；参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。根项目许可证仍待所有者选择，不能仅因源码公开就视作已完成开源授权。

数据管理新增“处理与统计”：可只筛选排序，或按模型、评估集、epoch 等条件汇总逐次观测。声明每行观测单位，选择可选重复标识进行同组唯一性校验，预览后保存独立数据集或直接绘图。误差棒/区间带按所选 SD/SEM 自动映射；n<2 的误差保持缺失，不自动生成置信区间。规则、源版本与内容指纹随结果保存，原始数据保持不变。样例为 `samples/synthetic-grouped-runs.csv`；运行 `node scripts/seed-processing-demo.mjs` 创建“重复实验汇总 · 合成演示”。

第七批增加混淆矩阵：在“序列”映射每个模型的预测标签，在“专业”选择真实标签、明确类别顺序与计数/归一化口径，底部查看每类 precision/recall/F1 和 macro/micro/weighted 指标。也支持分数经阈值生成二分类矩阵。ROC/PR 和混淆矩阵可选择各模型独立行或所有可见模型共同有效行，并校验可选样本 ID；不跨文件猜测配对。分类 JSON 由 Java 重新计算并附源文件指纹。运行 `node scripts/seed-classification-demo.mjs` 创建“分类评估与共同样本 · 合成演示”。

## 测试

启动服务后：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test.ps1
# 或分别运行
mvn -f backend/pom.xml test
cd frontend
npm test
npm run build
npx playwright install chromium
npm run e2e
```

Java 集成测试使用真实 `labflow_test`，不使用 H2。E2E 通过真实 Java API 在 `labflow` 创建明确命名的测试项目，并真实下载导出文件；不会使用前端 Mock。详细结果见 [测试记录](docs/TEST-RESULTS.md)。

## 代码与设计

- [产品、架构、ER 图与 UI 规范](docs/DESIGN.md)
- [API 协议](docs/API.md)
- [完整配置示例](docs/config-v1.example.json)
- `backend/src/main/java/dev/labflow/`：Controller / Service / Repository / Importer 分层。
- `frontend/src/editor/`：配置模型、历史 reducer、数据到 Plotly 的纯函数映射、工作台 UI。
- `frontend/src/components/ui/`：shadcn/ui 风格本地组件，使用 Radix Dialog/Slot、CVA 和 Tailwind。
- `scripts/`：独立启动、停止、测试和合成演示数据导入。

界面及布局为原创；图标使用 Lucide（ISC），React/Plotly/TanStack/Radix/Tailwind 等依赖遵循各自开源许可证。未复制商业软件界面或许可不明的素材。
