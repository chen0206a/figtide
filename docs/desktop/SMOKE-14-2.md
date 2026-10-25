# 14-2 Windows 桌面启动冒烟清单

自动化验证只用临时 H2 数据目录，没有连接日常 MySQL 工作区或 8086。人工项未执行，不能视为通过。

## 运行

在仓库根目录的 PowerShell 中构建（需要 Node、Maven 和 JDK 21；双击安装包由 14-4 实现）：

```powershell
./scripts/build-desktop.ps1
java -Duser.timezone=UTC -jar .runtime/desktop-build/figtide.jar --spring.profiles.active=desktop
```

默认数据目录是 `%LOCALAPPDATA%\FigTide\data`，日志目录是 `%LOCALAPPDATA%\FigTide\logs`；LOCALAPPDATA 不可用时回退到用户主目录的 `AppData\Local\FigTide`。不卸载/删除这两个目录。可用 `--labflow.data-dir=你的临时目录/data` 做隔离检查，日志在其同级 `logs`。目录带空格时请把整个参数用引号包住。

`app.port` 是 JSON，含实际端口和实例 ID；`app.lock` 是操作系统文件锁的载体，正常退出后保留空文件。端口文件被清理、空锁文件仍存在是预期行为。活动锁而 ping 尚未就绪会等待后提示，不会冒险打开第二个数据库。

`desktop.json` 保存在数据目录，首次记录 `{"preferred_port":17861}`。后续优先使用它；`--labflow.desktop.port=端口` 可覆盖本次选择（首次覆盖会作为初始记录，已有文件保持不变）。端口占用时本次随机，并在日志和托盘提示「端口被占用，本次无法沿用未保存的草稿和页面偏好」；下次仍重试首选端口。不要把 app.port 的实际回退端口写回 desktop.json。

## 已自动验证

- [x] 默认目录计算、缺失环境变量回退、显式覆盖，以及中文/空格目录（单测与实际子进程）。
- [x] 固定首选端口仅监听 loopback；网页和 API 来自同一个 Java 进程，桌面 E2E 不启动 Vite。
- [x] 再运行同一数据目录时，第二个进程核对 ping 身份后退出，第一实例与端口记录保持不变（关闭自动浏览器的子进程探针）。
- [x] 正常退出路径关闭 Spring/数据源，删除本实例端口文件、释放锁；再启动成功且保存的项目、图表配置仍在。
- [x] 强杀后留下陈旧端口记录；再启动覆盖它，已提交数据仍在（WRITE_DELAY=0）；新增检查在 PUT 保存图表后立即强杀，再开核对最新配置与 revision 一致。
- [x] 桌面文件日志存在；按大小保留5个归档的配置测试通过；日志无测试模型密钥。
- [x] 正确 Host 与同源写入可用，错误 Host / 跨端口 Origin 返回403；开发 profile 原规则不变。
- [x] 首页和深链接、真实生产静态资源、缓存与未知API JSON404均经过验证。
- [x] 重启后不再显示介绍页、草稿可恢复：同一浏览器上下文留存未保存草稿，强杀并重新启动真实 JAR，刷新后恢复原配置、名称与 revision；服务端图表列表仍为空，没有自动正式保存。
- [x] 首选端口占用时临时随机，desktop.json 字节不变且写出警告日志；释放占用后再启动，恢复首选端口（真实 JVM 进程探针）。

进程探针：`scripts/check-desktop-launcher.cjs`，需先生成依赖 classpath：

```powershell
# 先构建上面的桌面 JAR，再编译 test-only 进程入口（它不会进入产品 JAR）
mvn -B -f backend/pom.xml -Dtest=DesktopLauncherTest,DesktopPagesTest test
mvn -q -f backend/pom.xml dependency:build-classpath "-Dmdep.outputFile=$PWD/.runtime/desktop-test-classpath.txt"
node scripts/check-desktop-launcher.cjs
```

证据见 `docs/test-evidence/desktop14-2-launcher.json`、`desktop14-2-security.json` 、`desktop14-2-final-launcher.json` 和 `desktop14-2-scoped.json`。正常退出由测试专用 stdin 入口调用与托盘相同的生命周期关闭逻辑；这验证服务清理，不等于真实点击托盘菜单。完整 E2E 结果以 TEST-RESULTS 顶部总验收为准。

## 需要仓库主人在交互式 Windows 桌面确认

- [ ] 首次正常启动自动打开系统默认浏览器，页面可操作，地址为 `http://127.0.0.1:17861/`（或实际首选端口）。
- [ ] 通知区域出现 FigTide 图标，首次出现“关闭浏览器不会退出，可以从托盘图标退出”的气泡；后续启动不重复提示。
- [ ] 临时占用首选端口后启动，托盘出现「端口被占用，本次无法沿用未保存的草稿和页面偏好」，不被首次运行提示覆盖。
- [ ] 再执行启动命令时打开原实例页面，没有第二个后端进程，也没有新建第二个数据库。
- [ ] 托盘“打开 FigTide”可重新打开页面。
- [ ] 托盘“打开数据文件夹”打开当前实例实际使用的数据目录。
- [ ] 托盘“打开日志文件夹”打开实际日志目录，含figtide.log。
- [ ] 关闭浏览器后服务仍运行，再从托盘打开可继续使用。
- [ ] 托盘“退出”后Java进程结束，app.port删除；空app.lock保留，重新启动正常。
- [ ] 创建并保存一张合成数据图表，任务管理器强制结束后端，再启动后图表仍能打开。
- [ ] 系统关机/用户注销时正常退出服务，下一次启动没有锁占用错误。
- [ ] 不传数据目录覆盖时，数据和日志确实位于本账户的LOCALAPPDATA目录；不要用真实重要数据做强杀测试。

托盘与默认浏览器属于OS集成，本轮自动验证使用open-browser=false / tray=false，以上人工项不预先勾选。

## 已知设计边界

14-2b 改为固定首选端口。草稿/页面偏好仍存同一浏览器配置文件的 localStorage，端口占用临时回退或显式更换端口时，无法跨 origin 读取它们；原端口存储不会删除，恢复原首选端口即可继续读取。已保存项目、数据、图表、图表版本由 H2 持久保存。更换默认浏览器或清理浏览器数据不会迁移草稿，退出前仍建议保存图表。

这一步还不是安装包；JDK随包、双击EXE与签名说明属于14-4，迁移工具属于14-3。
