# 任务 14-2：桌面启动器（单进程、随机端口、打开浏览器、托盘）

**先读**：`AGENTS.md`、`refactor/desktop/DESKTOP-PLAN.md`、`docs/desktop/H2-PROBE.md`、`docs/TEST-RESULTS.md` 顶部 14-1 各节。
**目标**：`java -jar figtide.jar --spring.profiles.active=desktop` 一条命令完成：启动后端（H2）、在随机端口提供前端页面和 API、自动打开浏览器、显示托盘图标。双击安装包是 14-4 的事，这一步先让这条命令跑通。
**分支**：从 `desktop/14-1` 新建 `desktop/14-2`，每节单独提交，不推送。
**授权**：沿用 AGENTS.md 的「桌面版后端授权」。本任务额外允许：新增 `desktop` 包下的启动类和配置、新增只在 `desktop` profile 下注册的接口 `GET /api/desktop/ping`、修改 `LocalOriginFilter`（见 14-2-3）。**默认 profile（开发和现有 E2E）的行为不能变。**

---

## 14-2-0 先处理 14-1 的收尾

1. 在 `docs/TEST-RESULTS.md` 写明：14-1 的 H2 E2E「83 全绿」是不是一次完整运行（命令、开始结束时间）；中途「Chromium 崩溃 + 透明度 4e-6」记为已知偶发，写清复现条件。
2. 把 `docs/desktop/DB-AUDIT-glm-5.3.md` 入库，作为设计记录。
3. `DESKTOP-PLAN.md` 中 H2 迁移目录改成 `db/migration-h2/`，并写明原因（Flyway 递归扫描冲突）；补一行「H2 数据源必须带 `WRITE_DELAY=0`，否则强制结束进程会丢失已提交数据」。

## 14-2-1 后端提供前端页面

1. 新建 `scripts/build-desktop.ps1`：先 `npm ci && npm run build`（frontend），再把 `frontend/dist` 复制到后端的 `static` 资源目录，最后 `mvn -DskipTests package` 生成 `figtide.jar`。复制步骤可以用 Maven profile（例如 `-Pdesktop` 时用 resources 插件拷贝 `../frontend/dist`），二选一，选更简单的；**不要把 dist 提交进 git**。
2. 只在 `desktop` profile 下启用前端路由回退：
   - `/api/**` 保持原样（不存在的接口仍然返回 JSON 404）；
   - 存在的静态文件直接返回；
   - 其他 GET 请求（例如 `/welcome`、`/projects/3/figures/7`）返回 `index.html`。
3. 缓存：`index.html` 设为 `no-cache`；带哈希的资源（`/assets/*`）长期缓存。
4. 单测：上面三种路径各至少一条；默认 profile 下不提供静态页面（行为不变）。

## 14-2-2 启动器

新建 `dev.labflow.desktop` 包，启动入口只在 `desktop` profile 生效：

1. **数据目录**：`%LOCALAPPDATA%\FigTide\data`（取环境变量 `LOCALAPPDATA`；拿不到就用 `用户主目录\AppData\Local`）。可以用 `--labflow.data-dir=…` 覆盖（测试要用）。日志目录 `…\FigTide\logs`。
2. **时区**：`main` 方法第一行设置 `TimeZone.setDefault(UTC)`，同时在 14-4 打包时加 JVM 参数 `-Duser.timezone=UTC`（在 DESKTOP-PLAN 里记下）。
3. **单实例**：数据目录下 `app.lock`（`FileChannel.tryLock`）。已有实例时：读取 `app.port`，调用 `GET /api/desktop/ping` 确认它确实在运行（返回实例 id），然后打开浏览器指向它，当前进程退出；锁存在但 ping 不通（上次异常退出），则正常启动并覆盖端口文件。
4. **端口**：`server.port=0`，监听 `127.0.0.1`；服务就绪后（`WebServerInitializedEvent`）把实际端口写进 `app.port`。
5. **打开浏览器**：用 `java.awt.Desktop.browse`；不支持时退回 `rundll32 url.dll,FileProtocolHandler <url>`。`--labflow.desktop.open-browser=false` 可关闭（测试用）。
6. **托盘**：注意 Spring Boot 默认把 `java.awt.headless` 设为 true，必须 `setHeadless(false)`，否则托盘不工作。图标用 `refactor/brand/png/favicon-16.png`、`favicon-32.png`（复制到资源目录）。菜单：「打开 FigTide」「打开数据文件夹」「打开日志文件夹」「退出」。首次启动弹一次气泡提示「FigTide 正在运行，关闭浏览器不会退出，可以从托盘图标退出」。`--labflow.desktop.tray=false` 可关闭（测试用）。
7. **退出**：托盘「退出」或系统关机时，正常关闭 Spring 上下文和数据源，删除 `app.port`，释放锁。
8. **日志**：`desktop` profile 下输出到 `logs\figtide.log`，按大小滚动，保留最近 5 个；日志里不得出现模型密钥。

## 14-2-3 本机安全（Host 与 Origin）

只在 `desktop` profile 下生效：
1. **所有请求**（包括 GET）校验 `Host` 头只能是 `127.0.0.1:<实际端口>` 或 `localhost:<实际端口>`，否则 403。这是为了防 DNS 重绑定：恶意网页把自己的域名解析到 127.0.0.1 后读取数据。
2. 写请求（非 GET/HEAD/OPTIONS）的 `Origin` 只接受 `http://127.0.0.1:<实际端口>` 和 `http://localhost:<实际端口>`；带了其他 Origin 一律 403。
3. 默认 profile 的 `LocalOriginFilter` 白名单和行为保持不变。
4. 测试矩阵：正确 Host / 错误 Host / 缺 Host；同源 Origin / 其他端口 / 其他域名 / 没有 Origin；GET 与 POST。两个 profile 各自的预期都要覆盖。

## 14-2-4 E2E 在桌面模式下跑

`scripts/test-agent.ps1` 新增 `-Desktop`：用 `build-desktop.ps1` 的产物启动 `figtide.jar`（`desktop` profile、临时数据目录、`open-browser=false`、`tray=false`），从 `app.port` 读端口，**页面和 API 都由这个 jar 提供**（不经过 Vite），然后跑全量 E2E。需要的话给 Playwright 配置加一个读取端口的方式，不要写死端口。

## 14-2-5 手工冒烟清单

自动化覆盖不到托盘和浏览器，写一份 `docs/desktop/SMOKE-14-2.md` 给仓库主人在 Windows 上手动检查，每项一行、可勾选：首次启动打开浏览器；托盘图标和气泡；再次运行时不启动第二个实例而是打开已有页面；托盘「打开数据文件夹」「打开日志文件夹」；关闭浏览器后服务仍在；托盘退出后端口文件删除、进程结束；任务管理器强制结束后重新启动，之前保存的图表还在；数据目录位置正确。你能自动验证的项目先验证，并标出哪些需要人工确认。

## 总验收

- 后端 `mvn test`（MySQL）和 `LABFLOW_TEST_DB=h2 mvn test` 全部通过。
- 前端 `npm test`、`npm run build` 通过。
- E2E：开发模式（MySQL）83 条全绿；`-Desktop` 模式 83 条全绿。都必须是**一次完整运行**，失败就停下汇报，不刷新基线、不删断言。
- 汇报按 AGENTS.md 格式；后端改动按「桌面启动器 / 本机安全 / 静态页面 / 测试设施」分类列出；最后列出需要人工确认的冒烟项。
