# FigTide 图汐

面向 AI / 机器学习研究者的本地实验数据管理与科研绘图工作台，从原始数据到可复现的论文图表。

![FigTide 图汐：从实验数据到论文插图](docs/media/social-preview.png)

## 看看它如何工作

**绘图助手：描述需求，先预览，再确认应用。**

![绘图助手演示](docs/media/FigTide-assistant.gif)

*演示使用示意数据，不代表真实研究结论。助手为可选功能，调用你配置的模型服务可能计费。*

**科研绘图：映射字段，实时调整，导出成果。**

![科研绘图演示](docs/media/FigTide-plot.gif)

*演示使用示意数据。普通导入、绘图与导出无需模型服务。*

## 功能

- 项目与实验记录：整理参数、指标、备注、数据关联和实验对比。
- 导入 CSV、TSV、TXT、XLSX、JSON、JSONL，先预览解析结果，再确认字段类型、角色与导入规则。
- 原始数据与解析版本不可变保存，保留内容指纹；过滤、分组和 mean / SD / SEM 汇总生成独立派生数据。
- 折线、分组柱、散点、热力、箱线、小提琴、直方、ECDF、ROC、PR、混淆矩阵绘图；支持实际误差数据与区间带。
- 实时调整序列、配色、字体、坐标轴、图例、注释和尺寸，撤销重做、本机草稿、图表版本保存与恢复。
- 按论文物理尺寸导出 SVG、PNG 和字体嵌入矢量 PDF；支持样式模板、字段映射复用、图表编排和项目备份恢复。
- 可选绘图助手：网页配置兼容模型接口，测试基础对话与工具调用，根据字段摘要推荐图型，用户选定后继续绘图。
- 自研 Java Agent Harness：工具校验、修改提案、用户确认、预算控制、取消与超时、运行审计及会话恢复。

## 数据与隐私

FigTide 运行在你的电脑上。数据、图表和所有版本都保存在本机，我们没有用于接收这些数据的云端服务器，也不收集任何使用数据。只有在你配置模型并勾选同意后，绘图助手才会把图表配置和字段摘要发给你选择的模型服务，不会附带原始数据行和上传文件名。

发送内容还包括你输入的描述、会话上下文和数据版本元信息。字段摘要包含字段名、类型、缺失数、数值范围、唯一值数和字段角色；版本元信息包含行数、版本标识与内容指纹。你主动写入标题、注释或对话的内容也会发送。模型服务可能计费。

导入、保存和解析由本机 FigTide 服务完成。模型连通性测试仅在你勾选测试同意并点击测试后发送两条固定测试消息，不包含实验数据。备份导出文件保存在你选择的下载位置。

备份导出文件保存在用户自己选择的位置。应用字体随前端打包；安装依赖与主动打开外部链接需要联网。独立公开展示页 `site/index.html` 使用 Google Fonts，不接触工作区文件。

当前为无认证的本地单用户模式，服务仅监听本机。请勿直接将后端暴露到公网；本机其他程序也可能访问本地 API。跨用户部署需要另行实现认证、授权和数据隔离。

## 快速开始

**双击运行的桌面版正在开发中**，v0.1.0 尚无桌面安装包。当前使用 Windows PowerShell 脚本启动，数据保存在每位用户自己的电脑上。

准备 Node.js 22.12+、Maven 3.6.3+、MySQL 8 二进制，以及 Git。后端使用 JDK 21；首次启动脚本会下载项目私有 JDK，首次安装 npm / Maven 依赖也需要联网。MySQL 应使用空闲端口 33316，脚本初始化项目独立实例，不连接既有 3306 实例。

