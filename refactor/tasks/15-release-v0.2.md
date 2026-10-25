# 任务 15：发布 FigTide v0.2.0（Windows 桌面版）

**先读**：`AGENTS.md`、`refactor/desktop/DESKTOP-PLAN.md`、`docs/TEST-RESULTS.md` 顶部 14-4 / 14-5 各节、`docs/desktop/SMOKE-14-5.md`。
**前提**：仓库主人已完成 `SMOKE-14-5.md` 的人工检查（托盘、默认浏览器、第二次启动、退出、强制结束后重启）。没有完成就停下提醒，不要开始。
**分支**：从 `desktop/14-5` 新建 `release/v0.2.0`，每节单独提交。推送、合并、打标签只在 15-4 执行，并且要遵守那一节的限制。

---

## 15-1 版本号与更新日志

1. `frontend/package.json`、后端 `pom.xml` 版本改为 `0.2.0`；打包脚本、产物文件名、关于弹窗、EXE 版本信息都从这里读取，确认产物名变成 `FigTide-0.2.0-windows-x64.zip`。
2. `CHANGELOG.md` 新增 `## 0.2.0 — {日期}`，只写已实现的内容：
   - Windows 便携版：解压后双击 `FigTide.exe`，不需要安装 JDK 和 MySQL；
   - 内嵌数据库，数据保存在 `%LOCALAPPDATA%\FigTide`；
   - 托盘图标、单实例、固定端口（重启后草稿和页面偏好保留）；
   - 本机安全：Host / Origin 校验；
   - 从旧版（MySQL）迁移的工具和核对报告；
   - 已知限制：未签名（SmartScreen 提示）、只有便携 ZIP 没有安装向导、界面在系统浏览器里打开、助手历史不随迁移保留。

## 15-2 使用指南

新建 `docs/GUIDE.md`（README 和展示页都链接过去），写给第一次使用的科研用户，按顺序：
1. 下载和解压（必须解压整个文件夹，不能只拿 EXE）；
2. 第一次打开：SmartScreen 提示时点「更多信息 → 仍要运行」，并说明为什么会出现（未签名）；
3. 托盘图标：关闭浏览器不会退出，从托盘退出；
4. 载入示例项目，认识界面；
5. 导入自己的 CSV，确认字段；
6. 画图：选图表类型、映射字段、调整样式；
7. 绘图助手：配置模型、勾选同意、预览、应用、撤销；
8. 导出：选择期刊尺寸，导出 PDF / SVG / PNG；
9. 备份与恢复；从旧版迁移（链接 `docs/desktop/MIGRATION.md`）；
10. 升级到新版本（解压新版，数据目录不受影响）；
11. 常见问题：端口被占用的提示是什么意思、杀毒软件拦截、数据和日志在哪、怎么彻底卸载。

每一步配截图：用 Playwright 在**打包产物**上自动拍（`LABFLOW_CAPTURE=1`，`reducedMotion: "reduce"`），存到 `docs/guide/`。托盘、SmartScreen 这类拍不到的画面，用文字说明，不要伪造截图。截图里只能出现示例项目的数据。

## 15-3 仓库整理

1. 把根目录的 `refactor/` 移到 `docs/development/`，在里面加一个简短的 `README.md`：「本项目使用 AI 编程助手协作开发，这里是各阶段的任务书、设计稿和验收记录」。全仓库搜索 `refactor/` 路径引用（AGENTS.md、docs、scripts、测试），全部更新；E2E 和脚本里的引用要实际跑一遍确认。
2. README：
   - 顶部「快速开始」改成「下载 Windows 版」→ 链接到最新 Release（`https://github.com/chen0206a/figtide/releases/latest`），并链接 GUIDE.md；
   - 原来的源码运行说明挪到「开发者」一节；
   - 加一行「macOS 版和原生窗口在计划中」。
3. 展示页 `site/index.html`：「本地运行」按钮改为「下载 Windows 版」，链接同上；`scripts/test-site.cjs` 断言同步更新。

## 15-4 合并与发布（受限操作）

本节授权推送，范围仅限以下操作，禁止 `--force`，禁止改写已推送的历史，遇到冲突或检查失败就停下汇报：
1. 推送 `release/v0.2.0`，用 `gh pr create` 开 PR（base `main`），正文写 CHANGELOG 0.2.0 和验收摘要；等 CI（包括 H2 任务）全部通过后，`gh pr merge --merge`。
2. 在合并后的 main 上打 `v0.2.0` 标签并推送，触发 `desktop-release` 工作流。
3. 观察工作流：在 GitHub 的 Windows 机器上完整构建便携包，并跑工作流里定义的测试。成功后应自动创建 Release 草稿并附上 ZIP 和 SHA256SUMS。**工作流失败就停下汇报，附日志，不要手动上传本地构建的 ZIP 来代替。**
4. 检查草稿：标题「FigTide v0.2.0」，正文为 CHANGELOG 0.2.0，附件齐全，SHA256 和工作流输出一致。确认无误后发布。
5. 推送到 main 后，确认展示页的部署工作流成功、新按钮生效。
6. 删除已合并的远端分支 `release/v0.1.0`（标签保留）；`desktop/*` 和 `release/v0.2.0` 等合并后的分支也删除远端副本，本地保留。

## 15-5 发布后检查

1. 从 GitHub Release **重新下载** ZIP（不要用本地产物），核对 SHA256，解压到一个新目录，用一个全新的临时数据目录启动，跑一次 `test-desktop-package.ps1` 冒烟。
2. 从网上下载的文件会带「来自互联网」标记，SmartScreen 只在这种情况下出现。把这一项加进 `SMOKE-14-5.md`，留给仓库主人手动确认。
3. 汇报：PR、合并提交、标签、工作流运行、Release 的链接，以及下载复核结果；列出需要仓库主人确认的人工项。
