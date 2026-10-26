# 任务 16：独立窗口（Edge 应用模式）

**先读**：`AGENTS.md`、`docs/desktop/` 下的桌面版文档（方案、冒烟清单、使用说明）。
**目标**：双击 `FigTide.exe` 后，界面在一个**没有地址栏和标签页的独立窗口**里打开，而不是在默认浏览器的新标签页里。用系统自带的 Microsoft Edge 的应用模式实现，不引入新框架和新工具链。
**分支**：从 `main`（或 MCP 合并后的 main）新建 `feature/app-window`，每节单独提交，不推送。

---

## 16-1 启动方式

1. **查找 Edge**：依次检查注册表 `HKLM` / `HKCU` 的 `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe`，以及 `%ProgramFiles(x86)%` 和 `%ProgramFiles%` 下的 `Microsoft\Edge\Application\msedge.exe`。
2. **启动参数**：
   ```
   msedge.exe --app=http://127.0.0.1:<端口>/ --user-data-dir=%LOCALAPPDATA%\FigTide\window --no-first-run --no-default-browser-check --window-size=1440,900
   ```
   - 使用独立的 `user-data-dir`：FigTide 的本地存储（草稿、页面偏好、看过介绍页的标记）保存在这个固定目录里，每次启动都相同；也不会和用户日常浏览器的扩展、账号混在一起；
   - 地址始终用 `127.0.0.1` 和固定端口（沿用 14-2b 的规则）。
3. **退回浏览器**：找不到 Edge 或启动失败时，退回现在的默认浏览器方式，并用托盘气泡说明原因；日志里记录。
4. **配置项**：`--labflow.desktop.window=app|browser`，默认 `app`；测试里仍然可以用 `open-browser=false` 完全关闭。
5. **再次双击**：已有实例时，用同样的参数再打开一个应用窗口（Edge 会复用同一个 `user-data-dir`）；不启动第二个后端。
6. **关闭窗口**：关闭窗口不退出 FigTide，后端继续在托盘运行（与现在一致）；托盘「打开 FigTide」重新打开应用窗口。
7. **托盘新增「在浏览器中打开」**：用默认浏览器打开同一个地址。用途：用户从旧版本升级时，默认浏览器里可能还留着未保存的草稿，从这里打开就能找回（见 16-3）。

## 16-2 窗口图标和标题

1. 前端新增 `manifest.webmanifest`（名称 FigTide、简称 FigTide、主题色、16 到 512 px 图标，使用 `docs/development/` 下品牌资产里的 PNG），在 `index.html` 中引用。
2. 实测并记录 Edge 应用窗口的**窗口图标、任务栏图标、标题**实际显示的是什么，截图放进 `docs/desktop/APP-WINDOW.md`。如果任务栏显示的是 Edge 图标，如实写明这是 Edge 应用模式的限制，不要用其他手段伪装。

## 16-3 升级说明

从 0.2.0 升级时，默认浏览器里存的草稿和页面偏好不会自动出现在新窗口里（存储目录不同）。
1. CHANGELOG「未发布」一节写明这一点；
2. 升级后第一次启动时，托盘气泡提示一次：「FigTide 现在在独立窗口中打开。如果之前在浏览器里有未保存的草稿，可以从托盘「在浏览器中打开」找回。」只提示一次（记在 `desktop.json`）。

## 16-4 测试

1. **单测**：Edge 路径查找（各种存在 / 不存在组合）、启动参数拼装（含中文和空格的数据目录）、找不到 Edge 时退回浏览器、`window=browser` 配置、首次升级提示只出现一次。
2. **Windows CI 进程探针**：GitHub 的 Windows 机器上有 Edge。测试模式下额外传 `--remote-debugging-port=0`，从 `user-data-dir` 里的 `DevToolsActivePort` 文件读出调试端口，查询打开的页面，断言加载的是 `http://127.0.0.1:<端口>/`、页面标题包含 FigTide；测试结束后关闭 Edge 进程并删除临时 `user-data-dir`。这个调试参数只在测试中使用，正式启动**绝不能**带。
3. 桌面模式完整 E2E 照常运行（仍然关闭窗口），一次全绿。

## 16-5 文档与冒烟

1. `docs/desktop/APP-WINDOW.md`：实现方式、实测截图、已知限制（依赖 Edge、任务栏图标的实际表现）。
2. GUIDE.md、README 更新「界面在独立窗口中打开」的描述；保留「在浏览器中打开」的说明。
3. 冒烟清单新增：双击后出现独立窗口；关闭窗口后托盘仍在；托盘「打开 FigTide」「在浏览器中打开」；卸载 Edge 或改名模拟找不到时退回浏览器（可选）。

## 总验收

- 后端测试（MySQL、H2）、前端测试和构建通过；Windows CI 的进程探针通过；桌面模式完整 E2E 一次全绿。
- 汇报按 AGENTS.md 格式，附实测的窗口和任务栏截图，列出需要仓库主人手动确认的冒烟项。