```powershell
git clone https://github.com/chen0206a/figtide.git
cd figtide
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

MySQL 安装位置不是默认值时：

```powershell
.\scripts\start.ps1 -MySqlBin 'C:\你的MySQL安装目录\bin'
```

打开 [本地工作台](http://127.0.0.1:5176)，空首页可以载入示例项目；也可导入自己的数据。后端健康检查：[本地 API](http://127.0.0.1:8086/api/health)。

- 数据保存在仓库的 `.runtime/mysql/`，不是浏览器缓存；请备份或导出项目后再迁移目录。
- 为兼容已有工作区，数据库仍名为 `labflow`，内部存储键和 `LABFLOW_*` 环境变量保持不变。
- 本地开发账号为 `labflow` / `labflow-local`，独立实例 root 密码为 `labflow-root-local`；仅用于当前本机模式。
- 已构建过可使用 `.\scripts\start.ps1 -SkipBuild`；停止使用 `.\scripts\stop.ps1`，保留数据。
- 模型设置可在网页中填写地址、模型 ID 与 API Key。密钥仅保存在后端进程内存；后端重启需重新配置。普通科研绘图不需要密钥。详见 [模型连接说明](docs/MODEL-CONNECTIONS.md)。

## 技术栈

| 层级 | 实现 |
|---|---|
| 工作台 | React 19、TypeScript、Vite、React Router、Tailwind CSS、自定义设计变量、Radix UI |
| 状态与表格 | TanStack Query、TanStack Table |
| 绘图与导出 | Plotly.js、jsPDF、svg2pdf.js；应用字体本地打包 |
| 后端 | Java 21、Spring Boot 3、JdbcTemplate、Bean Validation |
| 数据与解析 | MySQL 8、Flyway、Apache Commons CSV、Apache POI |
| 绘图助手 | 单 Agent 工具循环、自研 Java Harness、兼容 Chat Completions 模型适配 |
| 验证 | JUnit、Spring Boot Test、Vitest、Testing Library、Playwright / Chrome |

## 测试

在仓库根目录，先启动本机 MySQL。常规测试及浏览器测试使用独立测试数据库与本机模型夹具，不调用收费模型。

测试脚本按以下顺序查找 MySQL 客户端：`-MySqlBin` 参数 → `LABFLOW_MYSQL_BIN` 环境变量 → `PATH` 里的 `mysql` → 默认安装目录 `C:\Program Files\MySQL\MySQL Server 8.0\bin`。都找不到时会报错并提示如何指定。

```powershell
# Java 单元与 MySQL 集成测试（需要 JDK 21 在 JAVA_HOME / PATH）
mvn -B -f backend/pom.xml test

# 前端组件、交互单测和生产构建
cd frontend
npm test
npm run build
cd ..

# 全量浏览器测试：隔离 Java 8087 / Vite 5178 / 夹具 18770 / labflow_e2e
.\scripts\test-agent.ps1 -All -FixturePort 18770

# 生产构建的任务 09 专项（已从 .runtime 整理为受版本控制的入口）
.\scripts\test-refactor09.ps1 -FixturePort 18770
# 等价通用入口：.\scripts\test-agent.ps1 -Production -Specs @('visual-polish.spec.ts') -FixturePort 18770

# 历史图表修复 / 稳定隔离入口也已整理到 scripts，复用同一个运行器
# .\scripts\test-refactor01c.ps1 -FixturePort 18770
# .\scripts\test-refactor03-stable.ps1 -All -FixturePort 18770
# node scripts/compare-refactor09.cjs  # 历史设计稿对比，仅写 .runtime

# 独立静态展示页：390 / 768 / 1280 / 1440，使用本机 Chrome
node scripts/test-site.cjs
```

E2E 需要已安装的 Google Chrome，脚本会检查专用端口并清理本次创建的测试项目。详细结果见 [TEST-RESULTS](docs/TEST-RESULTS.md)。

仅需重新拍摄发布图时，设置 `LABFLOW_CAPTURE=1` 后运行发布专项；默认截图和下载产物保留在测试输出目录，不覆盖文档中的历史截图。

```powershell
$env:LABFLOW_CAPTURE = '1'
.\scripts\test-agent.ps1 -FixturePort 18770 -Specs @('release-brand.spec.ts')
node scripts/test-site.cjs
Remove-Item Env:LABFLOW_CAPTURE
```

[助手评测](docs/AGENT-EVALUATION.md)支持离线回放与显式开启的真实模型模式；回放通过不等于真实模型能力验收。更多协议与开发规则见 [CONTRIBUTING](CONTRIBUTING.md)。

## 项目结构

```text
frontend/       React 工作台、绘图管线、组件测试与 E2E
backend/        Java API、数据解析、图表校验与 Agent Harness
scripts/        本地起停、隔离验收、导出检查与评测入口
site/           独立公开展示页，可通过 GitHub Pages 发布
docs/           API、设计、隐私、评测与验收证据
samples/        明确标注的合成科研演示数据
refactor/       重构任务与 FigTide 品牌源资产
```

## 许可证

本项目采用 [MIT License](LICENSE)。第三方依赖、字体与素材仍遵循各自许可证，授权说明以对应文件为准。
