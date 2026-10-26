# FigTide 独立窗口（Edge 应用模式）

任务 16 引入的独立窗口方案：桌面版默认不再在系统默认浏览器的普通标签页里打开工作台，而是用 Microsoft Edge 的应用模式（`--app`）打开一个独立窗口。本文记录实现方式、实测结果与已知限制。

## 实现方式

启动参数由 `backend/src/main/java/dev/labflow/desktop/DesktopWindow.java` 组装：

```
msedge.exe --app=http://127.0.0.1:<端口>/
  --user-data-dir=<数据目录同级>/window
  --no-first-run --no-default-browser-check
  --window-size=1440,900
```

- **Edge 查找顺序**：注册表 `HKLM`、`HKCU` 的 `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe`，然后依次尝试 `%ProgramFiles(x86)%`、`%ProgramFiles%` 下的 `Microsoft\Edge\Application\msedge.exe`。
- **固定 user-data-dir**：默认 `<数据目录同级>/window`（即 `%LOCALAPPDATA%\FigTide\window`）。草稿、介绍页标记、页面偏好等浏览器本地状态存在这份独立的 Edge 配置里，重启后端口不变（首选固定端口），窗口里的状态可以沿用。
- **端口规则不变**：仍遵守 14-2b 的首选固定端口（默认 17861）+ 占用时临时随机 + 托盘气泡提示。
- **配置开关**：`--labflow.desktop.window=app|browser`（默认 `app`）。`--labflow.desktop.open-browser=false` 仍然完全禁止开窗口（测试与 E2E 用）。传其他值直接报错，不静默回退。
- **找不到 Edge 或启动失败**：退回系统默认浏览器打开，托盘弹一次气泡说明原因，日志同步记录。生产参数里永远不会出现 `--remote-debugging-port`（只有 CI 探针测试时才加，见下）。
- **再次双击**：第二个进程探测到已有实例后，同样以应用模式再开一个窗口，不会启动第二个后端。
- **托盘**：新增「在浏览器中打开」菜单项（系统默认浏览器，方便找回旧浏览器里的未保存草稿）；「打开 FigTide」也改为打开应用窗口。

## 实测结果（Windows 10 本机）

启动真实 `figtide.jar`（`--labflow.desktop.tray=false`，窗口默认开启）：

- Edge 应用窗口正常打开，尺寸精确 1440×900，加载 `http://127.0.0.1:<端口>/`（SPA 重定向到 `/welcome`，标题「欢迎 · FigTide」）。
- 主进程命令行与上面参数一致；崩溃恢复、GPU、渲染子进程全部挂在这份 user-data-dir 上。
- 窗口截图：`docs/screenshots/app-window-main.png`；任务栏截图：`docs/screenshots/app-window-taskbar.png`。

### 任务栏图标（如实记录）

**Edge 应用窗口的窗口图标和任务栏图标是 Microsoft Edge 的标志（蓝绿漩涡），不是 FigTide 的图标。** 通过 `WM_GETICON` 取出的 48×48 图标与品牌 `favicon` 做像素级对比（差异 130，基线自比 15.7），主要颜色为白色背景 + Edge 蓝绿，可确认不是 FigTide 品牌图标（墨黑 + 橙色）。`--app` 模式下 Edge 不提供自定义窗口图标的途径；任务书也明确禁止伪装任务栏图标。网页内的 favicon（`frontend/public/favicon.ico`、`manifest.webmanifest` 的 16–512px 品牌图标）在窗口内正常显示。

## 测试

- **单元测试**：`backend/src/test/java/dev/labflow/desktop/DesktopWindowTest.java`（16 项）：路径/参数/模式/升级提示，以及早期非零退出回退、退出 0 的正常进程接管、线程中断回退。
- **CI 进程探针**：`scripts/desktop/edge-window-probe.cjs` 用测试入口 `DesktopWindowProbeMain` 调用真实 `DesktopLauncher.launch → DesktopWindow.open → Edge`。入口只在 `src/test`，不随应用 JAR 发布；Spring Boot 的测试加载器仅加载这一个入口类，避免测试静态页面遮盖正式界面。在进程创建边界检查生产命令不含调试参数后，仅测试入口附加 `--remote-debugging-port=0`。探针核对实际页面 URL/标题与端口实例身份，按本轮唯一目录清理进程与配置；JSON 和启动日志随 CI 工件上传。

手工复现自动探针（先 `mvn -f backend/pom.xml test-compile`，应用已构建）：

```powershell
node scripts/desktop/edge-window-probe.cjs --app 'dist/desktop/FigTide-0.2.0-windows-x64/FigTide'
# 源码 JAR 也可用 --jar .runtime/desktop-build/figtide.jar --java-home <JDK目录>
```

- **完整桌面 E2E**：`scripts/test-agent.ps1 -All -Desktop` 照常全量回归（窗口关闭路径）。

2026-10-26 修复后，真实打包 JAR 的窗口链路探针通过，原始证据见 [desktop16-launch-chain.json](../test-evidence/desktop16-launch-chain.json)。该探针不代替下方系统托盘的人工点击检查。

## 已知限制

- **依赖 Microsoft Edge**：Edge 缺失或启动失败时退回默认浏览器（托盘气泡说明）。窗口图标/任务栏图标是 Edge 的（见上）。
- **关闭窗口不会退出程序**：后端与托盘仍在运行，需要从托盘「退出」。
- **升级提示**：从旧版本（浏览器模式）升级后第一次启动，托盘气泡提示一次「旧浏览器草稿不自动迁移，可从托盘『在浏览器中打开』找回」（标记记在 `desktop.json`，不重复弹）。
- **旧浏览器本地状态不自动迁移**：与既有规则一致，草稿/页面偏好按 origin 隔离。
