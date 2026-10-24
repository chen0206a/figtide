## 2026-10-24 · 14-2-3：桌面 Host / Origin 边界

- 本机安全授权：LocalOriginFilter 仅在 desktop profile 对所有请求检查 Host=127.0.0.1:<实际socket端口> / localhost:<实际socket端口>。不使用 Host 自带端口或 X-Forwarded-* 作为可信端口；写请求有 Origin 时仅放行该端口的两个本机来源。无 Origin 保持本机程序调用可用，GET/HEAD/OPTIONS 的 Origin 不做写请求检查，但 Host 必须正确。
- 默认 profile 原来的四个开发来源 + frontend-origin 配置、无 Origin 放行、不检查 Host 的行为保留；没有开放 CORS。这是浏览器本机边界，不是本机用户认证。
- `mvn -B -f backend/pom.xml -Dtest=LocalOriginMatrixTest,DesktopLauncherTest,DesktopPagesTest test`：73 passed / 0 failed / 0 skipped。安全矩阵62例，覆盖两个profile、正确/错误/缺失Host，同源/其他端口/其他域名/无Origin，GET/POST及HEAD/OPTIONS/localhost/伪造转发头。
- 桌面 Maven package 通过；`node scripts/check-desktop-launcher.cjs` 12项通过，真实HTTP错误Host与跨端口Origin返回403，同源写入成功，生命周期与落盘检查再次通过；证据 `docs/test-evidence/desktop14-2-security.json`。首次探针使用 Node fetch 设置 Host，实际被客户端规范化，修为原生HTTP客户端真正发送攻击头后通过，未放宽断言或产品规则。
- 前端无修改，未重复跑此前280项与build；全量双库后端、开发83条与桌面83条留总验收。不访问8086日常工作区。

## 2026-10-24 · 14-2-2：单进程桌面启动器

- 桌面启动授权：main 第一行设 UTC，只有 desktop profile 进入 DesktopLauncher；用户 LOCALAPPDATA / 用户主目录回退、可覆盖数据目录、随机 loopback 端口、OS 文件锁、app.port JSON（port + instance_id）、仅 desktop 的 GET /api/desktop/ping。重复启动先验证 ping 的实例 ID，成功后打开原页面并退出；活动锁但 ping 不通时等待并报错，绝不抢锁再开数据库。陈旧“锁文件”无 OS 锁则可正常恢复。
- DesktopUi 支持 Desktop.browse / Windows rundll32 回退，AWT headless=false，16/32px 品牌图标、四项托盘菜单、首次气泡。正常退出先关闭 Spring/数据源，再删除自己实例的端口记录和释放锁；app.lock 空文件保留以避免锁文件 inode 竞态。
- desktop-only logback 配置：logs/figtide.log，10MB 按大小滚动，5 个归档；不改变默认 profile 日志配置。测试假密钥不出现在日志。
- `mvn -B -f backend/pom.xml -Dtest=DesktopLauncherTest,DesktopPagesTest test`：11 passed / 0 failed / 0 skipped。新增7例路径/锁/身份/陈旧记录/日志策略测试。
- `mvn -B -f backend/pom.xml -Pdesktop -DskipTests -Dlabflow.build.directory=../.runtime/desktop-build package` 通过；依赖 classpath 生成后 `node scripts/check-desktop-launcher.cjs`：9 项通过（真实子 JVM、中文空格路径、随机端口、同 JAR 页面、第二实例退出、正常退出清端口、正常重启与强杀重启数据保留、日志位置/假密钥检查）。证据 `docs/test-evidence/desktop14-2-launcher.json`。测试入口 LauncherProcessProbe 只在 test classes，不进产品 JAR。
- `npm test -- --maxWorkers=4`：52 files / 280 passed；`npm run build`：通过（11.54s，既有 chunk 提示）。
- 未执行：浏览器自动唤起、托盘真实点击与气泡目视、系统关机；列入14-2-5人工清单。全量双库后端与83条E2E留总验收，不把上述进程探针当成全量E2E。

## 2026-10-24 · 14-2-1：桌面 JAR 提供前端

- 静态页面授权：新增 desktop-only DesktopPages，GET 首页/深链接返回 no-cache index，现有 API 优先匹配、未知 API 返回 JSON 404，缺失 assets 不回退 HTML，带哈希 assets 长期缓存。默认 profile 不注册页面控制器。
- 构建设施：`scripts/build-desktop.ps1` 在独立 `.runtime/desktop-ui-<uuid>/frontend` 执行 npm ci + build，Maven `-Pdesktop` 将 dist 复制到 JAR 的 `desktop-static/` 并输出 `.runtime/desktop-build/figtide.jar`。资源不用 Boot 默认 static 目录，避免默认 profile 意外提供页面；未把 dist 入库。
- `mvn -B -f backend/pom.xml -Dtest=DesktopPagesTest test`：4 passed / 0 failed / 0 skipped，覆盖首页/深链接、缓存/资源404、API JSON404、默认profile不注册。
- `./scripts/build-desktop.ps1`：npm ci、前端 build、Maven package 全部通过。JAR ZIP 检查含 index + 41 个 desktop-only assets，不含默认 static 路径。实际临时 H2 JAR（18871）首页/深链接内容一致、未知 API JSON404 检查通过；探针清理 Wait-Process 因已退出进程使外层命令返回1，HTTP断言已全部执行，不记作正式E2E通过。
- `npm test -- --maxWorkers=4`：52 files / 280 passed / 0 failed。全量 E2E / 双库后端留总验收。
- 构建过程：首次在原 frontend 运行 npm ci 因 Windows Vite 原生模块锁 EPERM 失败；改为隔离构建，补复制测试引用的 docs/config-v1.example.json 后通过。原目录依赖用 npm ci 恢复；只重启已跟踪的 Vite，未连接/重启 8086 或操作日常数据库。构建脚本后续不再清理运行中的 node_modules。
- 偏差：桌面资源用 desktop-static 而非默认 static，以满足“默认 profile 不提供页面”；其余语义不变。

## 2026-10-24 · 14-2-0：14-1 收尾与启动基线

- 从 `desktop/14-1` 的 `d84e002` 创建 `desktop/14-2`；开工时跟踪文件干净，唯一未跟踪项为前轮按约定留下的 DB-AUDIT-glm-5.3.md，本节按新任务要求入库。
- 14-1 最终 H2 E2E 是一次完整运行：命令 `./scripts/test-agent.ps1 -All -FixturePort 18770 -Database h2`（命令来源为上轮报告）；开工时留存的 Playwright 完整报告记录 start=2026-10-24T17:44:39.358000+09:00、end=2026-10-24T17:48:57.821206+09:00（Asia/Tokyo）、duration=258463.206ms、83 passed / 0 failed / 0 skipped / 0 flaky，workers=1。报告统计和原报告 SHA-256 留在 `docs/test-evidence/desktop14-1-h2-retained-summary.json`，不是把定向重跑拼成全绿。本节未重新运行它。
- 上轮在文件 H2、单 worker、全量浏览器负载下曾出现 Chromium 0xC0000409 与 motion opacity=0.999996 两个偶发；原报告保留它们及定向 9/9 结果。机器资源/动画采样相关性仅是原报告判断，目前无确定性最小复现，不把环境判断当已证实根因；最终完整一轮报告的 flaky=0 不抹去此前失败。
- DESKTOP-PLAN 已使用与 MySQL 迁移平级的 `db/migration-h2/`，原因是 Flyway 递归扫描嵌套目录造成重复版本；本节补 WRITE_DELAY=0 必需性。AGENTS 追加任务书已明确授予的 14-2 范围。
- 验证：留存 JSON 解析及统计对账通过；无产品代码改动，Java/前端单测、build、E2E 本节未执行，后续分节及总验收另列。

## 2026-10-24 · 任务 14-1：H2 数据库兼容（desktop/14-1 分支，6 个提交，未推送）

- 提交序列：`63cc987`（14-1-0 AGENTS 授权+任务书入库）→ `70cb2d5`（14-1-1 H2 依赖+desktop profile）→ `e6eae35`（14-1-2 兼容性探针+db/migration-h2 V1–V8+版本对齐测试）→ `eb7bcd5`（14-1-3 双库可移植性）→ `abc2b11`（14-1-4 测试基础设施）→ 末尾强杀落盘修复提交（WRITE_DELAY=0）。
- 后端 MySQL：`mvn test`（LabFlow/backend，JDK .runtime/java，MySQL 33316 labflow_test）— **28 类 / 184 tests / 0 失败 / 0 错误 / 1 跳过**（`eval/ServerEvaluationTest`，`@EnabledIfSystemProperty(labflow.eval.server)` 实测开关，原有跳过，与数据库无关）。曾出现 surefire 旧报告虚增计数（已删除类的残留 .txt），清理后复跑得到上述干净数字。
- 后端 H2：`LABFLOW_TEST_DB=h2 mvn test` — **28 类 / 178 tests / 0 失败 / 0 错误 / 1 跳过**；差值 6 = `eval/AgentEvaluationTest`(1) + `eval/EvaluationRunnerIntegrationTest`(5) 在 H2 下按 14-1-4.3 要求 `@BeforeAll assumeTrue` 类级跳过（评测依赖真实 MySQL，日志写明原因）。184−178=6 对账一致。
- 前端（本轮无前端改动）：`npm test` — **52 files / 280 passed / 0 failed**；`npm run build` — 通过（保留既有 >500kB chunk 提示）。
- E2E MySQL：`.\scripts\test-agent.ps1 -All -FixturePort 18770` — **83 passed / 0 failed（5.9m）**，`audit-restart` 通过，teardown 清理 92 个测试项目。
- E2E H2：`.\scripts\test-agent.ps1 -All -FixturePort 18770 -Database h2` — 最终 **83 passed / 0 failed（4.3m）** + `audit-restart` 通过。过程记录（均为环境/时序波动或实测修复，无断言放宽、无基线刷新）：
  1. 首次 H2 全量：浏览器 83 全绿，但 `audit-restart` 在强杀后重启 404——H2 默认写缓冲丢失强杀前约 1 秒内已提交数据（实测复现：`Runtime.halt(137)` 后重开，默认 URL 数据库为空，`;WRITE_DELAY=0` 则数据完好，证据与结论补进 `docs/desktop/H2-PROBE.md`）。修复：`application-desktop.yml` 与 E2E 脚本的 H2 文件库 URL 统一加 `WRITE_DELAY=0`（提交即落盘，桌面写入频率低代价可忽略）。
  2. 修复后全量重跑：81/83，2 处失败为 `figure-tools`（Chromium worker 崩溃 0xC0000409，环境性）与 `motion` 首页入场 opacity `0.999996`（4e-6 时序差）；定向重跑 `figure-tools+motion` 9/9 全绿。
  3. 第三次全量：vite 开发服务器（5178）运行中死亡 → 72 处 `ERR_CONNECTION_REFUSED`；前后无代码变化，属机器负载下环境故障；直接复跑全量即全绿。
- 与任务书的偏差（两条，均已写入代码注释与 H2-PROBE.md）：H2 迁移目录用与 `db/migration/` 平级的 `db/migration-h2/`（任务书写 `db/migration/h2/`）——Flyway 11 `classpath:` 递归扫描会与默认 MySQL profile 冲突报 `Found more than one migration with version 1`；未添加 `flyway-database-h2` 依赖——flyway-core 11.7.2 自带 H2 支持且 Boot 3.5.7 BOM 不管理该 artifact。
- `docs/desktop/DB-AUDIT-glm-5.3.md` 按任务 14-0 规则保持不入库。

## 2026-10-24 · 任务 13 总验收：v0.1.0

- `npm test -- --maxWorkers=4`：**52 files / 280 passed / 0 failed**；`npm run build`：通过（19.17s，保留既有 >500kB chunk 提示）。
- `./scripts/test-agent.ps1 -All -FixturePort 18770`：**83 passed / 0 failed / 0 skipped（5.2 分钟）**，`audit-restart` 通过（已完成审计跨 JVM 不变、中断运行恢复、夹具清理）；teardown 清理 92 个测试项目。首次运行 81 passed / 2 failed，处理见下，修复后复跑一次全绿。
- `node scripts/test-site.cjs`：4/4 宽度（390/768/1280/1440）无溢出、无 `href="#"`、无坏图、无页面错误；外部请求只有 Google Fonts，请求失败 0、付费请求 0。
- 首次全量 E2E 的 2 处失败均为断言/基线随品牌改名变化，不是产品缺陷：
  1. `frontend/e2e/design-tokens.spec.ts` 断言的 `.brand .labflow-mark` 已被 13-1 的 `.brand .brand-mark img` 取代 → 选择器改为图片节点，仍断言宽度 29。
  2. `frontend/e2e/cleanup-visual.spec.ts` 的布局基线与新字标不符（`.workspace-nav.x` 158.0625 → 146.484375）。用 `LABFLOW_POLISH_UPDATE_BASELINE=1` 重新生成，逐字段 diff 只有 `.workspace-nav` 的 x 一个值变化，其他页面与元素均未变，符合「字标从 LabFlow 换成 FigTide 后宽度变化」的预期。
- 截图（`docs/screenshots/`）：`release-0.1-home.png`、`release-0.1-editor.png`、`release-0.1-editor-header.png`、`release-0.1-intro-1440.png`、`release-0.1-intro-390.png`、`release-0.1-site-{390,768,1280,1440}.png`、`release-0.1-favicon.png`；静态站证据 `docs/test-evidence/release-0.1-site.json`。
- favicon：无头浏览器无法截取浏览器标签栏，`release-0.1-favicon.png` 是浏览器实际请求到的 `site/favicon.svg` 渲染结果；`release-brand.spec.ts` 另行断言 `/favicon.svg`、`/favicon.ico`、`/apple-touch-icon.png` 均 200，且 SVG 含图标路径。
- 截图复核方式：当前执行模型不支持图像输入，modlens 视觉桥的 claude-cli 提供方不可用（登录/额度），因此未做逐张目视；改以 Playwright 的可见性/溢出断言、E2E 文字断言和逐张像素边界检查（右/下边缘仅 1–3 种颜色，无内容被裁切）复核。人工目视可直接打开上述 PNG。
- `grep -rn "LabFlow" frontend/src frontend/index.html site README.md`：仅 2 处，均为内部协议头 `X-LabFlow-Connection`（`frontend/src/components/ModelConnectionDialog.tsx:74` 及其测试），归为「内部标识」，用户不可见；`site/`、`README.md` 为 0。
- `v0.1.0` 标签在本段提交后打。

## 2026-10-24 · 任务 13-4：版本与发布准备

- 版本：`frontend/package.json` 为 `0.1.0`（补 `"license": "MIT"`），后端 `pom.xml` 已是 `0.1.0`（非 SNAPSHOT，未改后端代码）。`vite.config.ts` 用 `define: { __APP_VERSION__: JSON.stringify(version) }` 从 `package.json` 注入，`src/version.d.ts` 声明；关于弹窗显示「版本 0.1.0」并链到 MIT LICENSE，新增 `AboutDialog.test.tsx`。
- `CHANGELOG.md` 新建：`## 0.1.0 — 2026-10-24`，按「数据与版本 / 科研绘图 / 绘图助手 / 界面」分组，只写已实现功能，并注明桌面版未完成、模型调用可能计费。
- 脚本：把验收实际用到的入口整理进 `scripts/`（`test-refactor09.ps1`、`test-refactor01c.ps1`、`test-refactor03-stable.ps1`、`serve-test-build.cjs`、`compare-refactor09.cjs`），全部复用 `test-agent.ps1`；`test-agent.ps1` 新增 `-Production`（构建产物 + 受控静态服务），`.runtime/` 仍被忽略。README「测试」一节写明用法。
- MySQL 客户端改为三级查找：`-MySqlBin` → `LABFLOW_MYSQL_BIN` → `PATH` 的 `mysql.exe` → 默认安装目录；都找不到时中文报错并说明三种指定方式。README 同步。
- 修复 13-2 遗留：`frontend/e2e/release-brand.spec.ts` 曾 `import { version } from "../package.json"`，Playwright 按 ESM 加载时报 `needs an import attribute of type: "json"`，`--list` 只剩 0 条。改为 `readFileSync(new URL("../package.json", import.meta.url), "utf8")`（不依赖 cwd），`npx playwright test --list` 恢复 **83 tests / 37 files**。
- `npm test -- --maxWorkers=4`：**52 files / 280 passed / 0 failed**；`npm run build`：通过（17.45s，保留既有 >500kB chunk 提示）。
- 本节未跑全量 E2E 与静态站，按任务安排在总验收执行；`v0.1.0` 标签待总验收通过后再打。

## 2026-10-24 · 任务 13-3：README、媒体与 MIT

- README 按任务结构重写：FigTide 图汐 / social preview / 两张 GIF / 已实现功能 / 隐私 / 真实 Windows 启动步骤 / 技术栈 / 测试 / 结构 / 许可证。三段隐私说明与 `lib/privacy.ts` 逐字一致；补充备份下载位置、静态站字体和本地模式边界；明确桌面版正在开发，当前无安装包。
- 用户已明确选择 MIT，因此按用户指示新增根目录 LICENSE（2026 chen0206a），替代任务包中“未选择时不要添加”的兜底规则。CONTRIBUTING 同步 MIT 与隔离 E2E 清理说明。LANDING-SITE 只在顶部追加新状态，保留下方旧记录。
- 包内媒体直接入库：1280×640 social-preview.png，960×540 助手 GIF（165 帧）和绘图 GIF（135 帧）。两张 GIF 下均标注示意数据；无 MP4 入库。已目视检查社交预览图。
- README 校验：8 个本地链接/媒体均存在，3 段隐私精确匹配，桌面版边界和 MIT 文件检查通过。
- `npm test -- --maxWorkers=4`：51 files / 279 passed / 0 failed；`npm run build`：通过（已有 chunk 提示）。`node scripts/test-site.cjs`：4/4 宽度通过，0 字体请求失败。
- 本节只改文档与媒体，未重跑浏览器工作区 E2E；13-2 的 9 条及最终全量验证另列，不冒充本节测试。无断言改动。

## 2026-10-24 · 任务 13-2：文案与公开展示页

- 盘点见 `docs/BRAND-RENAME.md`：用户可见品牌、内部协议、历史记录逐处分类。界面/无障碍名称/动态标题/隐私声明/脚本提示改为 FigTide；请求头、存储键、环境变量、API 和历史记录保留。下载显示名改为 figtide，备份 `.labflow.zip` 扩展名及结构不变。
- 展示页换新图标与字标；仓库链接统一 `https://github.com/chen0206a/figtide`，补 og:image / twitter:card。已在线确认该仓库存在，当前为空；README 与 raw 媒体地址在所有者推送 main 后生效。本地未推送。
- `npm test -- --maxWorkers=4`：51 files / 279 passed / 0 failed；`npm run build`：通过（已有 chunk 提示）。
- `./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('intro.spec.ts','productize.spec.ts','release-brand.spec.ts')`：9 passed / 0 failed / 0 skipped；重启审计检查通过。新增 release-brand 两例，覆盖品牌、标题、真实图表保持不变、旧存储键、关于入口、1440/390 布局与 favicon/apple 图标实际响应，原用例未删除。
- `node scripts/test-site.cjs`：4/4 宽度通过（390/768/1280/1440），无溢出、坏图、空链接或页面错误；仅静态站 Google Fonts 请求，0 请求失败。
- 等价断言更新：productize.spec 离线提示品牌；test-site 的仓库/README 目标；新增标题/品牌/社交元信息断言。13-1 的 intro 关于弹窗路径检查保留。逐条记录见改名盘点。
- 静态站测试原先写旧任务截图，现默认写 `.runtime/site-acceptance/`，仅 LABFLOW_CAPTURE=1 复制到 release-0.1 新名称；未回写历史截图或基线。全量 E2E 留总验收。

## 2026-10-24 · 任务 13-1：图标与品牌组件

- 分支：从 `refactor/frontend` 的 `f13b69c` 创建 `release/v0.1.0`。任务包品牌源资产与任务说明入库，媒体文件留到 13-3。
- 新增 `BrandMark`，24px 及以下使用 small，较大使用主图标，light 使用 reverse；英文 Fig 800 / Tide 400，中文可选；图标 alt 为空，组件 aria-label 为 FigTide。统一顶栏、介绍页导航/页脚、编辑器状态栏、离线页与关于弹窗，删除旧 LF 图标。首屏标题与动效保留。
- `npm test -- --maxWorkers=4`：51 files / 279 passed / 0 failed。新增两条图标资源/尺寸/反白/无障碍单测。首次新测试误按文件名断言 Vite 内联 SVG URL，修正为对实际导入资源做等值断言后全绿。
- `npm run build`：通过；保留已有大于 500kB chunk 提示。
- `./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('intro.spec.ts','home.spec.ts')`：7 passed / 0 failed / 0 skipped（文件名匹配同时包含 product-intro.spec.ts）；真实隔离 Java/MySQL + 本机夹具，重启审计检查通过。
- 等价调整断言：intro.spec 首页“关于 LabFlow”链接改为“关于 FigTide”按钮，先断言关于弹窗可见，再通过弹窗“产品介绍”链接进入介绍页；原先进入介绍页断言保留。
- 本节未执行全量 E2E、静态站验收；按计划在 13-2 和总验收执行。后端/API/schema/草稿键未改。

## 2026-10-24 · 11-8 总验收：任务 11 总验收通过

- 从 7ba209e 继续，分两次提交完成派生数据选中竞态修复和首页细节。最终命令 **`./scripts/test-agent.ps1 -All -FixturePort 18770`**，workers=1，隔离 Java 8087 / Vite 5178 / 本地模型夹具 18770 / MySQL labflow_e2e，未开启 LABFLOW_CAPTURE。
- **81 条 / 36 文件：passed 81 / failed 0 / skipped 0 / flaky 0，耗时 240.937s（约 4.0 分钟）。任务 11 总验收通过。** processing.spec.ts 三条、isolation.spec.ts 五条、新隐私流程、空首页 1440/390、窄屏实验/项目表检查全部通过。本轮不新增或删除 E2E，用例数仍 81；仅增强首页相关断言，processing.spec.ts 零 diff。
- 完整 JSON 为 `docs/test-evidence/refactor11-8-acceptance.json`，整轮原始日志 `refactor11-8-full-run.txt`。浏览器结束后的独立新 JVM 审计持久化、未完成运行恢复校验均通过；teardown 清理本轮 91 个测试项目，没有操作用户的日常数据库。
- 最终前端验证：`npm test -- --maxWorkers=4` **50 文件 / 277 passed**；`npm run build` 通过（14.76s，既有 >500kB chunk 告警）。新增一条组件回归，在列表刷新挂起期间与完成后均保留派生数据选择，修前红、修后绿。
- 五个指定历史提交的原样 processing 单跑均 3/3；因此**首个失败提交未从这五次单跑中确定**，不虚构二分结论。两端（92a0c1b、7ba209e）的受控延迟组件回归均红，结合旧 trace 确认基线已有竞态。详细根因、代码行号和证据见下方提交 1。
- 截图已经 reducedMotion=reduce 重拍并逐张检查：`docs/product-audit/after/11-8-empty-home-1440.png`、`11-8-empty-home-390.png`、`11-8-home-with-project-390.png`；另留示例编辑器/有示例项目首页。布局基线、后端、API 与 schema v1 均未改动。
- 未执行：真实/收费模型、Java 单元/集成测试、Firefox/Safari、桌面安装包；本轮全部模型流量为本地协议夹具，桌面打包仍是后续工作。没有继续下一个任务或推送远端。

## 2026-10-24 · 11-8 / 提交 2：首页细节

- 空首页不再挂载 AssistantCard，避免没有数据和图表时出现无效的助手入口；已有项目的助手入口、提案与同意流程保持原样。示例标题字重 700。
- SampleThumbnail 的图例移到绘图区右上角；上方预留空白，仍从同一份 CSV 绘制均值与实际 SEM。X 轴补 0/2/4/6/8/10/11 整数刻度，epoch 标题单独置底，图例不与数据、轴标题混排。只改缩略图坐标布局，不改任何保存图表配置或实验数据。
- 最近实验保留卡片内 overflow-x:auto 容器，并增加可聚焦的“最近实验表格”区域；卡片标题可折行，全部实验按钮不收缩、不换行，避免窄屏被项目名挤压。390px 下同时验证实验/项目两张表可独立滚动、卡片在屏内、文档 scrollWidth=390。
- 断言调整逐项：HomePage.test 补空首页无绘图助手、三模型图例与七个 X 刻度；sample-project.spec 补 1440/390 两种宽度下的助手隐藏、标题字重、图例在图内右上、与 X 轴标题不重叠、刻度文字；home-workspace.spec 保留原项目表所有断言并补最近实验滚动与“全部实验” nowrap。没有修改 processing.spec.ts、删除原断言或更新布局基线，E2E 数量仍为 81。
- `npm test -- --maxWorkers=4`：**50 文件 / 277 passed**；`npm run build`：通过（14.76s，既有 chunk 告警）。首次重拍专项 3 passed / 1 failed，原因是新增几何检查的 `.home-sample svg` 同时命中图标、箭头、缩略图三个 SVG；改为按缩略图的准确 img 可访问名称定位，所有几何断言保留。
- 最终重拍命令：`$env:LABFLOW_CAPTURE='1'; ./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('sample-project.spec.ts','home-workspace.spec.ts'); Remove-Item Env:LABFLOW_CAPTURE`：**2 passed / 0 failed / 0 skipped（8.8s）**，新 JVM 审计恢复校验通过。此前 home.spec.ts 两条也已通过；初轮失败未粉饰为全绿。
- reducedMotion=reduce、等待字体与最终布局、滚回页顶后重拍。用户指定截图为 `docs/product-audit/after/11-8-empty-home-1440.png`、`11-8-empty-home-390.png`、`11-8-home-with-project-390.png`，逐张目视确认完整可见；另保留 11-8-sample-editor/home。11-7 的历史截图保持不动，初轮额外覆盖的通用 home.png 已恢复为原提交内容。
- 全量命令 `./scripts/test-agent.ps1 -All -FixturePort 18770` 的结果单列，不用专项替代；未执行真实模型、跨浏览器、Java 单元/集成测试和桌面打包。本轮不改后端、API、schema v1、助手预算/恢复逻辑。

## 2026-10-24 · 11-8 / 提交 1：派生数据保存后的选中状态

- 在独立 checkout（物理依赖副本、独立构建输出）依次执行用户指定的 `./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('processing.spec.ts')`，每轮完整退出后才切下一个提交，后端 8087 / 前端 5178 / 夹具 18770 / labflow_e2e。原 spec 及其断言没有修改。

| 提交 | passed | failed | skipped | 耗时 | 新 JVM 审计恢复 |
| --- | ---: | ---: | ---: | --- | --- |
| 92a0c1b | 3 | 0 | 0 | 21.4s | 通过 |
| 6f45961 | 3 | 0 | 0 | 11.5s | 通过 |
| 419a087 | 3 | 0 | 0 | 17.5s | 通过 |
| 605d4f8 | 3 | 0 | 0 | 16.6s | 通过 |
| 7ba209e | 3 | 0 | 0 | 17.3s | 通过 |

- **版本对照没有得到“第一个失败提交”**：五次单跑均通过，不能将该时序问题归因于 6f45961 或另一个提交。逐轮原始 JSON / 日志见 docs/test-evidence/refactor11-8-history/{sha}/，汇总 refactor11-8-bisect.json。最初共享 node_modules 的环境调试出现字体文件被 Vite allow-list 拒绝，已改用物理依赖副本重新做完五次；该次不混入此表。
- 旧失败 trace 的事实：GET 项目 732 列表仅 [673]；POST /data/673/process 于 03:36:06.707Z 返回派生版本 **674 / data_processing / 3 行**；03:36:06.725Z 的列表 GET 返回 [674,673]，但失败页面仍为 ?dataset=673，没有来源按钮。这不是数据没保存，也不是缺少 source_meta。
- 根因：**App.tsx:530–543 的 onProcessed** 在只更新详情缓存后立即 setDataset，再刷新版本列表；**DataPage.tsx:51–59** 用列表验证 selected 归属，刷新尚未完成时看不到新版本，退回源版本并调用 onSelect，覆写刚刚设置的路由。列表随后返回也不会恢复之前的选择。上传走 imported（已 await refresh），派生保存走 onProcessed，并不调用 imported；因此不能把上传回调等待刷新当成根因。
- 代码对照：DataPage 的这段守卫在 92a0c1b→7ba209e 没有改动；git blame 指向更早的 fceb652，onProcessed 原顺序更早来自 bc2fcc6。为确认竞态，在 **92a0c1b 与 7ba209e** 上分别运行同一新增组件回归（挂起 datasets 刷新、使用真实 App/DataPage），都稳定报找不到“数据处理来源”；红日志保存在各 sha 的 controlled-refresh.txt。它证明基线已存在该条件，不能等同于完整历史首次引入提交的二分证明。
- 修复仅在 App：用接口已确认保存的 d 同步更新当前项目 datasets 列表，再选择 d.id，然后正常失效刷新计数/列表。不是伪造乐观数据，也没有删除/放宽 DataPage 的跨项目归属守卫。新增 App.processing-selection.test.tsx 保证刷新挂起及返回后均保持派生版本、来源按钮可见、源数据不变。修前红 / 修后绿日志见 history/regression-{before,after}.txt。
- `npm test -- --maxWorkers=4`：**50 文件 / 277 passed**；`npm run build`：通过（14.89s，既有 chunk 告警）；修后 `./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('processing.spec.ts','isolation.spec.ts')`：**8 passed / 0 failed / 0 skipped（25.3s）**，新 JVM 审计恢复通过；processing.spec.ts 零 diff。
- 偏差：指定五个历史单跑未复现失败，明确报告“首个失败提交未确定”，改以旧 trace + 两端受控回归证明根因；不虚构首个坏提交。未执行：真实模型、Java 单测、跨浏览器；用户工作区未改。

## 2026-10-24 · 11-7 总验收：未通过，按约定停止

- 命令 `./scripts/test-agent.ps1 -All -FixturePort 18770`，隔离 Java 8087 / Vite 5178 / 本地模型协议夹具 18770 / MySQL labflow_e2e，workers=1，未设置 LABFLOW_CAPTURE。**固定 81 条 / 36 文件；passed 80 / failed 1 / skipped 0 / flaky 0**，总耗时见 JSON stats（约 5.6 分钟）。原来的 80 条完整保留，唯一新增是 privacy.spec.ts 的完整流程外部网络断言。
- 上轮两处失败 `isolation.spec.ts` 上传目标和实验页双向切换，在本轮全量中均通过；该文件 5/5。新隐私 E2E、空首页与示例项目、390px 项目表及离线页均通过。
- 本轮唯一失败：`processing.spec.ts:238` 的“explicit filter and numeric stable sort save as an independent dataset”，失败断言在 **294 行**。错误原文：`Error: expect(locator).toBeVisible() failed`；`Locator: getByRole('button', { name: '数据处理来源', exact: true })`；`Expected: visible`；`Timeout: 5000ms`；`Error: element(s) not found`。
- 此例对 POST /process 返回三行稳定排序结果的断言已通过，失败发生在其后的来源按钮可见性断言；更后的原始文件字节断言因本例提前失败未执行。根因尚未确认，不将其归为机器/杀软或截图抖动。遵照用户要求，没有在总验收之后修补、重跑、放宽断言或刷新基线。
- JSON 原始报告：`docs/test-evidence/refactor11-7-acceptance.json`。错误原文、页面快照、失败截图、完整 trace、整轮日志分别为 `docs/test-evidence/refactor11-7-failures/processing.error.txt`、`processing.error-context.md`、`processing.png`、`processing.trace.zip`、`full-run.txt`。
- 全量脚本因浏览器失败退出，本轮后续独立 JVM 的审计恢复校验**未执行**；此前本轮 16 条专项及 5 条重拍脚本中的 JVM 校验均通过，不能当作本次全量执行。测试新建项目已由 teardown 清理；没有修改用户工作区。
- 最终 `npm test -- --maxWorkers=4`：**49 文件 / 276 passed**；`npm run build`：通过（19.97s，既有 chunk 告警）。与 92a0c1b 比较 backend 和 refactor09-layout-baseline.json 均无差异。4 个提交分别保存诊断修复、示例、窄屏、隐私与验收证据；当前以“修改已提交、总验收未通过”交付，等待后续指示。
- 未执行：失败后重跑、真实收费模型、Java 单元/集成测试、Firefox/Safari、桌面打包。后续桌面程序是已确认的产品方向，本轮没有宣称已实现双击运行。

## 2026-10-24 · 11-7 / 提交 4：数据与隐私说明

- 先于隐私文案修改，用新增 privacy.spec.ts 真实走完首次介绍页 → 首页 → 新建项目 → 上传 CSV → 确认解析 → 编辑 → MySQL 保存 → SVG/PNG 导出；未使用助手。修改前记录 211 条请求（含本地 WS / blob URL），**非 127.0.0.1 / localhost 的 HTTP(S)/WS(S) 请求：无，列表 []**。应用 main.tsx 已从 @fontsource-variable/inter 与 jetbrains-mono 导入字体，未发现 Google Fonts 等运行时外链，无需再替换字体。
- 修改后 LABFLOW_CAPTURE=1 重拍并重走同一流程，记录 **209 条请求，external=[]**，完整 URL / 方法清单为 `docs/test-evidence/refactor11-7-network.json`。新 E2E 对外部请求列表为空、助手运行 POST 为空以及 SVG 内容 / PNG 文件大小做断言；原 80 条全部保留，清单增加到 81 条。统计只是这条浏览器流程的观测，不将其扩大为安装依赖或主动访问外链时也绝不联网的承诺。site/index.html 按要求保留 Google Fonts，README 明示它是独立展示页。
- 只读核对 Java：AgentRunService.profile（589–598 行）删除 head、filename 和每字段 samples；WorkspaceService.profile（274–317 行）仍保留字段 name/type/role/suggested_role/missing/unique/constant/min/max，以及 dataset/version 标识、sha256、row_count、truncated。execute（633–659 行及工具返回分支）发送图表配置、用户描述、会话上下文；get_dataset_profile 使用上述过滤结果，lint 的 report 在模型返回前删除。本轮未修改任何 Java、API、预算/恢复逻辑，也未调用真实模型。
- 介绍页、首页“数据保存在本机”说明框使用 lib/privacy.ts 同一份文案；site 与 README 同步三段说明（逐段比对 3/3）。补充字段角色/唯一值、行数/版本/内容指纹和用户主动写入标题/注释/对话的传输边界，避免将“原始行不附带”误解成用户自己输入的内容也会过滤。模型连通性测试是用户单独同意的两条固定消息；备份保存在用户选择的下载位置。
- 按实际本地架构校准两处措辞：“任何服务器”改“任何外部服务器”（上传要交给本机 Java）；“我们没有服务器”明确为“没有用于接收这些数据的云端服务器”。助手勾选文案按用户给定原句更新。选图助手勾选文案另明确字段摘要、版本元信息、描述与可能计费，不声称推荐阶段必发图表配置。README 记录未来双击启动桌面程序、本机保存数据的方向；当前仍是脚本启动，未冒充已提供安装包。
- 断言变化逐项：AgentAssistant.test 的勾选操作改按完整 agentConsent 查找；agent.spec.ts 的画布同意框改按完整新文案查找；ChartPlanner.test.tsx 三处及 chart-planner.spec.ts 一处从 /同意将字段名/ 改为 /同意将字段摘要/；ProductIntro 单测补三段正文与“数据在哪里”；HomePage 新增说明框开关测试；privacy E2E 检查介绍页、页脚弹窗、导入新文案与真实网络。没有删掉已有安全或绘图断言。
- `npm test -- --maxWorkers=4`：**49 文件 / 276 passed**；`npm run build`：通过（19.97s；既有 >500kB chunk 告警）。`./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('privacy.spec.ts','intro.spec.ts','agent.spec.ts','chart-planner.spec.ts')`：**16 passed / 0 failed / 0 skipped**（1.0m，intro 的文件名筛选也匹配 product-intro.spec.ts）；新 JVM 审计恢复通过。
- 重拍命令：`$env:LABFLOW_CAPTURE='1'; ./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('sample-project.spec.ts','home-workspace.spec.ts','productize.spec.ts','privacy.spec.ts'); Remove-Item Env:LABFLOW_CAPTURE`。**5 passed / 0 failed / 0 skipped（21.8s）**，新 JVM 审计恢复通过，reducedMotion=reduce；所有输出先写 testInfo.outputPath，再额外复制到 docs。重拍时修正截图前滚回顶部（避免粘性导航出现在长截图中段），空首页示例卡占满整行；新增等宽断言，未改一般首页布局或验收基线。
- 截图 `docs/product-audit/after/11-7-{empty-home-1440,empty-home-390,sample-editor,project-table-390,offline-390}.png` 已逐张目视检查，标题、按钮、三条真实 SEM 带完整可见；另保留 home-390 / sample-home。SVG / PNG 导出样本为 docs/exports/privacy-check.*。
- 未执行：真实/收费模型、Firefox/Safari、桌面打包、Java 单元/集成测试（本轮无后端改动，隔离脚本只执行 Maven package -DskipTests）。全量验收结果单列，不用上述专项替代。

## 2026-10-24 · 11-7 / 提交 3：390px 与离线页

- 项目表明确保留 420px 的表格最小宽度，由卡片内 width/max-width:100% 的 overflow-x:auto 容器滚动；搜索框占满卡片内容区，输入框可收缩。390px 实测文档 scrollWidth=390，卡片在屏内，表格可水平滚动且搜索框在卡片内。
- 离线页左右 padding=16px，隐藏顶栏当前项目下拉框；保留重连按钮与原有中文错误说明。home-workspace.spec 原用例中追加窄屏断言和截图；productize.spec 原离线用例中追加下拉框不存在、16px 边距断言，未减少测试。
- `npm test -- --maxWorkers=4`：49 文件 / 275 passed；`npm run build`：通过（23.17s）。`./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('home-workspace.spec.ts','productize.spec.ts')`：3 passed / 0 failed / 0 skipped（8.7s）。完整截图在提交 4 后用 LABFLOW_CAPTURE=1 集中重拍。
- 调试运行未算通过：首次启动这轮时，上轮脚本仍在 JVM 重启检查后的清理阶段，两轮端口清理交叠，导致本轮 Vite 5178 退出，3 条报 ECONNRESET/ECONNREFUSED。等待上轮脚本完全退出后串行运行通过，没有改用例断言、重试次数或基线。原日志 .runtime/task11-7-3-e2e.log，最终 .runtime/task11-7-3-e2e-final.log。
- 偏差：没有。未执行：跨浏览器、真实模型。

## 2026-10-24 · 11-7 / 提交 2：示例项目与空首页

- 示例处理规则仍为 model / epoch 分组、seed 独立重复、mean ± SEM；图表显式保留 accuracy__sem 映射，使用实际 lower / upper 列画三条区间带，透明度 0.35。标题为 Grouped means ± SEM。仅内置合成 CSV 使用确定性种子偏移以展示可见的重复观测差异，不改任何用户数据，不直接编造误差列；CSV 数值和实验指标统一三位小数精度。
- 原“告警 1”来自 DataProcessor 的统计解释：样本 SD 使用 n−1，SEM=SD/√n，依赖独立观测假设、不是置信区间。保留它。删除 bands.ts 的“启用区间带时不同时画误差棒”冗余状态通知（专业面板已有同一说明）；真正的缺失、反向界限和不递增 X 告警保留。
- 空首页示例卡内放主按钮“载入示例项目”和次按钮“创建研究项目”，右侧静态 SVG 由同一份 CSV 计算并标记“示意”；隐藏快速开始、最近图表、最近实验、研究项目。home.spec 原四个空页入口的循环断言等价改为新建按钮键盘操作、示例入口、缩略图和四块隐藏断言；HomePage 单测保留示例回调并补创建回调。
- `npm test -- --maxWorkers=4`：49 文件 / 275 passed；`npm run build` 通过（19.30s；既有 chunk 告警）。隔离命令 `./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('sample-project.spec.ts','home.spec.ts','evaluation.spec.ts','privacy.spec.ts')`：6 passed / 0 failed / 0 skipped（29.4s）；其中 privacy 是提交 4 的预先取证用例，尚未修改隐私文案。
- 浏览器验证保存后的 SEM 字段、每一行 mean±SEM 上下界、三条闭合 SVG 区间带与可见填充。截图目视检查可见半透明带。没有刷新布局基线或删旧断言。
- 调试记录：新增断言首次误取 config.title（实际是 config.style.title），随后比较区间首尾方向写反（实际先上界后下界），均纠正测试访问方式；CSV 精度测试适配 Windows CRLF 的 trim。另一次 ROC 专项在等待 PR 按钮时超时；该轮同时发生源码 HMR，未改其测试/断言，冻结源码后重跑通过。原始日志在 .runtime/task11-7-2-*，不计作全量验收。
- 未执行：收费模型、跨浏览器；偏差：仅重建内置合成示例的种子差异，以便示范真实 SEM；统计规则未变。

# LabFlow 测试与验收记录

## 2026-10-24 · 11-7 / 提交 1：先诊断两项隔离失败

- 实验失败原文首个命中为表格行 `EXP-117 实验隔离 B 526`，不是 select/面包屑。`App.tsx` 的 Experiments key={project}、查询 [experiments,project] 已正确；根因为顶栏 onChange 的 useNavigate 默认并发 transition，缓存 B→A 时切换事件已结束但旧 B 表格仍有一帧可见。`App.project-switch.test.tsx` 在 change 冒泡结束时读取真实表格，修前红（命中 Experiment 2）、修后绿；`App.tsx` 顶栏项目切换以 flushSync:true 原子提交路由，未改助手/保存/草稿保护，也未扩大或缩小采样范围。
- 上传旧 trace：B=524，POST /projects/524/datasets 于 15:42:08.405Z 开始，耗时约 35ms；旧测试 GET 于 08.425Z 返回 []，上传后 08.443Z 的 GET 已返回 1 个版本。提交落 B，不是落 A/丢失。原失败用例把导入预览文件名可见当成上传完成，11-1 时可能刚好 POST 更快；de8b840 只在编辑器离线保存失败分支执行，与此数据页导入无关，工作区记忆也不改变 POST 的 project 参数。
- 现场重建：E2E 可控地挂起 B 的 POST，在请求未完成时查询 A/B，再释放并等待真实响应、弹窗关闭与列表刷新，最后再查 A/B。提交前 A=1/B=0，提交后 A=1/B=1；A 保留原文件，B 文件名正确。记录 `docs/test-evidence/refactor11-7-upload-diagnosis.json`。原现场已由 11-6 teardown 清理，不伪称重新查询了原来的 523/524。
- `App.imported` 等待项目计数、datasets/charts 查询失效并刷新后才关闭弹窗；UploadDialog 等待该回调。测试等待 POST 与弹窗消失，文件名断言从歧义 getByText 改为真实数据标题（完成后标题与侧栏均同名），计数/归属原断言全部保留。
- 验证：`npm test -- --maxWorkers=4` 49 文件 / 275 通过；build 通过（25.32s）；`./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('isolation.spec.ts')` **5 passed / 0 failed / 0 skipped**（21.2s），新 JVM 审计恢复也通过。首次专项暴露同名标题/侧栏的 strict locator 歧义，修正为 heading 后重新通过，未删断言。日志 `.runtime/task11-7-1-*`。

## 2026-10-24 · 日常工作区历史验收记录整理

- 用户指出首页仍展示「第一批验收」「草稿恢复验收」等记录。核查为早期 E2E 已写入日常库的项目/图表内容，不是本轮界面静态文案。11-6 仅隔离本轮新测试，未处理这些历史残留；此处补记并处理。
- 真实工作区（8086）116 个项目原均未归档。按验收名称、时间戳及合成/测试描述交叉确认 110 个历史自动验收项目，通过已有 `PUT /projects/{id}` 仅设置 archived=true；六个演示项目 5/95/108/134/167/194 保留，未知项目不批量处理。
- 没有 DELETE、改名、覆盖原文件或修改图表配置。API 前后项目总数仍 116；experiment_count 汇总 13、dataset_count 汇总 181、chart_count 汇总 192，均不变；未归档项目由 116 降为 6。可从「管理项目」恢复归档项目。
- 操作清单和归档前完整项目元数据保存在本机忽略目录 `.runtime/historical-project-archive.json`、`.runtime/historical-projects-before.json`，便于追溯恢复。未将工作区内容提交为源代码。
- 浏览器已进入真实工作区并确认「研究项目 · 6」，当前示例为「视觉模型泛化研究 · 合成演示」。截图 `.runtime/home-after-historical-archive.png`。
- 无产品代码改动，未重复运行单测/build/E2E；验证为真实 API 前后计数与浏览器显示。此前 11-6 全量 78/80 的失败状态不变，未在此轮继续修复或重跑。

## 2026-10-24 · 11-6 总验收：未通过，按要求停止

- 固定清单 **80 条 / 35 文件**，`workers=1`，未设置 LABFLOW_CAPTURE；命令 `./scripts/test-agent.ps1 -All -FixturePort 18770`。隔离后端 8087、前端 5178、协议夹具 18770，数据库 labflow_e2e。
- **passed 78 / failed 2 / skipped 0 / flaky 0**，耗时 271.076s（约 4.5 分钟）。JSON 报告 `docs/test-evidence/refactor11-acceptance.json`。
- 失败一：`isolation.spec.ts:106` 上传目标项目计数。原文：`Error: expect(received).toBe(expected) // Object.is equality`、`Expected: 1`、`Received: 0`。原始错误 `docs/test-evidence/refactor11-failures/import-target.error.txt`；trace `import-target.trace.zip`（同目录）。
- 失败二：`isolation.spec.ts:139` 的新增实验隔离步骤。原文：`Error: expect(received).not.toContain(expected) // indexOf`、`Expected substring: not "实验隔离 B 526"`，采样内容命中该名称。完整原文及收到的页面内容 `docs/test-evidence/refactor11-failures/experiment-isolation.error.txt`；trace `experiment-isolation.trace.zip`。根因尚未确认，不能归为截图环境错误。
- 两项均保存错误现场截图、error-context、trace；整轮原始日志 `docs/test-evidence/refactor11-failures/full-run.txt`。前述专项通过不能替代本轮全量结果。没有再修代码、刷新基线、删除断言或重跑以消除失败；只整理证据并提交。
- 本轮未出现 UNKNOWN 文件写入错误，日常验收没有改动 docs/screenshots、docs/exports，refactor09 布局基线与 0843ffd 完全相同。测试新建项目已清理，原有测试项目保留；未修改用户工作区数据库。
- 总验收脚本因浏览器失败退出，本轮后续新 JVM 审计校验**未执行**；此前三次专项隔离脚本中的该校验均通过，已分别记录，不混作本轮执行。
- 最终单测 `npm test -- --maxWorkers=4`：**48 文件 / 274 通过**；`npm run build`：通过（11.50s）。仍有既有 >500kB chunk 告警。除上述失败外，Firefox/Safari、真实模型、真实 PDF 阅读器检查未执行，不属于本轮通过结论。

## 2026-10-24 · 11-6 / 提交 4：证据、R7 来源与审计记录

- 对照 `450e74c`：删除 FigureCanvas 中 `.paper-caption` 两端角标及对应 CSS，`fittedZoom` 按 paper-group 与 paper-wrap 的高度差扣除未缩放的附属区域，因此删除角标释放空间，只改变渲染缩放，未改保存的 760×500。
- 通过隔离浏览器控制变量验证：仅恢复该提交删除的静态角标与 CSS，点击「适合窗口」，paper-wrap 实测精确回到旧基线 `{x:338.609375,y:253.484375,width:706.796875,height:465}`；删除测试角标并再次适配，精确恢复 `{x:315.8125,y:222.890625,width:752.390625,height:495}`。证据 `docs/test-evidence/refactor11-caption-geometry.json`；旧/新基线均未刷新。
- `LABFLOW_CAPTURE=1`、`reducedMotion:'reduce'` 下重拍 after 目录全部 6 张截图；等待字体、真实绘图和透明度 1，1440/390 空首页验证无横向溢出；逐张打开确认正文、按钮、图表与侧栏完整可见。
- 截图/几何专项：`./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('cleanup-visual.spec.ts','sample-project.spec.ts')`：passed 2 / failed 0 / skipped 0（11.8s）。补拍首页/离线 390：`-Specs @('productize.spec.ts')`：passed 2 / failed 0 / skipped 0（7.5s）。两次新 JVM 审计恢复均通过。
- 如实保留调试记录：首次重拍中新增等待误选了不持有 aria-busy 的 `[data-testid=plot]`，1 passed / 1 failed，错误原文 `Expected: "false", Received: ""`；改为检查实际持有属性的 `.canvas-stage` 后重跑通过，未移除断言。原始日志 `.runtime/task11-6-4-capture.log`、trace `.runtime/task11-6-capture-first-trace.zip`；最终重拍日志 `.runtime/task11-6-4-capture-fixed.log`。
- 审计原表不动，第 7 节独立处理表逐行计数为 **33 已改 / 13 保留 / 1 不采纳 = 47**。B1 为保留（导入框说明恢复），D2 为不采纳（新数据集/新版本区分）。原汇总数字与原表逐行数量本就不一致，本次按行重新计数。
- 最终单测 `npm test -- --maxWorkers=4`：48 文件 / 274 通过；`npm run build`：通过（11.50s，既有 chunk 大小告警）。全量 E2E 78/80，失败情况见上方总验收，按约定停止。

## 2026-10-24 · 11-6 / 提交 3：E2E 产物隔离

- 所有 spec 的截图、下载导出、临时 PDF、生成的布局测量 JSON 改用公共 `artifactPath(test.info(), destination)`，实际路径由 `TestInfo.outputPath` 分配；文件内容、PDF 尺寸、SVG 标签等断言读取同一输出文件。只读配置样例与历史基线仍作为输入，不刷新基线、不删除断言。
- 自动 fixture 仅在 `LABFLOW_CAPTURE=1` 时将实际生成的文档产物额外复制到 docs；默认运行不写 docs/screenshots、docs/exports、docs/test-evidence。产品介绍测试使用仅捕获 fixture，保持首次访问行为。增加 Playwright JSON 结果，方便报告 passed / failed / skipped。
- 隔离脚本新增可选 `-Specs` 与 `-FixturePort`；已有 8089/18769 服务不动，本轮自建 8087/5178/18770，模型设置测试继续只允许对应本地协议夹具。
- `npm test -- --maxWorkers=4`：48 文件 / 274 通过；`npm run build`：通过（13.02s）；`npx playwright test --list`：80 条 / 35 文件。
- `./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('isolation.spec.ts', 'chart-corrections.spec.ts')`：**passed 8 / failed 0 / skipped 0**（29.1s），含新增实验隔离步骤、SEM/混淆矩阵/ROC 的 SVG/PDF 内容校验；新 JVM 审计恢复校验通过，测试项目清理完成，docs 无改动。日志 `.runtime/task11-6-3-e2e.log`。

拍验收图（仓库根目录 PowerShell，MySQL 需已运行；示例项目截图步骤在提交 4 补入）：

```powershell
$env:LABFLOW_CAPTURE = '1'
./scripts/test-agent.ps1 -FixturePort 18770 -Specs @('sample-project.spec.ts', 'cleanup-visual.spec.ts', 'productize.spec.ts')
$env:LABFLOW_CAPTURE = ''
# 日常全量验收不设 LABFLOW_CAPTURE，避免重复写文档图片。
./scripts/test-agent.ps1 -All -FixturePort 18770
```

## 2026-10-24 · 11-6 / 提交 2：R3 / R4 / R5

- 导入确认恢复「调整解析不会修改原文件」。处理来源删除源版本数据库 ID，保留真实 v{version}；describeFigure 只在元数据属于当前数据集且版本号有效时显示真实版本，否则省略。
- 全站检索生产源码 `#${` 和 JSX `#{`：另发现 SourceProvenance 的实验 ID 文案，改为真实修订 v{revision}；生产源码两种检索均为 0，关联字段/URL/API 不改。
- 实验隔离作为现有首页隔离测试内的独立 `test.step`：A/B 各建不同名称的实验，双向切换各 50ms × 20 采样。保留原首页所有断言；用例总清单仍为 80，不删用例。
- describeFigure 原数据库 ID 断言改为真实 v4，并断言不出现数据库 ID；新增元数据缺失/串项目时省略版本的单测。
- `npm test -- --maxWorkers=4`：48 文件 / 274 通过；`npm run build`：通过（10.32s）；之后仅额外移除上述实验 ID 文案，最终总验收再次覆盖。E2E 待产物目录迁移后统一实跑。

## 2026-10-24 · 11-6 / 提交 1：R1 草稿承诺

- `useChartSave` 的离线失败分支通过 `writeNow` 同步写入最新配置、名称、revision 与时间，再逐字读回比对；两者都成功才承诺本机草稿可恢复，失败则提示先不要关闭页面。请求等待期间新增的编辑也纳入当前草稿。
- `DraftWriter.has` 现在只检查持久化存储；生产代码已无调用方依赖 pending=true，无需新增 hasPending。写入失败后的 pending、重试和离开保护均保留。
- 修改原「pending 时 has 为 true」断言为 false：内存待写不能代表落盘；旧稿存在仍可 has=true，但保存承诺不再靠 has 判断。
- 新增 useChartSave 真实连线测试 5 条：无稿/旧稿遇配额错误、最新成功写入、读回不一致、等待期间继续编辑；配额失败后恢复存储验证 flush 仍能重试。
- `npm test -- --maxWorkers=4`：48 文件 / 273 通过；`npm run build`：通过（11.15s）。专项/全量 E2E 尚未执行，按本轮安排在产物迁移后统一验收。日志 `.runtime/task11-6-1-{unit,build}.log`。

## 2026-10-24 · Codex 对任务 11 的独立检查（非验收通过）

- 基准 `0843ffd`，检查开始工作区干净；本轮仅增加检查记录，不修改产品代码和历史基线。
- 独立运行 `npm test -- --maxWorkers=4`：**47 文件 / 268 通过**；`npm run build`：通过（16.82s，保留既有 chunk 大小告警）。`npx playwright test --list`：35 文件 / 80 条，仅枚举。
- 独立执行真实 `DraftWriter` 的存储失败探针：`writeNow=false`、持久化 `null`、`has=true`，证明保存失败提示存在将内存 pending 误判为本机已保存的路径。
- 本轮未运行 E2E、未调用真实模型、未修改用户数据库；不将 DS 的单项重跑或 `.last-run.json` 通过标记当成全量通过。
- 其余任务符合性、截图质量、基线变化和接续步骤见 `docs/TASK11-REVIEW-HANDOFF.md`，供 Claude 验收与后续修复。

## 2026-10-24 · 11 总验收

- 审计闭环：`docs/PRODUCT-AUDIT.md` 新增第 7 节，47 条逐条给出「已改 / 保留 / 不采纳」与提交号，统计 **34 已改 / 13 保留 / 0 不采纳**；第 5 节附注（切项目后数据页短暂显示上一个项目的数据）标注由 `fceb652` + `520b790` 修复，并保留 `frontend/e2e/isolation.spec.ts` 的 5 条回归。
- 首次使用：在隔离库把全部项目临时归档后重走「空首页 → 载入示例项目 → 编辑器」，截图 `docs/product-audit/after/11-5-empty-home-1440.png`、`11-5-empty-home-390.png`、`11-5-sample-editor.png`、`11-5-sample-home.png`；390px 下 `document.documentElement.scrollWidth` = 390（1440px 下 = 1440，无横向溢出）。归档状态与示例项目在脚本结束时已还原/清理。
- 界面文字 grep（`frontend/src` 的 ts/tsx/css，排除 *.test.*）：`Java 服务` 0、`图版` 0、`FIGURE ` 0、`127.0.0.1` 0、`CLEAN ACADEMIC` 0、`原始数据只读` 0、`工作区项目` 0、`模型连接` 0、`数据版本` 0、`图层` 0；`Failed to fetch` 仅剩 `frontend/src/lib/api.ts:26` 的注释 1 处，界面不再出现。
- 单测：`npx vitest run --maxWorkers=4` **47 文件 / 268 通过**；`npm run build` 通过。
- E2E（隔离栈：后端 8089 + 库 `labflow_e2e` + dev 5179，`LABFLOW_API`/`LABFLOW_WEB_URL` 指向该栈）：全量 `npx playwright test` 连跑三次分别 **74/79、71/78、71/80** 通过；失败项分两类——①Windows 上写 `docs/screenshots/*.png`、`docs/exports/*` 时随机出现 `UNKNOWN: unknown error, open/copyfile`（每次失败文件不同，机器空闲时单独重跑全部通过）；②一条动效/处理页时序断言在满载时偶发超时。所有失败 spec 均已单独重跑通过（`agent`、`assistant-layout`、`chart-corrections`、`cleanup-visual`、`delivery`、`editor-compat`、`experiments`、`isolation`、`motion`、`processing`、`refinements`、`styles-library`、`visual-polish`、`workflow`）。因此全量 E2E 未能在本机稳定一绿，原因记录在此，不当作通过。
- 验收中修正的断言/基线（只改文案或结构，未删断言）：`frontend/e2e/assistant-layout.spec.ts:75` 由「头部显示 endpoint」改为「显示模型名 + 头部不出现 endpoint」（地址已移入模型设置对话框）；`frontend/e2e/delivery.spec.ts:114` `复用目标数据版本` → `复用目标版本`；`frontend/e2e/refinements.spec.ts:140` `工作区项目` → `研究项目`；`docs/test-evidence/refactor09-layout-baseline.json` 因数据表脚注多一行而刷新（`.data-layout` 高度 574.9 → 578.0）；`frontend/src/components/UploadDialog.tsx` 删除与数据页重复的「原始文件完整保留…」半句。

## 2026-10-23 · 11-5 第一次使用体验

- 空首页：标题改为「{问候}，从一个研究项目开始。」，说明「项目里放数据、图表和实验记录。」；主按钮「创建研究项目」，次按钮「载入示例项目」（已有同名项目时为「打开示例项目」）；没有项目时不再显示「导入数据」入口与快捷导入块。
- 示例项目：新增 `frontend/src/lib/sampleProject.ts` 与 `frontend/src/assets/sample/示例-学习曲线.csv`（3 个模型 × 3 个种子 × 12 个 epoch，共 108 行；文件头注释行在导入前去掉，项目描述写明合成数据）。只用现有接口：`POST /projects` → 上传 CSV → 读回源数据集 → 3 条实验记录（参数与指标取自同一份 CSV）→ 按 `model,epoch` 汇总 `accuracy` 的 mean ± SEM（band）→ 用 `defaults()` 建一张折线图并打开编辑器。中途失败提示「示例项目创建到一半失败了，可以在管理项目中归档它」，不删除不重试；成功后首页出现「打开示例项目」。
- 实验页空状态删除「创建实验记录」按钮，说明改为「保存参数、指标和研究笔记，随时回来继续。点击右上角「记录实验」开始。」。
- 单测：`frontend/src/lib/sampleProject.test.ts`（5 条：步骤顺序与公开接口、实验指标来自 CSV、汇总规则与 band 配置、失败提示、示例文件行数）与 `frontend/src/components/home/HomePage.test.tsx` 新增 2 条（首屏两个入口、已有示例时不重复创建）。

### 改过的断言/选择器（只改文案或结构，未删除断言）

- `frontend/e2e/home.spec.ts:98`：空工作区循环里的 `^创建第一个项目` 改为 `^创建研究项目`（首屏主按钮改名）。
- `frontend/e2e/home.spec.ts:98`：移除「导入数据」块后，原 `^导入数据.*自动识别` 不再可点，改为显式断言 `getByRole("button",{name:/导入数据/})` 数量为 0（等价且更严格）。
- `frontend/src/components/home/HomePage.test.tsx`、`frontend/e2e/sample-project.spec.ts`：空首页标题断言改为匹配 `/从一个研究项目开始/`（标题带问候前缀）。

- 验证：`npm test` **47 文件 / 268 通过**；`npm run build` 通过；隔离栈（后端 8089 + `labflow_e2e` + dev 5179）`npx playwright test e2e/sample-project.spec.ts e2e/home.spec.ts` **3 passed (8.2s)**（含从空工作区点击到进入编辑器、图表渲染、3 条实验与 1 张图的接口核对、清理新建示例项目）。

## 2026-10-23 · 11-4 术语统一

- 先单独提交 `docs/GLOSSARY.md`（`5b8ff4c`），再按术语表全站替换。
- 替换统计（`frontend/src` 内 ts/tsx/css，替换前 → 替换后）：图版 2 → 0；FIGURE 1 → 0；图层 5 → 0；工作区项目 2 → 0；配置模型连接 1 → 0；模型连接 6 → 0；数据版本 22 → 1（仅 `frontend/src/welcome/introMarkup.ts` 的营销长文「实验记录、数据版本和科研绘图…」，指概念而非某个版本号，保留）。
- 版本统一写 `v1`：`ChartPlanner` 的「数据版本 v{version}」、`EditorStatusBar` 的「{文件} · 数据版本 v{version}」改为直接显示 `v{version}`；`AgentHistory`/`ReuseDialog`/`Comparison`/`ExperimentForm`/`Experiments`/`ExperimentsTable`/`ProcessingProvenance`/`FigureSourceStrip`/`FigureCanvas` 的「数据版本」标签改为「版本」；`DataPage` 侧栏标题由「数据版本 N」改为「数据集 N」（那里数的是数据集）；`UploadDialog` 追加时写「新版本」。
- 序列替代图层：`DataLayersPanel`「数据与序列」「序列」、`SeriesTab` 与 `controls` 的「序列操作」、`FigureCanvas`「N 个序列」。
- 图表替代图版/FIGURE/对象名的「图」：`ProfessionalPanel` 眉题「图表编排」、标题「从单张图表，到完整成稿。」；`ExportDialog`「单页图表」；`ProjectBackup`「N 张图表」；`ChartPlanner`「创建哪种图表」；`ReuseDialog`「适合这张图表的表达」「调整好一张图表后」；`AxesTab`「普通图表」；`FigureSourceStrip`「此图表」。
- 研究项目替代工作区项目：`ProjectManager` 状态标签、`HomeTables` 搜索框 aria-label（`搜索研究项目`）。
- 模型设置替代入口名「模型连接 / 配置模型连接」：顶栏按钮（文字与 aria-label）、`ModelConnectionDialog` 标题、`AgentAssistant` 头部按钮 aria-label 与未配置时的入口、`HomeSide` 卡片链接、`ChartPlanner` 入口与提示、`ChartPlanner` 读取失败提示「无法读取模型设置状态。」。对话框内部「测试连接」「应用连接」「断开」等动作不变。
- `FigureSourceStrip`「不会影响此图表」。

### 改过的断言/选择器（只改文案或结构，未删除断言）

- `frontend/e2e/model-connection.spec.ts:33`、`:79`：入口按钮由页面级 `getByRole("button",{name:"模型连接"})` 改为 `.masthead` 内同名 `模型设置` 按钮（首页卡片此时也有同名入口，需要限定范围）。
- `frontend/e2e/model-connection.spec.ts:34/:126`：对话框名 `模型连接` → `模型设置`；`:33/:79/:124` 的按钮名同步改名。
- `frontend/e2e/home-workspace.spec.ts:64`：搜索框 `aria-label` 由「搜索工作区项目」改为「搜索研究项目」。
- `frontend/src/components/home/HomePage.test.tsx:125/:130`：`getByLabelText("搜索工作区项目")` → `"搜索研究项目"`。
- `frontend/src/editor/figureTools.test.tsx:272`：期望文本 `数据版本 #${id}` → `版本 #${id}`。
- `frontend/src/editor/AgentAssistant.test.tsx:317`：未配置模型时的入口按钮由 `getByRole("button",{name:"配置模型"})` 改为在 `.agent-setup` 内查找 `模型设置`（头部也有同名按钮，限定范围，仍断言可见）。

- 验证：`npm test` **46 文件 / 261 通过**；`npm run build` 通过；隔离栈（后端 8089 + `labflow_e2e` + dev 5179）`npx playwright test e2e/model-connection.spec.ts` **2 passed (6.2s)**、`e2e/home-workspace.spec.ts` **1 passed**。

## 2026-10-23 · 11-3 产品化文案清理

- 助手：头部只显示「已连接 · {模型名}」（等宽灰字），地址与端口留在「模型连接」对话框；预算行改为「本次会话已用 N%」+ 带底色轨道的进度条（轨道 `--lf-surface-3`、进度 `--lf-text-1`、≥80% 改为 `--lf-warning`，含 Firefox `::-moz-progress-bar`），summary 与 progress 均带 title「已用 X / 上限 Y token」；删除「本轮附带最近 N 轮对话…」「原提案会保留…」，提案脚注合并为「确认后只修改草稿，可一步撤销；是否保存正式版本由你决定。」；继续修改的占位文字改为「还有哪里不满意？例如：线再粗一点」；「不采用这份提案」去掉 `<details>` 改为文字按钮，旁边「填写原因」展开原因输入框，拒绝与审计逻辑不变。
- 数据表脚注改为「N 行 · M 个字段」+「空值按缺失显示，不当作 0」；导入文件卡改用 `formatBytes`（新增 `frontend/src/lib/format.ts` 与 3 条单测）；快捷操作计数「已选 N 项」、≥25 项补「（最多 30 项）」；画布删除 FIGURE 与样式枚举角标；首页展台改「折线图 · 清晰学术」；编辑器面包屑改「{项目名} › v{版本}」/「未保存」；导出格式改「SVG 矢量 / PNG 图片 / PDF 文档」；备份说明、模型状态「已填写，尚未验证」、保存冲突第三句、运行历史文案按表替换。
- 导出框在「尚未选择论文尺寸，导出将按当前画布像素生成。」后加「设置论文尺寸」文字按钮，点击切到外观页。
- 删除编辑器左下角「原始实验数据始终保持不变」与首页页脚「原始文件只读」；「产品介绍」入口从首页侧栏移到全局顶栏「管理项目」左侧，所有工作区页面可见。
- A9：读 `backend/src/main/java/dev/labflow/agent/ModelConnections.java` 确认密钥只存在进程内存（`current`），`fingerprint()` 只写哈希、不落盘，提示改为「密钥只保存在本机 LabFlow 服务的内存中，不写入磁盘；重启 LabFlow 后需要重新填写。」
- 顺带修复并行发现的问题：11-2 把网络失败统一包成 `ApiError(kind="offline")` 后，`AgentAssistant.start()` 的 catch 只按 `instanceof ApiError` 判断，导致断线恢复入口「重新连接」不再出现；改为 offline 也进入断线分支，并补 1 条单测（离线 ApiError → 重新连接可恢复原运行）。

### 改过的断言（只改文案/结构，未删除断言）

- `frontend/e2e/agent.spec.ts:267`：「不采用这份提案」由 `<details>` 摘要改为按钮；先断言该按钮可见，再点「填写原因」→ 填原因 →「拒绝提案」，原因与审计断言不变。
- `frontend/e2e/agent.spec.ts:497`：无原因拒绝改为直接点「不采用这份提案」按钮（不再点展开后的「拒绝提案」）；恢复与预算断言不变。
- `frontend/e2e/intro.spec.ts:17`：用例名改为 `the global header keeps a product intro entry`，入口定位改为 `.masthead` 内的同名链接；断言未删。
- `frontend/src/editor/figureTools.test.tsx:424`：标题断言 `/待调整 · 1\/30/` → `已选 1 项`。
- `frontend/src/components/home/HomePage.test.tsx:103`：`/FIGURE 01 · LINE · CLEAN ACADEMIC/` → `/折线图 · 清晰学术/`。
- `frontend/src/editor/AgentAssistant.test.tsx:350`：拒绝流程由 `getByText("不采用这份提案")` 改为 `getByRole("button",{ name: "填写原因" })`。

- 验证：`npm test` **46 文件 / 261 通过**；`npm run build` 通过；隔离栈（后端 8087 + `labflow_e2e` + dev 5178 + 本地协议夹具 18769）`npx playwright test e2e/agent.spec.ts` **8 passed (43.2s)**、`e2e/intro.spec.ts` **4 passed (8.1s)**。
- 390px 检查：`docs/product-audit/after/11-3-home-390.png`、`11-3-offline-390.png`；实测 `scrollWidth - innerWidth = 0`（首页与断网离线页），离线页标题/说明/按钮 bounding box 均在 390 内，顶栏「产品介绍 / 管理项目 / 模型连接 / 新建」均未溢出。

## 2026-10-23 · 11-2 补充修复（按项目记忆数据集、单列形态体检）

- 工作区记忆：`frontend/src/lib/workspaceMemory.ts` 新增 `rememberDataset()` / `workspaceDataset()`；`rememberWorkspace()` 记录数据页时不再原样保存地址里的 `?dataset=`，数据集只能通过 `rememberDataset()` 写入；`readWorkspaceMemory()` 把旧记忆里的数据集迁移进来。`App.tsx` 的 `lastDataset` 由全局 number 改为 `{project,id}`，新增 effect 只在 `datasets` 里确实存在该 id 时才写入记忆；`navigate()` 的数据集回退按当前项目读取；删除对地址里任意 `?dataset=` 的信任赋值。`DataPage.tsx:50-57` 的守卫保留。
- 实测（隔离栈前端 5179 / 后端 8089）：项目 1 数据页选中数据集后切到空项目 2，地址为 `/projects/2/data`，`sessionStorage` 为 `{"1":{"data":"/projects/1/data?dataset=1"},"2":{"data":"/projects/2/data"}}`；直接打开 `/projects/2/data?dataset=1` 后项目 2 的记忆仍不带 dataset；从首页进入项目 1 数据页恢复 `?dataset=1`。
- `frontend/src/lib/importChecks.ts`：字段数不等于 1 时直接判为表格，「数据行 ≤ 1」只在单列时生效。单测调整/新增：1 行 × 5 列不提示；1 行 × 1 列长句子仍提示 `prose-column`；1 行 × 1 列普通列名提示 `single-row`。
- 本提交同时把 `refactor/tasks/11-productize.md` 纳入版本库。
- 验证：`npx vitest run --maxWorkers=4` **45 文件 / 257 通过**（默认并发下 5 条既有 jsdom 用例偶发 5s 超时，单独重跑 19/19 通过）；`npm run build` 通过；`npx playwright test e2e/isolation.spec.ts`（隔离栈）**5 passed (15.2s)**。

## 2026-10-23 · 11-2 上传形态体检与本地服务报错

- 新增 `frontend/src/lib/importChecks.ts`：`checkImportShape({fieldNames,rowCount})` 把「散文被读成一列」（只有 1 个字段且字段名 >30 字或含 `。，、；？！`）与「只有一行数据」判为不像表格，返回 `{looksLikeTable, reason}`；`shapeWarning()` 给出对应文案。6 条单测覆盖散文、纯长列名、单行、正常单列（20 行）、正常多列、长列名不带标点。
- 上传确认页（`frontend/src/components/UploadDialog.tsx`）：不像表格时顶部显示 aria-alert 警告「这份文件看起来不是表格：只识别出 1 列，也没有找到分隔符。请检查文件格式或分隔符设置。」，`确认导入` 默认禁用，勾选「我确认这是一份单列数据，仍要导入」后才可用；同时隐藏该页的字段建议列。
- `frontend/src/lib/api.ts`：`ApiError` 增加 `kind: "http" | "offline"`；`fetch` 抛 `TypeError`/`Failed to fetch` 时统一转成 `ApiError("本地服务没有响应", 0, "offline")`，5xx 无正文时用「本地服务处理请求时出错，请稍后重试」，其余保持后端中文原话。其它异常原样抛出（不吞测试里模拟的服务错误）。
- 新增 `frontend/src/lib/saveFeedback.ts`：`saveFailureMessage(kept)` 与 `readableError(e)`；`useChartSave` 失败时若 `DraftWriter.has(draftKey)` 为真，提示「保存失败：本地服务没有响应。修改仍保存在本机草稿中，服务恢复后可以再次保存。」，否则只报前半句。`DraftWriter` 增加 `has()` 并补 1 条单测。
- 整页错误页（`App.tsx`）：标题「无法连接本地服务」、说明「请确认 LabFlow 已经启动。你的数据保存在本机，没有丢失。」、按钮「重新连接」；`ClassificationResults.tsx` 的「Java 服务」改为「本地服务」（全站 `grep "Java 服务"` 为 0）。
- `ChartPlanner` 的「响应丢失」分支改为只看 `kind === "http" && status < 500`，离线时保留「恢复分析状态」入口（否则一断网就丢掉可恢复的运行 ID）。
- 验证：`npx tsc -b --force` 0 错；`npx vitest run` **45 文件 / 252 通过**；`npm run build` 通过（相比 11-1 增加 2 个文件）。
- 新增 `frontend/e2e/productize.spec.ts` 2 条，隔离栈 **2 passed (7.1s)**：散文 .txt 出现警告且 `确认导入` 禁用 → 勾选后可用；断开全部 `/api` 后刷新，页面显示「无法连接本地服务」，正文不含 `Failed to fetch` 与 `Java`。

## 2026-10-23 · 11-1 项目切换的数据隔离

- 复现结论：11-0 审计里「切到空项目后数据页仍显示上一个项目的数据」**未能复现**。四路探针（切换下拉、首页建项目、建项目后点导航、直接深链）在 50ms 采样下均未出现旧文件名；当时看到的「空项目验收 | 迁移学习复现」是 `<select>` 的 `innerText` 把所有 `<option>` 串在一起，被误当成当前选中值（`createProject` 在 `page==="home"` 时确实 `setProject(p.id)`，探针 2/3 已验证）。
- 但沿着同一条线索找到一处真问题：切换项目后工作区记忆里可能留着上一个项目的版本号，打开 `/projects/{b}/data?dataset={a 的版本}` 时 `id = selected || datasets[0]?.id` 直接采用它 → 请求 404 → 数据页显示「重试」错误块而不是 B 自己的数据。修复在 `frontend/src/data/DataPage.tsx:50-57`：先按当前项目的 `datasets` 校验地址里的版本号（`const chosen = datasets.some(d => d.id === selected) ? selected : 0`），不匹配就回落到本项目第一个版本，`useEffect` 同步改用 `chosen`。未使用 setTimeout 兜底，查询 key 本来就带 `project`。
- 回归：新增 `frontend/e2e/isolation.spec.ts` 5 条，全部在隔离栈（后端 8089 + `labflow_e2e` + 前端 5179）实跑 **5 passed (13.9s)**：
  1. 数据页从有数据的 A 切到空的 B，50ms×20 采样内不出现 A 的文件名，最终显示 B 的空状态；
  2. 编辑器从 A 的图表切到 B（B 的接口延迟 800ms），采样内不出现 A 的文件名且最终渲染出 B 的图；
  3. 切到 B 后上传文件，落到 B（`GET /projects/{b}/datasets` 由 0 变 1，A 仍为 1）；
  4. 首页在切到 B 后不再列出 A 的图表名；
  5. 带着 A 的版本号打开 B 的数据页，不出现 A 的文件名、不出现「重试」，渲染 B 自己的文件。
  - 第 5 条在去掉 `DataPage` 守卫时确实失败（`expect(body).not.toContain("重试")` 命中），加回守卫后通过——先失败再修。
- 已检查无需改动：实验页用 `key={project}` 重挂载 + `queryKey: ["experiments", project]`；首页「最近图表」来自 `[charts, project]`；导入对话框的目标项目取自当前 `project`（上述第 3 条即其回归）；`main.tsx` 的 `QueryClient` 没有全局 keepPreviousData；`Editor.tsx:30` 的 `placeholderData` 只在同一 `project` 的 `["data", project, id]` 之间复用，第 2 条实测未泄漏。
- 验证：`npx tsc -b --force` 0 错；`npx vitest run` **43 文件 / 238 通过**；`npm run build` 通过（无新增分包告警）。

## 2026-10-23 · 10-7b 助手面板、编号标记与视觉一致性

- `npx tsc -b --force` 0 错（新增 `agentShortcut`、`proposalMarkers` 的类型收窄）；`npx vitest run` **43 文件 / 238 通过**（`AgentAssistant.test.tsx` 28 条含 5 条续改用例、`proposalMarkers.test.ts` 5 条）；`npm run build` 通过（13.31s，`index-*.js` 仍 >500 kB，属既有分包提示）。
- 面板遮挡（第 6 项）用探针 `tmp/probe-dock.cjs` 在隔离栈实测，1440×1000 与 1440×720 各一组：
  - 修复前：`.quick-actions-body` 在 1000 高下 325.8px（scrollTop 295）、在 720 高下只剩 **45.8px**，「提案已就绪」整块滚出可视区（`overlapTop:true`）；composer 常驻 197.2px。
  - 修复后：body **511px / 231px**，composer 默认收起（`composerPresent:false`），两种视口 `overlapTop:false`，页脚只剩「继续修改 / 应用这组调整 / 查看原图 / 拒绝提案」。
  - 根因两条：`.agent-dock .quick-actions-body` 只有 `min-height:24px` 被顶部行与常驻 composer 挤扁；滚动 effect 固定 `scrollIntoView` 到提案预览区，把上方状态行推出视口。不是 sticky 头部、也不是负 margin（`agent-assistant.css` 的 sticky 只对 dialog 模式生效）。
- 第 7 项：无提案时「应用这组调整」不渲染（非禁用）——`AgentAssistant.test.tsx` 与 `agent.spec.ts` 的取消/拒绝两条断言由 `toBeDisabled()` 改为 `toHaveCount(0)`。
- 第 8 项：有待确认提案时页脚只留主按钮、原图/预览切换、不采用链接；输入框收起为「继续修改」文字按钮，点开才出现输入框与同意勾选；重复的灰色「继续修改提案」大按钮已删除，发送/同意/单次请求逻辑未改，`agent.spec.ts` 三轮续改用例改为先点「继续修改」再断言输入框 `toHaveCount(0)`。
- 第 9 项：`/series/{i}/*` 标记改到曲线中点（`getPointAtLength(totalLength/2)` + `getScreenCTM` 手算，jsdom 无 `matrixTransform`），`/title` 与 `/style/title` 映射到 `.gtitle` 包围盒；`proposalMarkers.test.ts` 重写 5 条覆盖。
- 第 10 项：`welcome.css` 新增 ≤640px 断点（顶栏单行、隐藏导航、按钮 36px 高），`site/index.html` 镜像同一段；`scripts/test-site.cjs` 增加 `headerHeight ≤64` 与 `navVisible === false` 断言，实跑 **PASS 4/4**（390/768/1280/1440 无溢出）。
- 第 11 项：`HomeSide.tsx` 模型已配置时链接文案为「模型设置」，未配置仍为「配置模型连接」（`provider.data?.available`）。
- 第 12 项：介绍页首屏示意曲线 y 轴改 0.5–1.0，Proposed 终点与 chip 对齐 CSV 的 0.903，`site/index.html` 同步。
- E2E（本轮专项）：主栈 `intro` 4/4 + `home` 2/2 + `navigation` 2/2 + `refinements` 1/1（25.1s）；隔离栈 `agent` 8/8 + `assistant-layout` 1/1（43.8s，清理 9 个测试项目）。
- 截图重拍：`refactor-10-home.png`、`refactor-10-intro-390.png`、`refactor-10-assistant-idle.png`、`refactor-10-assistant-preview.png`；其余被 E2E 顺带重写的截图已还原，未进提交。

## 2026-10-23 · 10-7a 导航与入口

- `npx vitest run`：**235 通过**（新增 `agentShortcut.test.ts` 4 条、`ProductIntro.test.tsx` 2 条）；`npm run build` 通过（10.66s，`index-*.js` 578.93 kB）。
- `intro.spec.ts` **4/4**、`refinements.spec.ts` **1/1**（主工作区栈，8086/5176）：首访 `/` 重定向到 `/welcome`（replace）→ 开始创作后 URL 为 `/` 且写入标记 → 后退回到介绍页且顶栏按钮显示「进入工作区」→ 前进回到工作区 → 刷新仍是工作区；侧栏「产品介绍」入口可点进介绍页；深链接与存储被禁两条用例保持通过。
- `home.spec.ts` 2/2、`navigation.spec.ts` 2/2（主栈）。
- `agent.spec.ts` **8/8**、`assistant-layout.spec.ts` **1/1**（隔离栈：夹具 18769 + 后端 8087 + dev 5178，清理 9 个测试项目）。主栈跑这两条会因 `provider.model !== "labflow-fixture"` 自动 skip。
- `refinements.spec.ts` 在 `goto("/")` 后新增 `await expect(page.locator(".home")).toBeVisible()`，断言数不变。

## 2026-10-23 · 10-6 动效与验收

- `npx vitest run`：42 文件 / **229 通过**；`npm run build` 通过（18.13s，`index-*.js` 578 kB，`ProductIntro-*.js` 18.8 kB 仍为独立懒加载 chunk）。
- 新增 `frontend/e2e/motion.spec.ts`（3 条，全过）：① 默认动效下首页 `data-entrance="full"`、`h1` 用的是 `lf-up` 入场、入场过程中 `.home-intro-actions` 按钮 `click({trial:true})` 可点、结束后 h1/按钮/展台/底栏 `opacity` 全为 1；② 点「继续编辑」进入 `/projects/:id/figures/:chart`、`[data-testid=plot]` 可见、全程无 console error / pageerror；③ `reducedMotion:"reduce"` 下 `data-entrance="none"`、无 `lf-motion-on`、h1 与展台 `animation-name=none`、`opacity=1`（无需等待入场）。
- 完整隔离 E2E **70 passed / 1 failed（5.9 分钟，71 条）**：唯一失败是 `e2e/refinements.spec.ts:3` 在满载并行时等 `getByTestId("file-upload")` 90s 超时；单独重跑该 spec **1 passed (9.2s)**，本次任务未改导入链路，判为既有的并行争用抖动（建议后续在 goto 后先等首页外壳再上传）。
- 性能证据 `docs/test-evidence/refactor10-perf.json`（Chrome CDP trace，1440×900，已选好一个项目）：
  - dev（5178）：FCP 288ms，入场起点 296ms；全程 2 个 >50ms 任务（114ms/59ms、175ms/87ms），**入场窗口内 0 个**。
  - 生产构建（`vite preview`，4399）：FCP 140ms，入场起点 143ms；1 个 >50ms 任务（67ms/60ms），**入场窗口内 0 个**。
  - 注：在 Playwright 打开 trace 录制时，首帧渲染会多出约 250ms 的主线程任务（录制开销），无录制时不存在；因此该断言不放进 E2E，作为 trace 证据单独记录。
- 截图：本次新增 `docs/screenshots/refactor-10-editor-assistant.png`（1440×900，按 `Alt+A` 打开助手并显示画布提案）；首页沿用 10-3 的 `refactor-10-home.png`（重拍字节一致，未产生 diff）；站点两张见 10-5。
- 与设计稿逐项对照（`docs/test-evidence/refactor10-parity.json`，设计片段 `refactor/design/09-10/static/*.html` 仅含局部片段，故比对可测量的排印与组件规格）：

| 项目 | 设计片段 | 实现 | 说明 |
| --- | --- | --- | --- |
| 首页 h1 字号/字重/字距 | 36px / 800 / -1.08px | 34px / 700 / -0.68px | 实现只用令牌 `--lf-text-3xl`（34px）+ `--lf-tracking-tight`；要 36/800 需改令牌，会影响全站标题 |
| kicker | 片段无 | 12px / 0.48px 字距 / `--lf-ink-3` | 片段未包含该元素 |
| 主按钮高度/圆角/内边距 | 42px / 11px / 18px | 44px / 11px / 18px | 高度差来自 `--lf-control-h`（44px）令牌 |
| 深色展台 | 片段用 `.paper` 示意 | 828×411，`#0e1116`，圆角 18px，内边距 24px | 与 10-3 说明一致 |
| 画布纸面 | 片段 `border-radius:4px` + 重投影 | `border-radius:0`、无阴影 | 编辑器画布改为整幅铺满（白纸满铺），不再做卡片化纸面 |
| 助手停靠宽度 | 片段无 dock 类 | 432px，白底，左侧 1px `#e4e7ec` | 设计片段用 `.pill/.msg-in` 等局部类，未定义整栏宽度 |

- Firefox：**未执行** —— 本机没有 Firefox，`%LOCALAPPDATA%\ms-playwright` 也没有安装浏览器（Playwright CDN 在该网络不可达），只用系统 Chrome 跑。
- 偏差：任务允许「用 Firefox 再跑一遍」是可选分支，此处无法执行；其余无偏差。


## 2026-10-23 · 10-5 公开展示页

- `site/index.html` 换成 10-2 介绍页的静态导出：正文复用 10-2 已 token 化的标记与 `welcome.css`，96 个 `--lf-*` 令牌内联解析，无内联十六进制颜色；三处「开始创作」按钮改为指向 README 安装说明的链接，文案「本地运行」；滚动浮现用原生 IntersectionObserver，无 JS 或 `prefers-reduced-motion: reduce` 时直接显示最终状态。
- 几何对齐真实 `/welcome`：1440 与 390 两个宽度下 h1 文案与字号（76px / 40px）、section 数量（5）、横向溢出（0）完全一致；三处 CTA 文本均为「本地运行 →」。
- `node scripts/test-site.cjs`：4/4 视图（390 / 768 / 1280 / 1440）无横向溢出、无 `href="#"`、外部请求只有 `fonts.googleapis.com` / `fonts.gstatic.com`；原有断图片/内联色/未解析令牌/锚点可解析等检查保留，截图 `docs/screenshots/refactor-10-site-*.png`，证据 `docs/test-evidence/refactor10-site.json`。
- 偏差：任务允许直接复用 `refactor/design/09-10/static/ProductIntro.html`，该稿全部使用内联十六进制颜色与内联样式，与视觉规则（只用 `--lf-*`）和站点测试的「无内联 UI 色」冲突；故改为复用 10-2 已完成的 token 化标记，视觉与真实页面逐项一致（上条几何对比）。需要人决定：无。


## 2026-10-23 · 10-4 助手画布预览

- 画布底部新增输入条（CanvasAsk：默认不勾同意，未勾不可发送）；提案直接画在画布上：FigureCanvas 的 proposal 层、`预览中 · 尚未应用` 胶囊、原图/预览切换。proposalMarkers 把 JSON Pointer 映射到图例/坐标轴/序列的边界框，序列直接复用 `js-line` 的 `d` 描边，编号与右侧 diff 一一对应。
- 预览只影响呈现：useProposalCanvas 不写草稿、不进撤销历史、不保存；切回原图、关闭面板或手动改画布时撤下预览，只有「应用这组调整」进入既有的校验 + 一次撤销链路。useAssistantAutoStart 每次提交只自动发起一次；agentPresentation 集中管理文案；顶栏胶囊按钮与 Alt+A（任务文档允许的备选，见下）。
- 修两处：关闭后重开面板时父层清理 effect 会清掉子层刚恢复的预览；720px 高度下新增底部按钮挤压对话区。均补回归测试。
- `npm test -- --maxWorkers=4`：229/229（42文件）；`npm run build`通过18.68s（index 578.36 kB；ProductIntro 独立 chunk 18.8 kB，入口不含介绍页文案）。隔离栈（Java 8087 / Vite 5178 / 协议夹具 18769）：`agent.spec.ts` 8/8 + `assistant-layout.spec.ts` 1/1（49.1s）；完整隔离 E2E 68/68（4.4分钟）。
- 首页改版后任务09的 `refactor09-layout-baseline.json` 未同步，`cleanup-visual.spec.ts` 首次失败；按新首页几何刷新基线（仅 home 面 18 行变化，experiments/data/editor 三面未变），随后 68/68。
- 偏差：快捷键采用 Alt+A；无头测试只能证明 Ctrl+J 事件被取消，无法验证 Chrome 原生下载页，故不声明原生快捷键已验证。未执行 Java 单测（本节无后端改动）。需要人决定：无。


## 2026-10-23 · 10-3 工作区首页v2

- 保留HomePage/ContinueCard/HomeSide/HomeTables边界，改为问候/命令栏/2:1深色展台与最近图表+2×2入口/实验与项目表。展台显示真实图表、最近两个版本和可选本机草稿（最多3行）；明确当前预览为已保存版本。
- FigurePreview新增fit模式：实际容器宽度与原宽高比直接渲染Plotly，字号不做CSS缩放；默认exact保留样式库原行为。线条用临时dash+Web Animation绘制，结束/取消清理。首页按会话full/quick/none入场，最后一项1.18s结束；草稿点只用opacity闪动，不动画化阴影。
- 命令栏轮换示例、焦点/减少动效停轮换、挂载期间Ctrl/⌘K聚焦；只把文字送到编辑器，首页不发起模型请求。ContinueCard悬停/聚焦预载，点击等编辑器模块与同key图表/数据查询完成后再共享图纸转场；PDF按钮打开真实编辑器PDF导出窗口，入口状态用后清理。
- `npm test -- --maxWorkers=4`：220/220（38文件，18.66s）；最终build通过10.40s。`./.runtime/test-refactor09.ps1 -Specs home.spec.ts,home-v2.spec.ts,home-workspace.spec.ts,styles-library.spec.ts,navigation.spec.ts`：10/10（21.1s）；补1440px快照与新命令栏色彩等价断言，home-v2+design-tokens再2/2（5.3s）。各轮新JVM审计/恢复通过。
- 未执行Java单测/真实模型/完整E2E（10-6）。偏差：超过6条线时绘制延迟封顶600ms，避免超出工作区1.2s入场上限；演示图/版本数量由真实夹具决定，未填充虚构记录。需要人决定：无。


## 2026-10-23 · 10-2 产品介绍页

- 按所提供静态稿移植首屏CSV→彩色论文图、可追溯步骤、7秒助手示意和6张SVG图表；三处CTA均调用同一真实入口，GitHub/锚点有效。固定仓库SVG字符串不插入用户内容，样式限定product-intro范围；颜色、字体和尺寸改用token，新增59个设计尺寸token，无新依赖。
- 用useReveal/IntersectionObserver渐进增强，离开视口暂停助手示意；无observer/减少动效直接可见。首屏与助手均标“示意数据”，准确说明13工具=3只读+10修改提案，以及发送元数据前同意/可能计费。390px隐藏CSV/连线/浮动标签，保留图纸，标题40px。
- `npm test -- --maxWorkers=4`：218/218（37文件，18.26s）；最终 `npm run build` 通过10.91s。新增observer测试首次build类型断言不足，补完整IntersectionObserverEntry后通过；未删除测试。临时移植脚本首次遍历自生成节点未终止，已停止，仅修正离线生成脚本，无运行时逻辑影响。
- `./.runtime/test-refactor09.ps1 -Specs intro.spec.ts,product-intro.spec.ts`：4/4（6.6s），真实隔离服务，新JVM检查通过；1440/390全页截图已目视检查。
- 偏差：静态稿原本动画化stroke-width/box-shadow，按10-0改为叠加粗线的opacity动画/即时阴影，保留视觉含义；不用animation-timeline。未执行Java单测/真实模型/完整E2E（10-6）。需要人决定：无。


## 2026-10-23 · 10-1 首次访问与介绍页路由

- 根路径首次访问显示懒加载ProductIntro骨架，进入后标记labflow-intro-seen；/welcome始终可打开，工作区页脚入口；深链接不拦截，存储异常直接进入工作区。圆形View Transition按点击位置展开，支持结束清理/无API/减少动效降级；介绍页不请求工作区API。
- 统一e2e/workspace-test.ts为已有用例预置已看介绍标记；intro.spec.ts独立验证真实首次访问、刷新、welcome回访、保存图表深链接和存储受限。新增路由单测；首页组件测试补MemoryRouter上下文，保留全部断言。
- `npm test -- --maxWorkers=4`最终214/214（35文件，17.08s）；build通过10.73s。首轮206/214：7项因新增Link缺测试Router、1项既有助手等待偶发超时；补Router后未改助手实现或断言，重跑全过。
- `./.runtime/test-refactor09.ps1 -Specs intro.spec.ts,home.spec.ts,navigation.spec.ts`：7/7（11.5s），独立Java/MySQL，新JVM检查通过。未执行Java单测/真实模型/全量E2E（留10-6）。偏差：ProductIntro本节只建立真实可点击骨架，完整视觉按10-2完成。需要人决定：无。


## 2026-10-23 · 10-0 动效基础

- AGENTS追加动效规范；motion.css提供缓动/时长、四组关键帧及默认可见的渐进增强类；useMotion提供动态减少动效监听和会话内首次/快速入场。Playwright默认减少动效，无新增依赖。
- `npm test -- --maxWorkers=4`：213/213（35文件，17.22s）；`npm run build`通过10.73s；`./.runtime/test-refactor09.ps1 -Specs home.spec.ts`：2/2（4.5s），隔离Java/MySQL，新JVM审计和恢复通过。
- 未执行：Java单测、真实模型、完整E2E（留10-6）。偏差：无。需要人决定：无。
## 2026-10-23 · 任务09总验收（09-1—09-5）

- 五节各自测试后独立提交：09-1 `2136e12`；09-2 `1f25e48`；09-3 `bbba02d`；09-4 `187b987`；09-5 `dc919c7`。总验收补充适配修复、旧断言等价更新与证据单独提交。
- 最终命令：前端 `npm test -- --maxWorkers=4`：34文件209/209，17.06s；`npm run build`：通过，10.35s。构建现存Plotly大包警告仍在。
- `$env:LABFLOW_POLISH_STAGE='final'; ./.runtime/test-refactor09.ps1 -All`：最终完整一次62/62（2.7分钟），使用真实隔离MySQL labflow_e2e、Java API8087、生产dist网页5178、本地兼容协议夹具18769。包括上传/数据处理/实验对比/工具原子预览/助手预算与恢复/草稿与冲突/SVG PNG PDF/窄屏；不是前端mock。清理71个本轮项目；新JVM审计保留与中断恢复检查通过。
- 首轮完整54/62，7个旧布局/图例测试假设、1个真实自适应溢出；第二轮60/62，剩余实验名称含编号/清空按钮名称定位；随后editor+shell-pages专项2/3定位到名称后缀同时匹配操作按钮。最终限定实验编号前缀，原有业务断言保留，完整62/62。适配诊断两轮experience均2/3，修复后原适配/手动缩放/导出检查通过。没有把失败轮次计为通过。
- 自适应修复：实际测量paper-group减paper-wrap高度（标题、脚注、标尺）及stage padding；补fitZoom回归单测。只改查看缩放，publicationMetrics与保存画布宽高不变。最终布局基线独立比较四页26元素×7项属性通过；任务08旧证据恢复保留。
- `node scripts/audit-css.cjs docs/test-evidence/refactor09-css.json`：19CSS文件、6607行、35种六位颜色、3处important、0衬线/禁用引用，未超过08的35种。
- `node .runtime/compare09.cjs`：生成4组设计稿/实际页面并排图，实际页面均1440px宽；已目视检查。四组差异、原因、逐节文件/结果/偏差见 [任务09详细验收](REFACTOR-09-ACCEPTANCE.md)；[图片索引](test-evidence/refactor09-comparisons.json)。PDF MediaBox实测180×118.42105mm，像素配置760×500保持不变。
- `git diff --check`通过；对照62d089e：后端、Flyway、AgentAssistant.tsx、草稿/保存/快捷键实现无差异。未运行Java JUnit（无后端改动，package使用-DskipTests）、未调用真实/收费模型、未部署/推送，任务10未执行。各节未单独运行完整E2E，已由总验收覆盖。需要人决定：无。


## 2026-10-23 · 09-5 论文尺寸预设与单序列图例

- 画布工具栏和外观页复用 PublicationPresets；88/120/180 mm 只写既有 publication 字段，保持 style.width/height。原专业页物理控件移入唯一的 PublicationPanel，含自定义、只读比例高度、字号/DPI范围；加每10mm标尺和尺寸读数。新图单个无分组序列默认隐藏图例；已保存配置保持原值。
- 沿用 publicationMetrics/renderConfig：fontPx = fontPt × 25.4 / 72 × style.width / widthMm，没有另造换算。760×500画布、8pt时单栏88mm字体24.373737px，双栏180mm字体11.916049px；画布像素尺寸不变。
- `npm test -- --maxWorkers=4`：最终208/208（33文件，16.92s）；`npm run build`通过。首次新增组件测试206/208，原因是分段按钮子元素拼接的可访问名称缺空格；补明确aria-label后全部通过。最终缩短高度可见标签以保持输入对齐，可访问名称仍说明按比例。
- `./.runtime/test-refactor09.ps1 -Specs publication-presets.spec.ts,publication.spec.ts,delivery.spec.ts`：6/6（16.2s），真实MySQL保存/刷新、一步撤销、180mm PDF MediaBox、原始CSV字节一致、89mm自定义SVG/PNG/PDF兼容流程通过；新JVM审计和恢复通过。最终外观微调后同组再运行6/6（16.4s），新JVM检查再次通过。
- 证据：screenshots/refactor-09-editor-single.png、refactor-09-editor-double.png；exports/refactor-09-double.pdf；test-evidence/refactor09-publication.json。
- 未执行：Java单测、真实模型、完整E2E（留总验收）。与任务偏差：只读高度可见标签精简为“高度 / mm”，aria-label保留“高度（按比例） / mm”；既有89mm默认仍关闭，不改旧配置。需要人决定：无。



## 2026-10-23 · 09-4 数据页

- 数据页样式从styles.css迁入data/data-page.css归属处；移除版本列表外框，选中项独立白底/边框/轻阴影。文件名使用正常字体500字重并完整换行，第二行等宽版本/行数/日期；已有source_meta派生数据添加“派生”标记。右侧单层卡片、24px对齐提示和字段区域、浅蓝提示边框及图标，共享lf-table铺满。
- 仅在Dataset前端类型补已有API实际返回的可选created_at（已检查WorkspaceService查询），没有改变API字段或后端。新增DataPage两项组件测试，检查长文件名、日期、派生标记、切版本和原文件/绘图动作。
- `npm test -- --maxWorkers=4` 204/204（32文件，16.62s）；`npm run build` 通过。
- `$env:LABFLOW_POLISH_STAGE='09-4'; ./.runtime/test-refactor09.ps1 -Specs visual-polish.spec.ts,processing.spec.ts`：4/4（9.1s），真实上传/过滤排序/统计派生/重新打开与导出通过，新JVM审计和恢复通过；1440px截图已检查。`node scripts/audit-css.cjs docs/test-evidence/refactor09-css.json`：35颜色、3 important、0衬线/禁用引用。
- 未执行：Java单测、真实模型、完整E2E（留总验收）。与任务偏差：无。需要人决定：无。

## 2026-10-23 · 09-3 实验表格视图

- 新增 ExperimentsTable、tableModel、lib/metrics、lib/format 和10项单测。默认表格/卡片持久化；全项目字段频率推断、4参数/3指标默认、按项目列设置、双向排序且空值始终最后；已知方向最优值高亮；数据版本按钮、编辑/复制菜单。展示数字取6位有效数字，title保留完整值，排序/数据不变。
- 复用原有selected/chosen、复制和Comparison逻辑；深色选择栏只在有选择时显示，首个所选即既有比较默认基线，去掉原列表预留空白。卡片和版本历史统一本地日期格式。
- `npm test -- --maxWorkers=4`：202/202（31文件，15.54s）；`npm run build`：通过11.09s。首轮build发现Testing Library角色查询不支持exact参数，改成等价精确名称查询后通过；误在该次构建失败后执行的旧产物E2E有1/2失败，不计验收，后续均重新构建。
- `$env:LABFLOW_POLISH_STAGE='09-3'; ./.runtime/test-refactor09.ps1 -Specs experiments.spec.ts,visual-polish.spec.ts` 最终2/2（6.5s）；表格选2项进对比、返回切卡片保留选择、原3项对比/生成/追溯断言全部保留通过。另 `LABFLOW_POLISH_UPDATE_BASELINE=1` + cleanup-visual.spec.ts 1/1；新JVM检查通过。
- 与任务偏差：09有意改变布局，08截图几何契约更新为显式09快照基线，仍保留四页每元素七项几何/字体断言；完整E2E会在总验收对最终基线再次独立比较。没有修改草稿/保存/助手状态机。未执行：Java单测、真实模型、完整E2E（留总验收）。需要人决定：无。

## 2026-10-23 · 09-2 统一表格样式

- 新增 styles/table.css；首页项目列表改为语义表格，两张首页表、导入预览、DataTable、Comparison和评估/分类/样本结果表统一lf-table。移除全局th背景/大写；数据表100%宽，56px行号、数字右对齐等宽、空值“空”及aria-label，底栏明确不当作0。版本历史本来是快照列表（无table），保留其操作结构。
- `npm test -- --maxWorkers=4` 最终192/192（15.68s）；`npm run build` 通过。DataTable补空值和num断言。首轮新增测试误用getByText断言不存在，改用queryByText；另两轮原有助手测试在1s轮询边界超时，测试环境asyncUtilTimeout调至3s，全部断言和生产逻辑保留。
- `$env:LABFLOW_POLISH_STAGE='09-2'; ./.runtime/test-refactor09.ps1 -Specs visual-polish.spec.ts,home-workspace.spec.ts,refinements.spec.ts`：3/3（12.3s），独立真实数据库，首页表头一致、空值/数字、表格铺满及原流程通过；新JVM审计/恢复通过。首次2/3，新增num断言使用精确类字符串遇尾空格，改为类词匹配后通过。
- 未执行：Java单测、真实模型、完整E2E（留总验收）。与任务偏差：增加测试等待窗口以消除已定位的时间竞争；未改助手逻辑。需要人决定：无。

## 2026-10-23 · 09-1 收敛蓝色

- 合并任务包，仅执行09。85条辅助信息/装饰声明改为中性色，数字、版本与时间补等宽类。保留链接、选中、焦点、进行中状态。
- `npm test -- --maxWorkers=4` 首轮191/192（未改动助手测试超时），原样重跑192/192；`npm run build` 通过20.27s。
- `$env:LABFLOW_POLISH_STAGE='09-1'; ./.runtime/test-refactor09.ps1`：独立真实MySQL和API8087、生产构建5178、本地模型协议夹具，调用 `npx playwright test visual-polish.spec.ts`：1/1通过，三张1440px截图，配置和revision不变；新JVM审计/恢复检查通过。首次测试夹具漏必填description，修正后通过。
- 未执行：Java单测、真实模型、完整E2E（留总验收）。无后端/API/助手逻辑改动；差异：无。需要人决定：无。

选择器清单（完整前后值见 test-evidence/refactor09-1-selectors.json）：
- `frontend/src/styles.css`: `.empty-art`, `.spinner`, `.field-pills b`, `.field-type`
- `frontend/src/components/model-connection.css`: `.model-connection-dialog .connection-consent`
- `frontend/src/editor/agent-assistant.css`: `.agent-budget progress`, `.agent-budget progress::-webkit-progress-value`, `.agent-budget progress::-moz-progress-bar`
- `frontend/src/editor/professional.css`: `.professional-kicker`, `.professional-intro p`, `.facet-plan-head`, `.facet-plan-head strong`, `.facet-mini-grid b`, `.facet-mini-grid i`, `.facet-mini-grid small`, `.sample-summary th`, `.sample-summary td`, `.sample-summary-note`, `.canvas-empty-plot`, `.canvas-empty-plot strong`, `.publication-readout strong, .publication-readout span`, `.publication-readout strong`, `.tiny-note`, `.export-checks`, `.evaluation-panel`
- `frontend/src/editor/quick-actions.css`: `.quick-actions-dialog > p`, `.quick-actions-note`, `.quick-field > span, .quick-field-toggle`, `.quick-queue small`, `.quick-result-heading span`, `.quick-result-footer p`, `.quick-changes strong`, `.quick-changes span`, `.quick-changes del`
- `frontend/src/editor/styles-library.css`: `.dialog-content.style-library-dialog`, `.style-library-dialog > p`, `.style-tabs button`, `.style-tabs button:hover`, `.style-browser-heading p`, `.style-card p`, `.style-preview p`, `.style-detail-scroll > p`, `.style-detail dt`, `.style-detail-note`, `.preset-traits span`, `.style-empty h4`, `.style-count`, `.style-reuse-body > p`
- `frontend/src/experiments/experiments.css`: `.record-title > span`, `.experiment-tags span`, `.record-values small`, `.record-values p`, `.record-values b`, `.record-foot small`, `.comparison-selection`, `.comparison-selection > span`, `.form-section-head > span`, `.kv-head`, `.field-help`, `.dataset-link-options small`, `.comparison-heading p`, `.comparison-table small`, `.source-summary`, `.source-experiment p`, `.provenance-strip`
- `frontend/src/processing/processing.css`: `.processing-form h3 small`, `.processing-form p, .processing-preview > p`, `.processing-actions > span`, `.processing-counts span`
- `frontend/src/styles/dialogs.css`: `.column-options`, `.column-resize:hover`, `.dialog-overlay`, `.dialog-content[role="dialog"]`, `.dialog-content .dialog-close`
- `frontend/src/components/home/home.css`: `.home-quick-icon`
- `frontend/src/editor/workbench/workbench.css`: `.figure-icon`, `.version-tag`, `.number-symbol, .string-symbol`, `.property-section h3 svg`, `.panel-resize:hover`, `.canvas-stage`, `.editor .field-disclosure summary span`, `.editor .chart-picker > summary span`

## 任务 08：清理与文档收尾（2026-10-23）

本任务从干净的 5f197f0 开始，只整理前端呈现与文档。删除过渡别名、旧导航/覆盖样式，将现用规则归入 shell.css、styles/dialogs.css 与 editor/workbench/workbench.css。根 App 移除旧外壳类，main 更新样式入口；仍在使用旧页眉标签的 Editor 空状态与 Comparison 改用 lf-kicker。后端、API、schema、原始数据、绘图计算、草稿、保存、撤销及助手状态/预算/恢复逻辑未改。

### 改动与统计

| 指标（任务 00 同一六位 hex / CSS 行数口径） | 00 历史基线 | 08 开始前 | 08 完成后 |
| --- | ---: | ---: | ---: |
| CSS 文件数 | 15 | 17 | 16 |
| CSS 行数 | 7,820 | 7,575 | **6,304** |
| 六位十六进制颜色种类，含全部 CSS 和 token | 417 | 199 | **35** |
| !important | 26 | 23 | **3** |
| 衬线引用行 | 22 | 1 | **0** |

当前统计没有排除 editor CSS，比任务要求的“排除图表相关文件后少于 120 种”更严格。保留的三处 !important 是两条全局减少动态效果规则和原有 select 箭头预留。旧外壳、旧字体和 launch 前缀在 frontend/src 均无引用。颜色、字号、间距、圆角直接引用 --lf-*；新字号 token 保留已有像素值，没有缩小正文。Tailwind @theme 只转接 canonical token。

按实际 TS/TSX 字符串及 className 动态前缀核对，删除 **171 个无使用者的选择器**，包括旧 hero、图版、能力介绍、首页列表与旧页眉。明确保留 Plotly 运行时生成的 xtitle/ytitle 类；不是仅凭当前页面 CSS coverage 删除。另删除 **61 条**同容器、同选择器、同属性已被后续声明覆盖的规则，不移动其余声明顺序。审计见 [CSS 前](test-evidence/refactor08-css-before.json)、[CSS 后](test-evidence/refactor08-css-after.json)、[选择器核对](test-evidence/refactor08-unused-selectors.json)、[重复声明](test-evidence/refactor08-duplicates.json)。可复跑 `node scripts/audit-css.cjs`。

主要文件：

- styles.css / styles/{tokens,shell,dialogs}.css 与 editor/workbench/workbench.css；组件、实验、处理及样式库 CSS 直接使用 token。删除 components/{navigation,refinements,experience}.css。
- App.tsx、main.tsx、editor/Editor.tsx、experiments/Comparison.tsx 仅改样式接线或标签类名。
- 新增 e2e/cleanup-visual.spec.ts、scripts/audit-css.cjs；design-tokens.spec.ts 将过渡期的别名相等检查改为“旧变量为空、canonical 颜色精确匹配”，保留其他业务、颜色、字体和几何断言，避免自比较的无效检查。
- 更新 DESIGN.md 的当前视觉/信息结构与可选助手边界；三个 HOME-* 文档标记为历史记录；README 改用本轮截图。保留过去任务的截图与测试记录，没有把新照片覆盖成旧阶段的证据。

### 实际验证

- `cd frontend; npm test -- --maxWorkers=4`：最终 **29 文件，192/192，14.82 秒**。
- `cd frontend; npm run build`：**通过，20.32 秒**，包含 TypeScript；既有 Plotly 大 chunk 提示仍在，未升级依赖或宣称 FPS/性能提升。
- `$env:CI='true'; .\.runtime\test-refactor08.ps1 -All`：调用完整 Playwright test，系统 Chrome + 最终生产 dist + 真实隔离 Java/MySQL + 本地协议夹具，**60/60，3.1 分钟**；新 JVM 审计持久化及中断运行恢复检查通过；清理 69 个测试项目。前端使用标准 Node 静态 HTTP 服务原样转发 /api 到测试后端，沿用 05 对长测 Vite 进程退出的处理；没有业务 Mock 或真实模型调用。保留既有测试的空状态边界夹具，不把它冒充后端主流程。
- 轴标题修复后先单独执行新视觉/点击用例：**1/1，6.0 秒**，再进行上述完整 60 项；完整通过后为干净的 README 截图单独重导出四页 **1/1，3.8 秒**。最后强化旧 token 断言，仅测试文件变化，专项 cleanup-visual / design-tokens **2/2，6.1 秒**，新 JVM 恢复检查通过，清理 2 个测试项目。
- 1440×1000 的首页/实验/数据/编辑器截图前后各四张。**26 个关键元素**的 box、字体、字号、行高、圆角、内边距和 display 与本任务开始前完全一致，严格几何断言已纳入 E2E；截图也已目视检查。阶段 02 后的外壳/Inter 字体保持；04 首页和 05 工具栏的既定变化保留。示例项目、文件和数据明确为合成演示，ID/时间属于重新导出的真实夹具。
- [保护范围与几何证据](test-evidence/refactor08-contracts.json)：对照 5f197f0，backend、lib、AgentAssistant、Workbench、model/plot-core/plot、评估/混淆矩阵/PDF、会话与恢复源码未变。两个空状态/对比标签与 App 的改动已按允许的呈现替换逐字比对。
- 本机 5176 与 8086 /api/health 均返回 local-only / ok，没有重启用户服务或清理用户主库。README 本地文件链接检查无缺失。
- **未执行**：本轮没有重新运行 Java 单元/集成测试、真实模型评测、付费模型或 Pages 部署；07 静态页无变化，不重复其四宽检查。真实 Java/MySQL 的浏览器与重启恢复验证如上，不等于本轮重跑了 Java JUnit。

### 过程修正、偏差与视觉边界

首次四页对比发现移除组件 !important 后，标题框恢复默认内边距，导致编辑器工具栏高 18px；改用明确的组件选择器恢复原尺寸，没有加回组件 !important。初步单测 192/192、构建及两轮四页检查均通过后，再执行全量。

全量首轮 **59/60，3.2 分钟**：唯一失败是减少动态效果下导航过渡仍有极短时长，原断言要求 0s。恢复为完全关闭，原断言不变。第二轮 **59/60，3.4 分钟**：导航已通过，新增真实轴标题点击断言暴露 Plotly 的 pointer-events:none，使原选轴回调收不到点击。保留运行时标题类并仅补 pointer-events:all，未改 FigureCanvas 的回调或任何绘图业务。普通真实 click（无 force）单独通过后，最终完整 **60/60**。没有删除或放宽已有断言、增加重试或把失败计作通过。

任务文件认为 page-eyebrow 已无使用者，实际有两处，因此先改为现有 lf-kicker；额外补齐上述轴标题 CSS 入口并增加回归检查。这是与清理步骤的具体偏差。少量旧近似 UI 色统一到状态/文本 token；图中的数据颜色、字体与统计继续来自图表配置。本次没有重设计首页或增加图表/模型能力。

四页当前图：[首页](screenshots/refactor-08-after-home.png) · [实验](screenshots/refactor-08-after-experiments.png) · [数据](screenshots/refactor-08-after-data.png) · [编辑器](screenshots/refactor-08-after-editor.png)。对应 before 图片和 JSON 留在同目录。需要人决定的事：08 无新增；07 已记录的许可证选择与公开部署仍由所有者处理。本地提交、不推送，08 后停下。

### 本轮重构总览

以下汇总历史各任务真实记录，具体命令、失败和补跑保留在后续对应章节；不是在 08 重新执行了所有历史测试。

| 任务 | 前端单测 | 构建 | 浏览器 / 其他验证 |
| --- | --- | --- | --- |
| 00 基线 | 162/162 | 通过 | 全量 53/53；Java 未跑 |
| 01 图表修复 | 175/175 | 通过 | 全量 56/56；Java 171 运行、170 通过、1 按开关跳过；SVG/PDF 检查 |
| 01c 图表观感 | 180/180 | 通过 | 相关 15 条均有通过记录（14 + 单独 ROC 1），未宣称同轮全量全绿；三图导出检查 |
| 02 token | 180/180 | 通过 | 全量 57/57，后续专项 6/6、截图 1/1 |
| 01d 比例与色条 | 183/183 | 通过 | 图表/评估/分类 7/7；混淆矩阵与 ROC 重导出 |
| 03 外壳和页面 | 183/183 | 通过 | 全量 58/58；390px 页面与导航几何 |
| 04 首页 A | 190/190 | 通过 | 专项 11/11；真实图预览与助手预填不自动请求 |
| 05 编辑器拆分 | 192/192，各块验证 | 通过 | 最终全量 58/58；草稿/保存转译比对、两页冲突与菜单 |
| 06 助手布局 | 192/192 | 通过 | 专项 12/12；1440/1280 几何与恢复 |
| 07 独立站 | 192/192 | 通过 | 静态页四宽 4/4；后续仓库链接补充亦 4/4；未部署 |
| 08 清理 | 192/192 | 通过 | 最终全量 60/60 + 强化 token/截图专项 2/2；CSS 指标与四页比对 |

已知的图形变化来自 01/01c/01d：旧分组图重开会获得区分组色与更短图例；可选 legendMetric 显示真实 AUC/AP，缺少该字段的旧图不自动补写；ROC 仅渲染时等比例、PR 不锁比例；矩阵副标题/计数色条与定位修正。数据版本和已存画布尺寸不被这些显示修复改写。08 只清理 UI 样式并恢复已有交互入口，没有再次改动这套科学绘图逻辑。

## 任务 07 补充：指定 GitHub 仓库（2026-10-23）

按所有者回复，将展示页导航、首屏和启动区三处 GitHub 入口设为 https://github.com/chen0206a/labflow-agent。仓库地址已实际打开核对；当时仓库为空，保留页内启动指南，不添加不存在的 README 页面链接。同步 LANDING-SITE 文档；许可证继续待定，不修改本地 remote，不推送或发布。

验证：node scripts/test-site.cjs **4/4 尺寸通过**，增加指定仓库三处链接的精确断言，保留锚点/图片/网络/token/无溢出断言；更新四张截图及证据。npm test -- --maxWorkers=4 **192/192，15.66 秒**；npm run build **通过，21.25 秒**。未修改产品功能、后端或助手逻辑，未重跑 Java 或模型评测。

## 任务 07：独立静态展示页（2026-10-23）

从 refactor/reference/site 复制为根目录 site，保留独立单文件结构；用真实编辑器截图替换手绘工作台，其余图型/助手流程明确标注为示意。页面 UI 使用 --lf-* token、Inter/JetBrains Mono 与系统中文回退。新增 .github/workflows/pages.yml（main 的 site/workflow 变化或手动触发），没有部署 React 应用。

事实核对：实际只读 Java catalog 返回 **3 read / 10 preview**，Config.type 为 **11** 类，证据 docs/test-evidence/refactor07-facts.json。补全六类导入格式；明确 PDF 内置嵌入字体、SVG 文本、PNG DPI 的区别；模型授权发送与潜在计费边界如实表述。删除未在本轮重跑的 Java/模型评测旧数字，保留最新的 192 项前端单测和 12 项助手/连接/首页专项。启动命令与 README 一致；更新 README 旧图廊描述及截图链接。

实际验证：

- npm test -- --maxWorkers=4：**29 文件、192/192，14.81 秒**。
- npm run build：**通过，19.24 秒**；既有 chunk 大小提示仍在。
- node scripts/test-site.cjs：直接 file URL + 系统 Chrome，**4/4 尺寸通过**，分别 390/768/1280/1440px；scrollWidth 与 clientWidth 相同。图片加载、样式 token、所有可操作锚点有效，无假按钮或在线 Demo；只请求 Google Fonts，0 网络失败、0 页面异常。四张截图 refactor-07-site-*.png；证据 docs/test-evidence/refactor07-site.json。
- 视觉检查发现参考 SVG 仍引用旧 --accent，已统一为 --lf-accent，并新增回归检查后重新导出四张截图。没有用图片着色错误的首轮截图作为最终证据。
- 本任务没有改 React 产品逻辑或后端，未调用模型、未重新执行 Java 测试或真实模型评测。

与任务文件偏差：仓库无 remote、无 LICENSE，不能猜 GitHub 用户名/仓库地址；暂将源码/文档按钮改为真实页内启动与功能指南。许可证保留 [许可证]；未添加部署后的 README 主页链接。需要所有者提供远端与选定许可证，并在 GitHub Settings → Pages 设置 Source 为 GitHub Actions；本轮 **未推送、未执行 Actions、未公开部署**。说明见 docs/LANDING-SITE.md。

01d 与 03–07 的本地验收至此完成，按用户授权停在 07，未执行 08。

## 任务 06：助手停靠面板（2026-10-23）

仅移动 JSX 与调整 CSS：顶部模型/预算摘要，中间对话与提案滚动，底部固定输入、同意与发送，再接确认栏。欢迎区显示原三条建议，产生对话后隐藏；无提案时保留禁用的应用按钮，仅隐藏说明。地址只显示 host，title 保留完整地址；预算摘要增加 3px 进度，不改变计算或额度选择。停靠模式的上下文说明也移入中段，以适配 720px 高度；非停靠模式保留原有输入位置。

实际验证：

- npm test -- --maxWorkers=4：**29 文件、192/192，14.72 秒**；原 AgentAssistant、AgentHistory、agentConversation、agentRecovery 的测试和断言均未修改。
- npm run build：**通过，19.42 秒**，保留既有 chunk 大小提示。
- 隔离 Java/MySQL + 本地协议夹具：agent.spec.ts / model-connection.spec.ts / home.spec.ts / assistant-layout.spec.ts，**12/12，47.0 秒**；新 JVM 审计持久化、运行恢复检查通过；清理 10 个测试项目。没有收费请求或真实用户库清理。
- 新布局 E2E 用真实 DOM 几何验证 1440×900、1280×720 初始建议完整可见，输入/发送不需滚动；长对话后应用/继续可见，仅中段溢出；同意默认未勾选，未确认不改变已存图表。更新 agent-conversation.png、agent-session-budget.png，新增 refactor-06-agent-1440/1280.png。
- 对比 94213eb：remember/start/reconnect/cancel、34 处 hooks、4 个异步 API 回调的转译代码完全相同，见 docs/test-evidence/refactor06-behavior.json；未改后端、预算、存储键、恢复或幂等逻辑。

首轮专项 **11/12，48.0 秒**：新增尺寸检查发现 720px 高度欢迎建议仍被截断。压缩头部/输入留白，把两段会话说明移入中段后，完整专项重跑通过。单测首轮也为 192/192，17.51 秒，构建 23.03 秒。没有删除或放宽几何断言。与任务文件偏差：额外移动会话说明，仅限停靠模式；增加几何验收。需要人决定的事：无。

## 任务 05：编辑器按块拆分（2026-10-22，逐步验证记录）

遵循任务文件逐块移动、验证、独立提交；不改变 DOM、类名和可访问标签，只有第 7 步明确允许的工具栏调整例外。后端、historyReducer、DraftWriter、layoutPatch、buildPlot 和助手状态机不在修改范围。

| 步骤 | 实际命令 | 单测 | 构建 | 浏览器 |
| --- | --- | --- | --- | --- |
| 1 · 公共控件 | `.\.runtime\check-refactor05.ps1 -Step controls`（执行 npm test / npm run build） | 190/190，20.22 秒 | 通过，20.81 秒 | 按任务要求在第 7 步及最终统一回归 |
| 2 · 四个对话框 | 同脚本 `-Step dialogs` | 190/190，20.52 秒 | 通过，19.73 秒 | 同上 |
| 3 · 面板布局 hook | 同脚本 `-Step layout` | 190/190，19.38 秒 | 通过，20.91 秒 | 同上 |
| 4 · 快捷键 hook | 同脚本 `-Step shortcuts` | 190/190，19.59 秒 | 通过，20.15 秒 | 同上 |
| 5 · 保存/导出 hooks | 同脚本 `-Step save-export-final` | 190/190，19.63 秒 | 通过，19.82 秒 | 同上 |
| 6 · 绘图队列 hook | 同脚本 `-Step plot` | 190/190，19.20 秒 | 通过，19.77 秒 | 同上 |
| 7 · 工具栏与保存菜单 | 同脚本 `-Step toolbar` | 192/192，19.54 秒 | 通过，19.52 秒 | 全量 52/58；修正旧首页定位后相关 9/9 补跑通过，58 个唯一用例均有成功记录 |
| 8a · 数据图层左栏 | 同脚本 `-Step data-panel` | 192/192，22.94 秒 | 通过，19.65 秒 | 最终统一回归 |
| 8b · 画布 | 同脚本 `-Step canvas`（npm test -- --maxWorkers=2） | 192/192，26.29 秒 | 通过，20.47 秒 | 最终统一回归 |
| 8c · 底部数据区 | 同脚本 `-Step bottom-drawer`（后续 npm test 均限制 4 workers，断言不变） | 192/192，14.05 秒 | 通过，19.90 秒 | 最终统一回归 |
| 9a · 属性面板外框 | 同脚本 `-Step inspector` | 192/192，14.03 秒 | 通过，19.99 秒 | 最终统一回归 |
| 9b · 图表标签 | 同脚本 `-Step chart-tab` | 192/192，14.36 秒 | 通过，20.34 秒 | 最终统一回归 |
| 9c · 外观标签 | 同脚本 `-Step appearance-tab` | 192/192，14.45 秒 | 通过，20.21 秒 | 最终统一回归 |
| 9d · 序列标签 | 同脚本 -Step series-tab | 192/192，14.70s | 通过，20.58s | 最终统一回归 |
| 9e · 坐标轴标签 | 同脚本 -Step axes-tab | 192/192，14.77s | 通过，19.35s | 最终统一回归 |
| 9f · 注释标签 | 同脚本 -Step annotations-tab | 192/192，14.09s | 通过，19.47s | 最终统一回归 |
| 9g · 状态栏 | 同脚本 -Step statusbar | 192/192，14.17s | 通过，20.25s | 最终统一回归 |
| 10a · 草稿 hooks 与组合外壳 | 同脚本 `-Step draft-final` | 192/192，14.53 秒 | 通过，21.04 秒 | 最终统一回归 |
| 10b · 对话框纯组合 | 同脚本 `-Step composition-final` | 192/192，14.66 秒 | 通过，20.51 秒 | 最终统一回归 |
| 10c · 最终组合边界与画布适配 | 同脚本 `-Step boundary-verified` | 192/192，14.29 秒 | 通过，20.37 秒 | 完整生产构建 E2E 58/58，3.2 分钟；新 JVM 审计恢复通过 |

本步仅把 Section/Text/NumberInput/Select/Toggle 原样移到 `editor/workbench/controls.tsx`，没有改动行为。后续步骤逐项追加结果。

步骤 2 把 Recovery/Conflict/Export/VersionHistory 四个 Dialog 原样移出，props 明确列举所需值和回调；原始图表/历史快照及布局状态补充静态类型，不改变解析和运行行为。首轮构建发现抽取时把可空草稿推窄、历史查询推成成功态，已恢复 ChartDraft|null 和完整 UseQueryResult 类型后重跑通过。

步骤 5 保存/导出函数转译后的 JavaScript 与 04 基线相同（仅 p 字段拆为独立参数、PDF 动态 import 调整相对目录）；静态比对脚本通过。构建曾提示导出 graph.current 可空，使用不改变运行行为的非空类型断言后重跑通过。提取辅助脚本的范围和简写属性识别错误已在生成时纠正，未纳入产品或提交。

步骤 6 原样保留 deferred config、drawn.current、plotReady.current 的串行队列和 Plotly 点击/图例点击选中逻辑。首轮构建提示画布与统计底栏仍读取 rendered/renderConfig，因此 hook 额外返回这两个只读快照，重跑通过；没有改变队列调度或导出等待。

步骤 7：面板开关使用 PanelLeft/PanelRight 并保留 name/aria-pressed；另存副本移到保存旁的语义菜单，支持方向键、Esc、外部点击关闭；标题输入区加宽。新增两项菜单单测、两项真实浏览器兼容用例。静态类型修复 History 与 DOM History 的同名冲突。仅工具栏 CSS 作任务明确允许的修改。

完整命令 `$env:CI='true'; .\.runtime\test-refactor03-stable.ps1 -All`：**52/58 通过，14.3 分钟**；6 个失败均为 04 后 delivery/experience/refinements 仍按旧首页图表名称寻找按钮（2+3+1），没有失败于图表或保存逻辑。新增统一 home-navigation 测试辅助，根据最新图继续编辑卡片/旧图列表做等价定位，保留所有业务断言。隔离流程补跑 `test e2e/delivery.spec.ts e2e/experience.spec.ts e2e/refinements.spec.ts e2e/editor-compat.spec.ts`：**9/9 通过，1.0 分钟**，新 JVM 恢复检查通过。本轮不宣称同一次完整套件全绿；最终拆分结束后再跑完整套件。两轮分别清理 67 / 9 个测试项目。新增用例实际验证点击曲线选序列、指针拖拽面板、菜单无隐式保存，以及两个真实标签页 v1/v2 冲突保留草稿。截图 `docs/screenshots/refactor-05-editor.png`。

任务文件提到 refinements 的“另存副本”需要改成菜单，但实际该调用位于冲突 Dialog 内，必须保留其按钮与流程；因此该断言不变，另外新增菜单 E2E。无后端或助手业务修改。

步骤 10a：Editor.tsx 只留查询和加载外壳（77 行），状态组合移到 workbench/Workbench.tsx。草稿采用同文件中 useEditorDraft（种子与恢复状态）和 useDraftPersistence（写入/离开保护）两个阶段，避免在 history/name 初始化前读取它们；不是改为新的草稿协议。对照 04 基线，离开保护、DraftWriter 生命周期、自动保存调度三段 effect 转译后的 JavaScript 完全相同，证据见 `docs/test-evidence/refactor05-draft.json`。不改 DraftWriter 或 historyReducer。共享类型收在 types.ts；移除新拆组件重复的样式副作用导入，CSS 仍由编辑器根模块加载。Workbench 此时 459 行，继续抽出纯对话框组合以达到最终 400 行上限。

最终结构：额外提取无状态的覆盖层组合、助手接线、来源条及画布自适配 hook；助手自身请求/状态机代码不变，画布 ResizeObserver effect 仍处于视图持久化 effect 之前。Editor.tsx **77 行**、Workbench.tsx **397 行**；33 个拆分范围文件全部满足上限。完整逐文件行数见 [REFACTOR-05-FILES.md](REFACTOR-05-FILES.md) / `docs/test-evidence/refactor05-files.json`。重复执行草稿三段 effect 与保存/导出函数的转译代码比对，均与 04 基线一致。

最终浏览器首轮真实输出：开发服务器流程 **26/58 通过、32 失败，3.1 分钟**。第 27 条开始测试前端 5178 退出，后续均连接拒绝；Java 8087 仍正常，Vite stdout/stderr 无退出原因。没有把这轮算作成功，也没有放宽断言。改用同一隔离脚本、同一端口/库/夹具和 Playwright 全部用例，仅把托管前端改为 `vite preview`（已有最终构建，proxy 沿用 server.proxy），同时验证生产构建；没有修改产品代码或用户服务。

最终复验：生产预览首轮 **57/58、3.5 分钟**，仅 PDF 底层测试硬编码开发模块路径失败，实际 PDF 导出已通过；测试改为导入页面实际加载的 PDF 模块，保留原有断言。随后预览服务器再次提前退出（10/58、1.9 分钟，余项连接拒绝）。最终用标准 Node HTTP 静态服务器托管同一 dist，原样转发 /api 到隔离 Java，执行 `CI=true; .\.runtime\test-refactor05-static.ps1 -All`：**58/58 通过，3.2 分钟**；新 JVM 审计持久化、运行恢复通过，清理 67 个测试项目。静态服务器没有业务 Mock 或数据转换。Vite 退出原因未确认；没有把此前失败记作通过。最终单测 **192/192**，构建通过，所有拆分检查通过。未调用收费模型，未修改后端，未重新执行 Java 单测。任务 05 完成。

## 任务 04：真实研究工作区首页（2026-10-22）

按 `refactor/tasks/04-home.md` 替换首页，参考实现按原组件边界分为 HomePage、ContinueCard、HomeSide、HomeTables，另有 homeData 与 token 化 home.css。继续编辑区域使用真实图表配置和不可变数据版本渲染；项目表只显示已有计数，最近图表使用图标，不虚构缩略图、备份时间或项目更新时间。保留搜索/分页/项目切换、空/错/加载状态与本机草稿标记。新增 FigurePreview 并由 StylePreview 共用，保留 style-preview 类名和可访问 busy 状态。

首页助手仅通过路由 state 带入文字；AgentAssistant 只新增可选 initialPrompt 和初始 useState 值，其他状态机/请求/预算逻辑未改。Workbench 首次挂载消费后 replace 清除 state；刷新不重复展开。新单测与真实 E2E 均检查没有 POST agent/runs。未改后端、API、schema、Flyway、原始数据、草稿保存和提案确认机制。

删除旧首页、FigureShowcase 及对应测试/CSS，移除 home-workspace.css 和 experience.css 中已无引用的首页规则，删除 showcase E2E、public/showcase/ 与 scripts/render-showcase.py。首页不再展示第三方示例图，因此不再附带这批 Matplotlib 素材及其许可证说明；未修改其他依赖的许可文件。

实际验证：

- `cd frontend; npm test`：最终 **28 文件、190/190 通过，21.53 秒**；包括新 HomePage 7 项、homeData 7 项及助手预填不启动运行测试。
- `cd frontend; npm run build`：最终 **通过，18.55 秒**，既有大 chunk 提示保留。入口 index 约 565 kB，Plotly 位于独立 FigurePreview 分包约 1,473 kB，没有加入入口；首页使用 lazy 加载真实预览。
- 隔离流程执行 `test e2e/home.spec.ts e2e/home-workspace.spec.ts e2e/navigation.spec.ts e2e/shell-pages.spec.ts e2e/design-tokens.spec.ts e2e/styles-library.spec.ts`：最终 **11/11 通过，46.1 秒**，新 JVM 审计恢复检查通过，清理本轮 21 个测试项目。最后一次托管 Vite 与 Playwright 自启有端口竞争提示，但测试均成功；后续测试辅助脚本已增加就绪等待，产品启动脚本未改。
- 新 E2E 覆盖真实预览、继续编辑、未保存标记、项目搜索/分页与实验/图表联动、助手预填且未发送、history state 消费、刷新后关闭、390/1280/1440/1920 无页面级横向溢出。仅无项目空状态边界明确拦截 GET projects 为空，不对真实主流程、数据、图表、保存或助手接口使用 Mock；避免删除已有项目来构造空工作区。

过程问题如实记录：第一次构建发现 initialPrompt 误加到内部 Surface 类型，已改到 AgentAssistant props；初次浏览器 **5/11 通过**：旧首页选择器与导航按钮断言需要更新，分页夹具搜索 “1” 同时匹配 10/11，另有 3 项暴露共享预览把 aria-busy 和 aria-label 放到不同节点。已分别按新页面等价更新断言、将测试项目编号补零、把 label/role/busy 放回同一预览外层，保留全部断言；随后 **11/11 通过，48.9 秒**，新 JVM 审计恢复检查通过。最后输入框 CSS 优先级修正后再次运行整组复验。最初测试启动时本地 MySQL 尚未运行，未执行浏览器；已使用现有 start.ps1 -SkipBuild 恢复本地服务。

截图 `docs/screenshots/home.png`（1440px，全页，合成演示夹具）已更新。参考代码中的硬编码 UI 尺寸和中性色改用 token；共享预览保留真实 Plotly 尺寸计算。与任务文件偏差：额外按现有组件边界拆开首页，增加 aria-busy 兼容处理；无业务范围偏差。需要人决定的事：无。04 验收提交后按用户授权继续 05。

## 任务 03：统一外壳、拆出数据页与整理实验页（2026-10-22）

按用户“做完 01d 进入 03”的授权执行 `refactor/tasks/03-shell-and-pages.md`。本轮仅调整前端布局、组件组织和对应断言，不修改后端、API、schema、Flyway、实验对比/数据处理/上传逻辑、编辑器历史与草稿，也不修改助手的状态机、预算、幂等或恢复逻辑。

改动文件：

- `frontend/src/styles/shell.css`、`styles/tokens.css`、`main.tsx`：参考外壳样式放在最后加载；统一桌面 64px 通栏顶栏，固定导航项宽度，保留管理项目/模型连接/新建项目按钮与项目选择器；窄屏使用紧凑排列，模型连接只显示图标，补齐新建项目按钮 aria-label。新尺寸集中定义为 token。
- `frontend/src/components/PageHeader.tsx`、`experiments/Experiments.tsx`：用紧凑标题替换工具页标语。实验状态使用 lf-chip 的四种语义色，选择栏明确最多 8 个实验。
- `frontend/src/data/{DataPage.tsx,data-page.css}`、`App.tsx`：原 props、查询键、处理/选图回调保留，DataPage 独立导出；App.tsx 从 771 行降至 545 行，减少 226 行。planner-entry 不再使用内联样式；文件名采用 lf-mono；表格不再将少量列拉满，窄屏仍保留表格内部滚动。
- `frontend/src/experiments/experiments.css`：卡片使用 space-5 内边距，计数不换行，列表预留选择栏高度加 16px，适配 390px 筛选栏、卡片和底栏。
- `frontend/e2e/{home,navigation,design-tokens,showcase,shell-pages}.spec.ts`：保留原业务断言，更新任务明确要求的标题和通栏几何断言；新增真实 Java/MySQL 下的导航位置、紧凑标题、状态标签、底栏间距、文件名字体、表格列宽和两种屏宽截图验证。

实际验证：

- `cd frontend; npm test`：最终 **28 文件、183/183 通过，0 失败，20.95 秒**。
- `cd frontend; npm run build`：最终 **TypeScript / Vite 构建通过，18.71 秒**；既有大 chunk 提示保留。
- 用既有隔离流程执行 `test e2e/shell-pages.spec.ts`：修正后 **1/1 通过，6.6 秒**，新 JVM 审计恢复检查通过。
- 完整隔离 Chrome 回归：`$env:CI='true'; .\.runtime\test-refactor03-stable.ps1 -All` 最终 **58/58 通过，3.4 分钟**，新 JVM 审计恢复检查通过。包含任务指定 navigation 2、experiments 1、seamless 2、home 3，以及新增 shell-pages 和其余编辑器/助手/导出用例。既有 teardown 清理本轮 67 个测试项目。
- `rg -n 'style=\{' frontend/src/data/DataPage.tsx` 与旧工具页标语全文检查均无匹配；`git diff --check` 通过。后端、Editor.tsx、AgentAssistant.tsx 没有本轮改动。未执行 Java 单元/集成测试（后端未改）；未执行真实模型评测或调用收费模型。

过程问题与修复：首轮新页面检查在 390px 下发现旧 `.app-shell { min-width:1120px }` 造成横向溢出；外壳覆盖为 min-width:0，并补齐数据操作区与实验卡片换行后复验通过。第一次完整回归 **57/58 通过**，唯一失败是旧 showcase 测试仍断言首页顶栏宽 1200px，实际已按任务改为通栏 2560px；将断言等价更新为宽 2560px、左侧为 0，保留居中检查后复跑完整套件。没有删除断言或放宽重试配置。

第二次完整运行 **38/58 通过、20 失败**：隔离 Vite 服务 5178 在运行中退出，首个失败页面显示 Failed to fetch，随后均为 ECONNREFUSED；Java 8087 仍正常，既有 teardown 已清理本次 49 个测试项目。改用忽略目录 `.runtime/test-refactor03-stable.ps1` 托管带 CI=true 的隐藏 Vite 进程并由 finally 停止，其他测试、后端和清理流程保持原脚本一致。未修改产品代码来处理测试服务退出。

截图与证据：实验页、数据页分别保存 1440px 与 390px 全页截图，见下表；1280/1920px 下首页→实验页→数据页的 brand/nav/header 坐标完全一致，几何记录见 `docs/test-evidence/refactor03-shell.json`。两种屏宽均无页面级横向溢出，滚动到底后最后一张实验卡片不被选择栏遮挡。截图内为明确标注的合成演示夹具。

| 页面 | 1440px | 390px |
| --- | --- | --- |
| 实验记录 | [截图](screenshots/refactor-03-experiments-1440.png) | [截图](screenshots/refactor-03-experiments-390.png) |
| 数据管理 | [截图](screenshots/refactor-03-data-1440.png) | [截图](screenshots/refactor-03-data-390.png) |

工作区核对：主库 projects107 / charts181 / dataset_versions172 / experiments13 / agent_runs9 / agent_sessions0 与开工前一致；用户端口 5176 健康检查 ok。测试生成的无关既有附件已还原。

与任务文件的偏差：参考 CSS 额外处理了旧样式的最小宽度和优先级，并增加窄屏排列及独立 E2E；没有改变业务行为。需要人决定的事：无。用户随后明确授权连续执行 03、04、05，03 独立验收提交后继续 04，完成 05 再停。

## 任务 01d：ROC 等比例、矩阵色条贴近（2026-10-22）

按用户追加要求完成并独立提交，然后继续已授权的任务 03。改动 `frontend/src/editor/plot-core.ts`、`encoding.test.ts`、`frontend/e2e/chart-corrections.spec.ts`，补记 `refactor/tasks/01d-chart-aspect.md`，另新增本轮图像、SVG/PDF 与导出证据。

- 仅 ROC 在渲染时给 Y 轴 scaleanchor=x / scaleratio=1 / constrain=domain，X 轴 constrain=domain；PR 不变。配置与 760×500 画布尺寸不写回、不迁移。
- 存在 scaleanchor=x 和 marker.colorbar 时，按用户指定 w/h/side 公式计算色条 x、xanchor、len；对无有效绘图区的情况跳过，避免除零。矩阵格子与计数不变。
- 单测新增 3 项：ROC 等比例且配置不变、PR 未锁比例、760×500 矩阵色条 x<1 并符合公式。浏览器补充实际轴长度相等和色条与格子间隙小于 60px 检查。

实际验证：`cd frontend; npm test` **28 文件、183/183 通过，14.53 秒**；`npm run build` **通过，16.80 秒**（既有大 chunk 提示保留）。使用既有隔离流程执行 `test e2e/chart-corrections.spec.ts e2e/evaluation.spec.ts e2e/classification.spec.ts`，**7/7 通过，28.8 秒**，脚本退出码 0，新 JVM 审计恢复检查通过；未调用收费模型，清理 7 个测试项目。

重新导出混淆矩阵与 ROC PNG / SVG / PDF；两份 PDF 均 1 页、0 栅格图片，保留 Count / n=7 / AUC=0.750，使用 Poppler 渲染后逐张目视确认格子/ROC 正方形、色条贴近、标签无遮挡。证据在 `docs/test-evidence/refactor01d-exports.json`，截图为 `docs/screenshots/refactor-01d-confusion.png`、`refactor-01d-roc.png`。其他测试生成的既有附件已还原。

与请求偏差：无；额外校验导出 PDF，未改数据、后端或 schema。需要人决定的事：无。按用户明确授权接着执行任务 03。

## 任务 02：统一设计 token、移除暖纸层与衬线字体（2026-10-22）

完成 `refactor/tasks/02-design-tokens.md`。以参考实现建立 `frontend/src/styles/tokens.css`；Inter / JetBrains Mono 为 UI 字体，中文使用系统回退。旧变量只在 token 文件中作为别名定义，移除 styles.css 的暖纸 root 以及首页、工作台、弹窗、experience 中发现的额外覆盖。保留原有选择器与组件结构。移除 Newsreader 导入和依赖，锁文件只删除对应包；没有升级其他依赖。

改动文件：

- `frontend/src/styles/tokens.css`、`main.tsx`、`styles.css`、`package.json`、`package-lock.json`。
- `frontend/src/components/{navigation,refinements,experience,home,home-workspace,showcase,chart-planner,model-connection}.css`、`frontend/src/experiments/experiments.css`、`frontend/src/processing/processing.css`：将近似中性色、白色表面和已有蓝色交互态机械映射到 token；保留布局与动效声明。深色首页卡片使用反色文字 token，说明文字对比度为 10.31:1。
- `frontend/e2e/design-tokens.spec.ts`：新增真实 Java/MySQL 四页 1440px 截图、字体/变量继承、导航和内容横向几何位置、标志可见、无横向溢出及保存配置不变检查；截图等待首页示例图片完成解码。
- `frontend/e2e/showcase.spec.ts`：仅将两处颜色断言更新为 token 值：主卡片背景 `rgb(24,24,24)` → `rgb(14,17,22)`；普通卡片标题 `rgb(23,23,23)` → `rgb(14,17,22)`，白色断言不变。
- `frontend/e2e/home-workspace.spec.ts`、`home.spec.ts`：保留断言，改为自行创建真实分页项目及带数据/图表的首页夹具，使其可独立运行。
- `scripts/check-refactor02-tokens.mjs`、`docs/test-evidence/refactor02-{tokens,before,after,comparison}.json`、`docs/screenshots/refactor-02-{before,after}-{home,experiments,data,editor}.png` 及本记录。

实际验证：

- `npm.cmd uninstall @fontsource-variable/newsreader --ignore-scripts --no-audit --no-fund`：成功，仅移除 1 个包。
- `cd frontend; npm test`：最终 **28 文件、180/180 通过，0 失败，10.90 秒**。
- `cd frontend; npm run build`：最终 **TypeScript / Vite 构建通过，11.65 秒**。既有大 chunk 提示仍保留。
- `$env:CI='true'; .\scripts\test-agent.ps1 -All`：**完整 Chrome 57/57 通过，3.6 分钟，退出码 0**，新 JVM 审计恢复检查通过。包含任务指定的 navigation **2/2**、editor **2/2**、experience **3/3**；同时覆盖助手、草稿、保存/恢复、图表和矢量导出。运行使用隔离 `labflow_e2e` 和本地协议夹具，没有调用收费模型。
- 最终深色文字 token 修正后，用同一隔离流程执行 `test e2e/design-tokens.spec.ts e2e/home.spec.ts e2e/home-workspace.spec.ts e2e/showcase.spec.ts`：**6/6 通过，16.9 秒，退出码 0**，新 JVM 恢复检查通过。其余产品逻辑没有改动，未再次重复整个套件。
- 补上异步示例图片解码等待后，单独再执行 `test e2e/design-tokens.spec.ts`：**1/1 通过，8.3 秒**，重新生成四页最终截图及几何证据，恢复检查通过。
- `node scripts/check-refactor02-tokens.mjs`：**通过**。按任务 00 的六位十六进制正则计数，从 **417 → 276 种，减少 33.8%**（包含新增 token 文件）；三种正文色在白底/应用底色上的最低对比度 **5.29:1**；反色主/次文字在深底上的对比度 **18.91 / 10.31:1**。对照起点 `529ff1b`，原有 15 个 CSS 文件的 **2,570 条布局、尺寸及动效声明全部未改**。
- `rg -n 'Newsreader|font-serif' frontend/src`：仅剩 token 文件内未使用的 `--font-serif` 兼容别名，符合任务例外；Newsreader 不再加载。editor 专用 CSS、stylePresets、plot-core、后端、API/schema、Flyway、草稿与助手状态/预算逻辑未修改。

截图对比：改动前先在隔离库留存四页截图。参考 token 的默认 14px / 1.5 会让既有内容略收紧，因此为当前正文保留 token 化的 15px / 1.6，避免此任务改变布局。最终同数据规模的四页容器 x/y/宽/高及导航高度与基线完全一致；数据页文件名列表由衬线改为无衬线，另有预期的少量色彩、圆角与阴影调整。截图与几何结果见 comparison / before / after JSON。完整套件中其他测试项目会暂时增加首页列表高度，最终截图在清理后单独生成，未使用前端 Mock。

过程问题如实记录：最终首页补跑第一次 **5/6**，旧分页测试要求至少 12 个项目，独立运行时只有 2 个；补齐独立夹具后再次 **5/6**，旧首页导航测试取最新的空项目，导致没有绘图器。已分别改为各用例自行创建项目/数据/图表，保留全部业务断言，随后得到上述 **6/6**。这两项属于原有测试的顺序依赖，不是通过放宽断言规避 UI 回归。本轮预先将旧测试截图保存到忽略目录，再生成新文件，未出现上一阶段的 PNG 覆盖错误；所有无关的既有截图和导出附件均已还原。

边界与偏差：为维持现有布局，参考 token 补充了正文行距 token；为满足深色文字对比度，使用反色语义 token。除任务点名的第一块覆盖外，还清掉了实际存在的同类覆盖，避免旧变量继续漂移。增加自包含测试夹具与可重跑的样式审计，不改产品功能或组件结构。未执行 Java 单元/集成测试（本轮无后端修改；浏览器测试仅打包既有后端）；未执行真实模型评测。核对主库为 projects107 / charts181 / dataset_versions172 / experiments13 / agent_runs9 / agent_sessions0；隔离库清理后 projects1 / agent_runs0 / agent_sessions0。用户服务 5176 健康检查 ok，未重启用户服务。需要人决定的事：无。任务 02 完成后停止，未开始 03。

| 页面 | 改动前（1440px） | 改动后（1440px） |
| --- | --- | --- |
| 首页 | [截图](screenshots/refactor-02-before-home.png) | [截图](screenshots/refactor-02-after-home.png) |
| 实验页 | [截图](screenshots/refactor-02-before-experiments.png) | [截图](screenshots/refactor-02-after-experiments.png) |
| 数据页 | [截图](screenshots/refactor-02-before-data.png) | [截图](screenshots/refactor-02-after-data.png) |
| 编辑器 | [截图](screenshots/refactor-02-before-editor.png) | [截图](screenshots/refactor-02-after-editor.png) |

## 任务 01c：图表默认观感修正（2026-10-22）

已合并 `refactor-01c.zip` 中的任务文件与补丁（两个文件均与 ZIP 逐字节哈希一致）。执行 `git apply --3way refactor/patches/01c-chart-polish.patch`；仅 `plot-core.ts` 的导入冲突，手动保留上一轮 `traceEncoding / EncodingContext` 的分面配色逻辑，并移除 `groupLegendTitle`。未修改后端、API/schema、Flyway、编辑器历史/草稿或助手状态与预算逻辑。

改动文件：

- `frontend/src/editor/plot-core.ts`、`encoding.ts`：去除行内图例标题；仅存在可见图例项时显示图例并计算其顶部空间。
- `frontend/src/editor/confusion.ts`：格子、色条及文字对比度统一使用五级蓝阶；轴比例锁定为正方形，背景色 2px 分隔线；无分组时副标题为 `Model A · n=7`。
- `frontend/src/editor/model.ts`：实施可选项，仅新建配置的轴标题首字母大写、下划线换空格，字段映射和已保存标题不变。
- `frontend/src/editor/encoding.test.ts`、`model.test.ts`、`frontend/src/processing/processing.test.tsx`：更新/补充图例、蓝阶、正方形、无图例边距及新旧轴标题测试。
- `frontend/e2e/chart-corrections.spec.ts`、`processing.spec.ts`、`publication.spec.ts`：更新真实浏览器断言，覆盖区间带完整性、矩阵格子几何尺寸、副标题间隙、稀疏区间告警和普通热力图顶部边距。实际热力图用例在 `publication.spec.ts`，因此除任务指定四个 spec 外补跑该文件及 `evaluation.spec.ts`。
- `docs/screenshots/refactor-01-{sem,confusion,roc}.png`、`docs/exports/refactor-01-{sem,confusion,roc}.{svg,pdf}`、`docs/test-evidence/refactor01-exports.json`：替换验收附件；另纳入本次两份 `refactor/` 文件和本记录。

SEM 断带结论：原始合成样例中 **Method A / epoch 3 只有一次有效运行，n=1 无法计算 SEM，断开正确，并非绘图 bug**。原始 `samples/synthetic-grouped-runs.csv` 没有改动；验收夹具显式增加两条合成运行后再交给真实 Java 聚合，每个点有三次有效运行。图中两条区间带均覆盖 epoch 1–3；Y 轴明确标注 `Accuracy (mean ± SEM)`。另保留既有缺失上下界单测，并在独立 processing E2E 中验证缺失区间不跨点补画，编辑器底部显示「1 行区间数据缺失或不适用于对数轴，区间带在此断开」。没有为真实数据补造误差或改写统计计算。

实际命令与结果：

- `cd frontend; npm test`：**28 文件、180/180 通过，0 失败，13.34 秒**。
- `cd frontend; npm run build`：**TypeScript 与 Vite 构建通过，17.11 秒**。首轮发现新增测试对象的字段类型被推宽为 string，已增加 Dataset 类型声明后重跑通过；既有大 chunk 提示仍在。
- `$env:CI='true'; .\scripts\test-agent.ps1 -All`：完整 Chrome 首轮 **55/56 通过，4.2 分钟**；唯一失败为移除图例标题后 SEM 演示图未再显示 SEM 口径。已将该说明放进演示图 Y 轴标题并重跑。此处不宣称整套 56 项同轮全绿。
- 隔离脚本复用原 `scripts/test-agent.ps1` 的建库、后端、协议夹具和清理流程，仅在忽略目录 `.runtime/test-refactor01c.ps1` 将 Playwright 选择器设为 `test e2e/chart-corrections.spec.ts e2e/classification.spec.ts e2e/processing.spec.ts e2e/professional.spec.ts e2e/publication.spec.ts e2e/evaluation.spec.ts`。首次补跑 **12/15 通过，1.1 分钟**；3 项均在覆盖已有 PNG 时出现 Windows `UNKNOWN: unknown error, open ...png`，未失败于图表断言。保留旧截图到 `.runtime` 后再次执行，**14/15 通过，56.6 秒**，剩余 ROC 同样为旧 PNG 覆盖错误。
- 移走旧 ROC PNG 后，使用同一隔离流程执行 `test e2e/chart-corrections.spec.ts --grep "new AUC/AP"`：**1/1 通过，9.9 秒，脚本退出码 0**；新 JVM 审计恢复检查通过。最终相关 **15 条用例均有成功记录（14 条 + ROC 单独重跑 1 条）**，包含任务指定的 chart-corrections 3、classification 2、processing 3、professional 3，以及补充的 publication 2、evaluation 2。未删断言，也未用重试配置掩盖问题。
- `.\scripts\check-refactor01-exports.ps1`：**通过**。三份 PDF 均为 1 页、0 栅格图像，SVG 无 image，保留预期文字与 SEM 组色；PR SVG 仍有真实 `AP = 0.833`。用 Poppler 重新渲染三份 PDF 并逐张查看，标题、图例、轴标签、副标题及 Count 刻度无遮挡，矩阵格子正方形且文字对比清楚。三张最终 PNG 捕获时间为本日 14:25:24 / 14:25:28 / 14:27:02（SEM / 矩阵 / ROC）。

主库前后均为 projects107 / charts181 / dataset_versions172 / experiments13 / agent_runs9 / agent_sessions0；各轮测试项目已自动清理，隔离库最终 projects1 / agent_runs0 / agent_sessions0。主服务 5176 健康检查为 ok，未重启用户服务或调用收费模型。无关测试截图、导出文件已还原。未另跑 Java 测试（本任务无后端修改；隔离浏览器运行仅打包后端并使用真实 MySQL）。

与任务文件的偏差：仅导入冲突按任务说明手动处理；E2E 使用隔离环境并补跑实际热力图所在 spec。可选轴标题整理已完成。需要人决定的事：无。任务 01c 完成后停止，未开始 02。

重新导出：[SEM 截图](screenshots/refactor-01-sem.png)、[混淆矩阵截图](screenshots/refactor-01-confusion.png)、[ROC 截图](screenshots/refactor-01-roc.png)；[SEM PDF](exports/refactor-01-sem.pdf)、[矩阵 PDF](exports/refactor-01-confusion.pdf)、[ROC PDF](exports/refactor-01-roc.pdf)。

## 任务 01：图表正确性修复（2026-10-22）

完成 A1–A7：分组使用不同颜色，单序列图例只显示组名并以序列名作标题；区间带、点和误差棒使用对应组色；短整数X轴自动步长1，尊重用户刻度/对数设置；混淆矩阵副标题预留空间，计数色条使用整数与英文Count，比例色条使用百分比；新增可选 `evaluation.legendMetric` 开关显示真实AUC/AP；新序列颜色从唯一的stylePresets派生，Clean Academic首色为 `#3568b5`。

前端主要文件：`encoding.ts`、`encoding.test.ts`、`model.ts`、`plot-core.ts`、`facets.ts`、`evaluation.ts`、`distribution.ts`、`empirical.ts`、`confusion.ts`、`heatmap.ts`、`EvaluationPanel.tsx`。后端仅改 `ConfigValidator.java` 的一条布尔校验与 `ConfigValidatorTest.java`，无迁移、API信封或助手/harness逻辑变化。另增加 `frontend/e2e/chart-corrections.spec.ts`、`scripts/check-refactor01-exports.ps1` 及API说明/验收附件。

最终实际验证：

- `cd frontend; npm test`：**28文件、175/175通过，0失败，10.33秒**，包含补丁的11项及新增2项色板/分面回归。短整数轴还覆盖160000个值，避免展开参数超限。
- `cd frontend; npm run build`：**TypeScript与Vite构建通过，13.86秒**；既有大chunk提示保留。
- `mvn.cmd -B -f backend/pom.xml -Dtest=ConfigValidatorTest test`：**10/10通过**。配置测试覆盖缺失、true、false，以及字符串/数值/null/数组/对象等无效开关值。
- `mvn.cmd -B -f backend/pom.xml test`：**171项运行、170通过、1项真实服务评测按开关跳过，0失败/错误，33.556秒**；完整Java回归未调用付费模型。
- `$env:CI='true'; .\scripts\test-agent.ps1 -All`：**完整Chrome 56/56通过，4.6分钟**，新JVM审计恢复检查通过。其中任务指定的 processing **3/3**、evaluation **2/2**、classification **2/2**、editor **2/2**，新增图表修复 **3/3**。新验收通过真实Java/MySQL处理合成逐seed观测，检查组色/区间带/整数刻度、矩阵副标题与色条几何位置、AUC/AP、新旧配置开关状态及保存恢复。
- `.\scripts\check-refactor01-exports.ps1`：**通过**。SEM/混淆矩阵/ROC各导出SVG与PDF，PDF均为1页、0栅格图像，保留预期文字；PR SVG保留 `AP = 0.833`。已用Poppler渲染并人工查看三份PDF，标题、图例、坐标、矩阵副标题及Count刻度清晰，无遮挡。检查结果见 [导出证据](test-evidence/refactor01-exports.json)。

过程问题如实保留：首轮Vite测试服务随标准输入关闭而退出，7项通过后其余49项受连接错误影响；后续运行设置CI=true稳定服务。第二轮52/56通过，2项新夹具误用了未初始化评估配置/未选择PDF支持字体，另外2项在MySQL33316停止监听时失败。已修正新夹具、恢复经路径核实的项目私有MySQL，再完整重跑得到上述56/56；没有放宽既有断言，没有更改数据库配置或统计逻辑。主服务已加载新的校验，保留既有模型连接配置，未向收费服务发请求。

与任务的偏差：前端补丁直接应用；01b仅应用Java部分，API说明手动补入以保留现有内容并避免整份换行重写。另补齐分面中颜色/线型映射的一致性，以及大数组整数刻度边界。可选的ROC 560×560默认画布未实施，画布尺寸保持原规则。演示检查使用隔离测试项目，没有向用户主库seed。已知影响：**旧分组图重新打开后会显示不同组色及更短的图例，属于本轮修复；已保存的非分组颜色不变，缺少legendMetric的旧ROC/PR不自动显示指标或补写配置。**

主库前后保持 projects107 / charts181 / dataset_versions172 / experiments13 / agent_runs9 / agent_sessions0；最终清理50个测试项目后，隔离库为 projects1 / agent_runs0 / agent_sessions0。无关测试生成的既有截图/导出附件已还原。需要人决定的事：无。任务01完成后停下，未开始任务02。

截图：[SEM](screenshots/refactor-01-sem.png)、[混淆矩阵](screenshots/refactor-01-confusion.png)、[ROC](screenshots/refactor-01-roc.png)。导出：[SEM PDF](exports/refactor-01-sem.pdf)、[矩阵 PDF](exports/refactor-01-confusion.pdf)、[ROC PDF](exports/refactor-01-roc.pdf)、[PR SVG](exports/refactor-01-pr.svg)。全部来自明确标识的合成演示数据。

## 任务 00：前端重构基线（2026-10-22）

按用户要求仅完成 `refactor/tasks/00-baseline.md`，未开始任务 01，也未修复业务代码。压缩包中的根 `AGENTS.md` 与 `refactor/` 共27个文件已放入仓库，并逐文件校验与压缩包字节一致；参考代码和补丁只保存，未应用。

实际起点是干净的 `1e4672d`，不是计划内注明的 `77ee2ba + 未提交改动`；仓库不存在任务中提到的 `HANDOFF/工作区状态.txt`。因此快照提交 `0f0325c` 仅纳入新导入的文档包，随后创建 `refactor/frontend` 分支。

实际执行与结果：

- `cd frontend; npm ci`：首次因正在运行的本项目 Vite 占用 `lightningcss.win32-x64-msvc.node` 而 EPERM；验证进程归属后临时停止前端，再执行同一命令成功，安装238个包、审计239个包、0 vulnerabilities。已恢复前端5176，后端/MySQL未重启，锁文件未修改。
- `cd frontend; npm test`：**27文件、162/162通过，0失败，12.65秒，退出码0**。原始输出在 `refactor/baseline-vitest.txt`。
- `cd frontend; npm run build`：**TypeScript与Vite构建通过，10.60秒，退出码0**。既有大chunk提示仍存在，本任务不修复。完整输出在 `refactor/baseline-build.txt`。
- 仓库根目录 `.\scripts\test-agent.ps1 -All`：使用完整Playwright套件、Chrome、本地协议夹具和 `labflow_e2e`，**53/53通过，0失败，3.0分钟**；新JVM审计恢复检查通过，脚本退出码0。初次日志采集因wrapper切换目录导致相对Tee路径失效，改用绝对日志路径重跑，未修改项目脚本；两次执行情况均保留在 `refactor/baseline-e2e.txt`。这属于日志采集错误，不计为应用断言失败。
- CSS按任务相同正则及计数语义，使用PowerShell/rg等价命令复核：**15个CSS文件，7,820行，417种六位十六进制色值，26行包含 `!important`，22行衬线引用**。均与包内参考值一致。逐文件行数、引用位置、可复现命令在 `refactor/baseline-css.txt`。

基线中已失败的应用测试：**无**。本次未执行Java单元/集成测试与真实模型评测（任务00只要求前端基线；后端仅为隔离浏览器测试打包运行）。未调用收费模型。没有修改前后端源码、API/schema、Flyway、依赖清单/锁文件或用户数据；测试生成的既有截图/导出附件已还原。

与任务文件的偏差：使用当前实际提交作为起点；Windows使用等价CSS统计命令；E2E使用已有隔离脚本代替直接对用户服务执行 `npx playwright test`。主库前后均为 projects107 / charts181 / dataset_versions172 / experiments13 / agent_runs9 / agent_sessions0；测试清理47个项目后，隔离库恢复为 projects1 / agent_runs0 / agent_sessions0。需要人决定的事：无。任务00结束后停下。

## 最新增量：扩展导入与用户确认选图（2026-10-22）

新增 CSV/TSV/TXT/XLSX/JSON/JSONL 统一 preview/commit、JSON 多数组显式选择、嵌套字段展开与长整数保护，以及“选择绘图方案”面板。推荐模式只读画像、返回经过字段校验的候选；用户选择后先 lint，再通过既有 charts API 保存初始版本并进入编辑器。协议/边界见 [DATA-TO-FIGURE.md](DATA-TO-FIGURE.md)。

最终结果：

- `mvn.cmd -B -f backend/pom.xml test`：**171 项运行，170 通过，1 项真实服务评测按开关跳过，0 失败/错误，30.022 秒**。新增解析边界、推荐只读隔离、真实 MySQL preview 不落库/commit 规则重放与原文件不变测试。
- `npm.cmd test -- --maxWorkers=2`：**27 文件、162 项通过，28.98 秒**。选图组件覆盖同意、创建前 lint、失败拦截、关闭取消、按请求 ID 只读恢复；映射测试验证真实数据和不生成误差数据。
- `npm.cmd run build`：**成功，18.40 秒**，含 TypeScript 检查。现有图表共享包仍触发大 chunk 提示；选图面板按需加载，未增加依赖。
- `.\scripts\test-agent.ps1 -All`：**53/53 Chrome 流程通过，3.9 分钟**，随后新 JVM 审计恢复检查通过。新增 JSONL→真实 Java/HTTP 工具循环→选择散点→MySQL→刷新→SVG（含真实文字且无 raster image）与多数组 JSON→显式数组选择→手动绘图两条。初轮新增验收脚本的导出点击与 select 定位已修正，以上为最终全量结果。

浏览器模型使用本地确定性协议夹具，不调用付费 API，不代表真实服务的选图质量已验证。主服务更新后原模型配置可用，但本轮没有向其发送推理请求。

部署后真实接口 dry-run 检查：`samples/synthetic-training.jsonl` 解析 12 行、4 字段、0 问题；`synthetic-splits.json` 返回 `/train`、`/validation` 两个路径并要求用户选定。主库更新与预览前后均为 **projects 107 / charts 181 / dataset_versions 172 / experiments 13 / agent_runs 9 / agent_sessions 0**。Chrome 本轮清理47个测试项目；重启检查清理后 labflow_e2e 为 **projects 1 / agent_runs 0 / agent_sessions 0**。测试使用 labflow_test / labflow_e2e，未写入用户主库。

![选图与真实数据预览](screenshots/chart-planner.png)

## 最新增量：会话累计预算、请求幂等与刷新恢复（2026-10-22）

新增会话额度设置（默认180000、单轮最多60000），数据库跨轮预留/结算，取消或中断导致用量不明时保留整轮额度；余额不足在模型调用前拦截。请求ID在发送前生成，同ID同内容不重复调用，不同内容409。刷新/断线通过已有ID恢复运行、近期对话与可信提案基线，不自动重发模型。浏览器只留运行ID，不留密钥、提示词、完整配置或授权勾选。后端重启保留用量/审计，不复活内存提案。规则与限制见 [AGENT-SESSIONS.md](AGENT-SESSIONS.md)。

最终 Java **161项运行、160通过、1项真实服务评测按设计跳过，0失败/错误，31.216秒**。新增5项真实MySQL集成测试验证未知用量消耗预留、预算不足不调用模型、跨轮累计与下轮上限收紧、同请求ID复用/冲突、恢复不调用模型、源保存版本变化去掉候选，以及活跃会话并发拦截。之前的审计事务失败/重试、提案续改与30条回放评测全部继续通过。

前端 **25文件/156通过，29.69秒**；TypeScript/Vite生产构建通过（18.03秒），保留既有约1.60MB编辑器分包提示。新增测试验证浏览器只存ID、数据版本隔离、无视JSON字段顺序比较基线、恢复不重复POST/不恢复授权、当前草稿改变时不能直接应用，以及首次响应丢失后的GET恢复。

完整Chrome **51/51通过，4.0分钟**，无失败。实际经过Java/HTTP/MySQL：在途运行刷新→继续轮询→恢复待确认提案→再次刷新→确认且不自动保存；服务端已执行而浏览器丢失POST响应→重新连接原运行（始终只有一条模型run）；60000会话取消后额度保守耗尽→禁止继续发送→明确开始新对话。截图：[预算设置](screenshots/agent-session-budget.png)。

随后独立Java进程强制中断/新JVM启动验收通过：完整审计逐字段不变，中断会话预留归零、已用等于整轮预留、unknown次数为1，恢复不返回可应用候选或原始基线；测试项目精确清理。本轮全部使用免费本机协议fixture，未调用收费模型，不当成真实模型语义能力评测。

已更新8086后端；部署JAR与最终浏览器构建SHA-256一致：`BC26D2A28C19FDE73FE182CEA95081B5854DCF70AB56DEF44C90B50878EE51B5`。Flyway V7/V8成功，8086健康、5176 HTTP200。普通库前后均 **projects107/charts181/dataset_versions172/experiments13/agent_runs9**，新会话表agent_sessions0（未在普通库发起模型运行）。测试库最后projects1/agent_runs0/agent_sessions0；完整回归清理45个本轮项目。原模型参数与密钥加载进新Java子进程，密钥未落文件/数据库/Git；未额外调用真实模型来刷新连通验证标记。

复现：`mvn -B -f backend/pom.xml test`；前端 `npm test -- --maxWorkers=2` 与 `npm run build`；根目录 `scripts/test-agent.ps1 -All`（51条完整流程及跨进程重启），不带All为15条相关流程及重启。日志：`.runtime/session-java.log / session-ui.log / session-build.log / session-e2e.log`。

## 最新增量：未应用提案连续调整与安全合并（2026-10-22）

提案生成后可以继续对话，服务端继承可信父运行的操作，以最新真实画布为基线合并不冲突的手动修改；重叠修改在调用模型前409拦截。失败/取消/追问保留父提案，成功替代使用独立的 superseded 状态；新增父子关系与历史回溯入口。整组仍只确认一次、撤销一步，不自动保存。Flyway V6 与 prompt v6，契约及限制见 [AGENT-REFINEMENT.md](AGENT-REFINEMENT.md)。

最终 Java **156项运行、155通过、1项真实服务评测按设计跳过，0失败/错误，44.968秒**；前端 **24文件/151通过，28.37秒**；TypeScript/Vite生产构建通过（28.79秒），保留原有约1.60MB编辑器分包提示。新增测试覆盖三轮累计、原来无变化的操作参数仍不能覆盖手动修改、串行续改/决策竞争、取消/追问/失败、跨图表/保存版本限制、撤回所有调整、父子审计同事务回滚与重试，且原始数据与图表版本不变。

浏览器全量最后一次为 **48通过/1失败**：既有48项均通过，新增用例卡在字重下拉框的标签定位。此前也修正了该用例对空输入禁用状态和外观面板切换的假设，没有修改产品规则来迁就测试。改用浏览器实际可访问的 combobox 定位后，最终相关 Chrome **13/13通过，50.2秒**，包含真实Java/HTTP三轮提案→中途手动加粗→一次确认→一次撤销保留手动编辑→重做→保存MySQL→刷新一致。随后独立JVM强制中断/恢复审计测试通过。截图：[累计提案与真实画布](screenshots/agent-refinement.png)。

本轮只使用免费本机协议fixture，未调用收费模型，不能将此结果当成真实模型多轮语义能力评测。独占测试库最终projects1/agent_runs0，相关回归清理12个本轮项目；没有清理普通工作区。

已更新8086后端，部署JAR与最终浏览器使用的构建SHA-256一致（`387ECE9B2B88152696212385A485855EEE483CC23AA0B23AA35F050AD4997D39`），Flyway V6成功；8086健康、5176 HTTP200。原工作区前后均为 **projects107/charts181/dataset_versions172/experiments13/agent_runs9**。原已授权模型连接参数加载到新Java子进程环境，密钥未落文件/数据库/Git；重启后连通验证标记复位为“已配置”，本轮未额外调用模型来刷新验证状态。

复现：`mvn -B -f backend/pom.xml test`；前端 `npm test -- --maxWorkers=2` 与 `npm run build`；根目录 `scripts/test-agent.ps1`（13条相关与进程重启），或 `scripts/test-agent.ps1 -All`（49条完整流程）。本轮日志：`.runtime/refinement-java-final.log`、`refinement-ui-final.log`、`refinement-build-final.log`、`refinement-e2e-verified.log`（全量）、`refinement-e2e-focused.log`（最终相关）。

## 最新增量：网页模型连接与真实连通检查（2026-10-22）

新增顶部工具栏/助手设置入口，配置基地址、模型ID与API Key，测试基础对话与工具调用后应用。测试不替换当前连接；已配置/已验证分开显示；更换地址不自动转发旧Key。密钥仅存Java内存，读取不回显，输入框应用后清空，不进浏览器存储、数据库或文件。网页设置只影响新run，运行中的任务冻结原连接。精简助手中的环境变量文案、重复导语，将步数/token移到折叠运行记录。

最终 Java **149项运行、148通过、1项按设计跳过，0失败/错误，49.824秒**；新增11项测试覆盖真实本机HTTP探测、认证与配额错误、工具格式、密钥不回显、跨来源/非本机拒绝、并发测试、旧凭证、连接冻结。补充无主机/非法端口与空tool_calls的边界；最初边界试跑发现缺主机时空指针，修复后再次全量通过。前端 **24文件/145通过，19.76秒**；TypeScript/Vite构建通过（21.60秒），保留现有大分包提示。

完整Chrome **48/48通过，3.7分钟**；后续弹窗收紧留白、固定操作区并补1280×800与390×844几何检查，相关 **12/12通过，44.1秒**。两次独立JVM中断/恢复审计检查通过。最后地址校验补充由Java全量覆盖，未重复跑无关的完整浏览器集。测试使用本机协议fixture，不调用收费模型；完整测试清理42个本轮项目，关联回归清理11个，均为独占labflow_e2e库。

另对已授权服务做真实固定消息检查，当前模型 `deepseek-v4.1-flash-1017`，详见下方实测记录；不发送项目/图表/字段或数据行，不把连通测试当模型能力评测。窗口截图：[已应用](screenshots/model-connection.png) / [鉴权失败](screenshots/model-connection-error.png)，均为本机fixture测试界面，密钥输入为空或掩码。操作、API字段和安全边界见 [MODEL-CONNECTIONS.md](MODEL-CONNECTIONS.md)。

真实服务记录：初次两条请求检查通过（2258ms，上报545tokens）；最后地址校验更新后重新部署并做两条请求烟测，通过（2592ms，上报562tokens）。本轮合计4条真实服务请求、1107个上报token，不估算或冒充实际账单。最终通过绑定凭证应用同一地址和模型，当前连接显示已验证；未将测试凭证或密钥写入Git。安全摘要保存在本机 `.runtime/model-settings-live-probe.json`、`.runtime/model-settings-live-final.json`。其余测试均为免费本机fixture，不调用真实模型。

最终普通工作区计数仍为 projects107/charts181/dataset_versions172/experiments13/agent_runs9，测试库为projects1/agent_runs0；连接设置与测试没有创建科研数据或审计run。8086健康、5176 HTTP200，部署JAR与最终构建SHA-256一致。复现：`mvn -B -f backend/pom.xml test`、前端 `npm test -- --maxWorkers=2` / `npm run build`、`scripts/test-agent.ps1 -All`（全量）或不带All（12条相关流程）。

## 最新增量：DS 核查问题修复（2026-10-21，prompt v5 / suite v1.5）

Java最终全量 **138 项运行、137 通过、1 项跳过，0 失败/错误，20.740秒**；跳过项为必须显式启用的真实服务评测入口。新增10项回归覆盖通知成本、低预算收尾、保留追问、违规工具调用、无工具HTTP信封、统计断言漏检、CI别名、费用预留与非法参数。前端 **23文件/142项通过**，TypeScript/Vite构建通过（21.57秒），保留现有大分包提示。完整 Chrome **46/46通过，3.5分钟**，另通过独立JVM强制终止后的审计恢复验收。CI别名最后修改只涉及评分用例与测试，未重复运行已通过的浏览器全量。

修复预算通知未计入成本、最后可用工具轮后缺少收尾、预算提示强制跳过澄清、费用阈值先消费后判断、统计断言被无关礼貌用语豁免，以及浏览器提示词版本断言过期。所有修改仍是候选提案，用户确认前不改画布；应用不等于保存，源文件与既有版本保持不变。

新增两个 live 入口共用的调用前预留；失败且 usage 不明时保留预留，配置金额不是服务商账单保证。显式运行服务入口的零消费反例：预算 0.000001、三条用例全部在创建项目前跳过，报告 `completion:budget_limited / spent_tokens:0`，不是三个通过。新版离线回放 **30/30**，见 [报告](evaluations/replay-v1.5.md) / [JSON](evaluations/replay-v1.5.json)，人工录制及usage不冒充模型采样。

已更新本机8086后端，部署JAR与通过Chrome验收的构建SHA-256一致。复用用户已授权的密钥，仅注入Java子进程环境，未落文件。v5真实小批次 N08/C03/C04 原始机械结果 **2/3**、21763个上报token；热力图通过、轴方向先追问、误差定义也先追问但被旧规则漏识别「95% CI」。已补CI别名离线回归且保留 [原始报告](evaluations/live-pilot-v5.md) / [JSON](evaluations/live-pilot-v5.json)，未改写原始分数或额外收费重跑。

真实小批次前后普通库计数一致：projects107 / charts181 / dataset_versions172 / experiments13 / agent_runs9，临时合成项目与审计按精确归属ID清理，既有数据未删除。部署时发现本地PID记录落后于实际LabFlow进程；核对本项目便携Java路径与JAR命令后修正本地记录，未放宽连接脚本的进程归属守卫。

完整浏览器测试使用专用 `labflow_e2e`，结束清理41个本轮项目；进程重启fixture另按精确ID清理。原始历史公网评测按 JSON 核对为 **prompt v3、27/30、169180个token**，文件名 live-v4 不表示提示词v4；保留 [原始报告](evaluations/live-prompt-v3-2026-10-21.md)及 [JSON](evaluations/live-prompt-v3-2026-10-21.json)，不将补测通过改写成原全量通过。

复现命令：`mvn -B -f backend/pom.xml test`；前端目录 `npm test -- --maxWorkers=2` 与 `npm run build`；根目录 `./scripts/test-agent.ps1 -All`。本次测试日志位于 `.runtime/agent-fixes-*.log`。

## 最新增量：评测断言加固与真实调用费用闸（2026-10-21，第 1 步）

Java 全量 **127 项运行、0 失败、1 跳过**（DS 当时记录；随后核查实跑为128项运行/127通过/1跳过），其中评测相关单测/集成 22 项；Vitest **23 文件 / 142 通过**。回放 30/30 机械通过（suite `labflow-agent-eval-v1.3`）。真实调用一次全量 30 条：`deepseek-v4.1-flash-1017`、169,180 token、按当时假设单价估算 **¥1.35**；机械通过 **27/30**（原26/30为笔误）。文件名 live-v4 的提示词实际是 v3；当时费用限制为调用后软阈值。

变更：每条用例加 `expect.limits{max_steps,max_tokens}`，超出记 `SLOW`（与 `mechanical_pass` 分离，报告列 `efficiency_target`）；新增逐句 `no_statistical_claim`（禁止从列名断言标准差/标准误/置信区间）；`reply_rule` 改为逐句匹配，补「没有…权限」「请指明/选定」两类真实说法；`EvaluationRunner` 增加按最坏单价累计的费用闸（`-Dlabflow.eval.maxCostCny` / `-Dlabflow.eval.pricePerMillionCny`），超限停跑并写 `skipped_by_budget`。

真实运行暴露的两类现象已记录在 [AGENT-EVALUATION.md](AGENT-EVALUATION.md)：3 条失败中 2 条是筛查规则缺口（补规则后单测重跑 REVIEW），1 条是模型波动（N08 拆轮撞到 60k 预算 `token_budget`，重跑通过）——单次结果不当作能力结论。回放报告已按 v1.3 重新生成：[replay-v1.md](evaluations/replay-v1.md) / [JSON](evaluations/replay-v1.json)。

## 最新增量：30条双模式评测与运行器（2026-10-21，Step 2d）

Java全量 **121/121，0失败/0错误/0跳过，28.469秒**，包含新增16项评测入口、评分器反例与真实MySQL/本机HTTP集成测试；最终相关回归 **16/16，19.423秒**。入口中的30条固定用例另按逐例报告计数：**12条正常、10条应拒绝、8条应追问，离线机械检查30/30**；不能把30条用例重复加到121项JUnit总数上。回放输出和usage均为人工fixture，不是真实模型采样。本轮没有调用DeepSeek或其他收费模型。

运行器实际经过正式Java Harness、工具定义、整批preview、lint、真实MySQL审计与隔离测试数据；正常用例覆盖10个修改工具及3个读取工具。检查具体修改值、允许变更路径、无关配置保留、原始文件及解析结果/已有图表/版本不变、绑定源版本与指纹、审计落库、预算和终态。拒绝/追问使用专属中文规则初筛且禁止修改尝试；live模式即使机械通过仍标为REVIEW，未宣称已自动判定语义正确。

真实反例：字号90的录制交给Harness后触发整轮撤回，报告FAIL；超额usage触发 `incomplete/token_budget`，无半成品提案。另一集成本机HTTP测试走正式兼容适配器和同一断言，正常PASS、拒绝/追问REVIEW，逐ID对比基线，并验证初始请求不包含预期答案或评分规则。本机服务返回人工输出，不等于真实大模型测评。非法模式、未配置提供方、未知ID、不同套件基线在创建项目之前失败。

`scripts/eval-agent.ps1` 实际全量回放通过；指定 `N01,R01,C03` + Baseline的第二次命令也通过，生成JSON/Markdown及3行对比。评测用精确创建ID清理临时项目和审计，成功/失败路径均验证前后计数一致。普通工作区仍为 **projects52/charts120/dataset_versions100/experiments5/agent_runs0**，API健康、5176页面HTTP200。没有重启或改写用户工作区。

CI配置增加回放报告artifact，远端尚未执行，本轮仅本机验证。源代码全部在测试作用域，没有改动前端/正式API/schema，也未把之前2c的137条前端、45条浏览器回归当作本轮重新运行。实现边界、全部命令和报告字段见 [AGENT-EVALUATION.md](AGENT-EVALUATION.md)，[实际回放报告](evaluations/replay-v1.md) / [JSON明细](evaluations/replay-v1.json)。

## 最新增量：持久审计与决策历史（2026-10-21，Step 2c）

Java **105/105**（0失败/0错误，新增10项审计/MySQL集成测试、4项脱敏单测）；Vitest **137/137、22个文件**；TypeScript + Vite生产构建通过。完整Chrome回归 **45/45，3.6分钟**；随后关联回归 **9/9，35.6秒**，以及独立测试Java进程强制结束→新JVM启动的真实重启验收通过。没有调用真实收费模型。既有编辑器约1.59MB分包提示保留。

Flyway V5新增 `agent_runs`：初始排队标记用于崩溃识别，终态保存模型/提示词/目录版本、源版本指纹、每次工具调用与返回摘要、用量、耗时和提案摘要。接受/拒绝单独使用事务与行锁，重复同一决策幂等；相反决策、伪造指纹、旧保存revision、跨项目访问均拒绝。接受记录不等于图表保存，没有新增chart_versions；浏览器在确认写入期间画布变化时也不会覆盖新草稿。

集成测试实证：数据库内无原始提示词、图表标题、模型回复或原始call_id；字段/标题等自由文本记录长度和指纹，API Key与常见凭据格式被脱敏。初始审计写失败时不调用模型，终态写失败时不返回可应用提案，恢复后重试同一行；竞争接受/拒绝只有一个结果，取消后迟到响应无法覆盖终态。失败和预算耗尽分别保留正确outcome及用量完整标记。

浏览器验收：生成提案 → 接受 → 一步撤销/重做 → MySQL保存刷新 → SVG向量文字；刷新后通过「运行历史」查看已接受记录和脱敏参数。另一条明确拒绝并提交含凭据的原因，刷新后保留可读原因、凭据不可见，已拒绝不能改成接受。所有原有导入、科研图、模板、导航草稿和交付回归通过。

真实进程重启验收：本机HTTP fixture创建一条完整已拒绝审计和一个慢速在途运行；强制终止专用8087 Java进程，新进程从同一MySQL读取，已完成审计逐字段一致，未完成项为 `interrupted/usage_complete:false` 且没有可应用proposal；随后清理专用测试项目。首轮重启脚本的原生fetch调用错误已修正，最终重启验收独立通过，未把失败试跑计为成功。

已目视检查 [审计历史](screenshots/agent-audit.png) 与 [新版提案面板](screenshots/agent-proposal.png)。真实工作区仍为 projects52/charts120/dataset_versions100/experiments5/agent_runs0；测试库清理后projects1/agent_runs0。普通本地工作区不写测试数据；测试使用独立 `labflow_e2e`。当前备份ZIP不携带审计、历史不能直接重新应用，以及接受后浏览器失败的语义均见 [AGENT-AUDIT.md](AGENT-AUDIT.md)。2d的30条双模式评测尚未开发。

## 最新增量：模型适配与 Java 绘图提案循环（2026-10-21，Step 2b）

最终 Java **91/91**（0失败/0错误，包含11项 Agent/MySQL 集成测试、6项本机 HTTP 适配器测试与测试库清理边界测试）；Vitest **131/131，21个文件**；TypeScript + Vite生产构建通过。完整 Chrome回归 **44/44，3.7分钟**，最终代码关联回归 **8/8，30.4秒**。保留既有500kB分包提示，未把它描述为已解决。

新增可选绘图助手：消息/工具定义输入的 provider 接口、Chat Completions HTTP 适配器、带 run_id/步数/token保守预算/总超时/取消/有界队列的 Java循环。模型操作走既有 preview + lint；非法混合批次整轮撤回、错误回灌，最终用户在共用的预览与diff面板确认。用户确认前不改画布和MySQL，确认后一步撤销，保存仍走原有API。图表原始版本、内容指纹、字段与保存revision按现有规则绑定；最后网络校验期间草稿变化也不能覆盖新编辑。

测试实际使用本机 `compatible-provider.cjs` 协议fixture，浏览器 → Java → 真实HTTP请求 → 工具与MySQL读取 → 预览 → 确认 → 撤销/重做 → 保存刷新 → SVG文字/向量检查全部跑通；不使用前端假API冒充后端。另验取消等待响应、超时、队列容量与取消释放、预算耗尽、截断响应、非法列/工具/config注入、跨项目读取与旧revision、超大响应/缺少usage/密钥不出现在配置响应及错误信息中。**未调用真实DeepSeek或其他收费模型，线上兼容性尚未验收**。

核查2a时修复清理边界（独立提交 `0646cd1`）：普通启动不再默认开启按ID水位删除；即使误开启，正式 `labflow` 库仍在任何SQL前被403拒绝。补充修复不存在路由/不支持方法被统一包装500的问题，实际返回404/405，并以关闭测试开关时的DELETE404固化边界。新测试脚本用独占 `labflow_e2e` 库、独立构建目录和8087/5178/18769端口，完整回归清理39个本轮项目，最终关联回归清理8个；库里保留1个测试基准项目。真实工作区仍为 **projects52 / charts120 / dataset_versions100 / experiments5**，与DS交接计数一致。

已目视检查 [助手提案截图](screenshots/agent-proposal.png)；1280×800下确认按钮仍在视口内。运行命令、模型环境变量、数据发送范围、API与尚未完成的2c/2d见 [AGENT-PROVIDER.md](AGENT-PROVIDER.md)。本轮运行摘要只存内存，完整持久审计、接受/拒绝记录以及30条双模式评测均未宣称完成。

## 最新增量：只读规范/校验与测试隔离（2026-10-21 晚，Step 2a）

以下为DS交接的历史记录；其中“普通启动默认开启清理、按水位即可安全清理”的策略已在上方2b核查中修正，不能作为当前运行指引。

Java **73/73**、Vitest **124/124（20 个文件）**、完整 Chrome E2E **42/42（3.2 分钟）**、`tsc -b --force` 通过；本次新增 3 项 Java，前端未新增单测（改动集中在测试基建）。仍未接模型、未使用付费 API。

新增两个只读能力：`GET /figure-tools/spec`（`get_figure_spec`，十一类图的必填/可选角色、所需专业配置块、固定 X 类型与硬规则，纯静态）与 `POST /projects/{p}/figure-tools/lint`（`lint_figure`，直接包现有 `validateAndReport`）。lint 把校验失败变成数据：配置不合法返回 `200 {ok:false, issues:[{code:"invalid_figure", message}]}`，消息与保存时报错一致；协议、信封、跨项目、旧 revision 仍按 400/404/409 拒绝；两种情况下都不写图表、版本或数据。目录里新增 `read_tools`，把 `get_figure_spec`、`lint_figure`、`get_dataset_profile` 标成 `category: "read"`，与十个可预览工具分开。

原子性这次被显式守住：一次 `operations` 在深拷贝上全部应用后只校验一次，任一失败返回 400、不返回半成品；已保存图表的失败批次不 bump `revision`、不新增 `chart_versions`。集成测试 `aMixedBatchIsAllOrNothingAndLeavesNoPartialPreview` 用「混合批次 400 → 单独提交其中合法项仍成功 → 图表 revision 与版本数不变」三段断言固化这条语义。

测试污染已根治：E2E 增加 `globalSetup`（读 `/api/projects` 记录当前最大项目 id 作为水位）与 `globalTeardown`（调 `DELETE /api/test/projects?after=<水位>` 删除本次新建项目）。该接口只在后端以 `--labflow.test-support=true` 启动时注册（`scripts/start.ps1` 已默认传入），并要求 `X-LabFlow-Test-Run: 1` 且 `after >= 1`；未启用时整个控制器不注册、路由 404，teardown 只打印提示不报错。本轮实跑清理了 **37 个**测试项目，运行前后 `projects 52 / charts 120 / dataset_versions 100 / experiments 5` 完全一致，6 个演示项目（id 5/95/108/134/167/194）保留。需要保留现场时用 `LABFLOW_E2E_KEEP=1`。

边界：`lint_figure` 一次只报第一条问题（`validateAndReport` 遇错即抛，未改造成收集式校验）；`get_figure_spec` 不返回默认值，默认值只在前端 `model.ts`，避免两套默认值漂移；新建向导仍未做。下一步（模型适配、审计、评测）见 [Agent 路线图](AGENT-ROADMAP.md)。

## 最新增量：结构工具与数据画像（2026-10-21 晚，Asia/Tokyo）

Java **70/70**、Vitest **124/124（20 个文件）**、完整 Chrome E2E **42/42（3.2 分钟）**、TypeScript（`tsc -b --force`）与 Vite 生产构建通过；保留既有大分包提示（编辑器分包 1.58 MB）。本次新增 3 项 Java、9 项前端与 3 条真实浏览器用例；仍未接模型、未使用付费 API。

工具面从 5 个外观工具扩到 10 个，目录用 `categories` + 每个工具的 `category` 分出「外观 / 结构」。新增 `set_chart`、`set_mapping`、`map_series`、`add_series`、`remove_series`：只改“图读哪几列、有几条序列”，不代造专业配置——切热力图缺 `heatY/heatZ`、切 ROC/PR 缺评估、切混淆矩阵缺分类配置都直接 400；`add_series` 的 `id` 由调用方给、服务端只查重，新序列深拷贝既有首条序列的外观再改 `id/y/name/error`，因此不会引入第二套配色；`remove_series` 拒绝删到 0 条，也拒绝删被分类评估引用的序列。新增只读 `GET /projects/{p}/data/{id}/profile`，直接返回导入时算好的字段画像与前 10 行，不重算、不重读原文件、不写库。

修复一处真问题：目录的 `minProperties` 原先对 `set_chart`/`add_series` 要求“必填之外再加一项”，界面因此连清单都加不进去（首轮 E2E 6 条挂 2 条即此因）。现改为“目标标识不算调整”的统一规则（`set_axis`/`set_series` 为 `required+1`，其余 `max(1, required.size())`），服务端守卫复用同一函数；列参数也分成 `COLUMN`（`minLength:1`）与 `OPTIONAL_COLUMN`（`group` 清空分组、`error` 取消误差列可传空串）。

真实浏览器覆盖：结构类新增序列 → 预览 → 应用 → 一步撤销（图例 3→2）、切换图表类型后保存重载仍生效、删除最后一条序列被拒且不产生预览、ROC 类型不出现在不可用选项里。既有 39 条全部继续通过（含导入修订、统计评估、样式库、导航草稿、PNG/PDF、备份恢复）。

测试期写入的 476 个带时间戳的 `…验收 <epoch>` 项目已按外键顺序清理（chart_versions → charts → experiment_datasets → dataset_versions → datasets → experiments → style_templates → projects），保留 6 个演示项目与 46 个早期「第一批验收/成果恢复验收」项目未动。另把 `playwright.config.ts` 的 dev server 改成 `webServer`（`reuseExistingServer: true`），避免服务器未启动时整批报 `ECONNREFUSED`。

边界：新建图表向导（类型卡 → 映射 → `operations: []` 校验）未做；结构类下拉复用编辑器已加载的字段，`/profile` 目前只服务后续模型适配。协议细节见 [工具协议](FIGURE-TOOLS.md)，接入顺序与未落地项见 [Step 1 清单](AGENT-STEP1-PLAN.md)。

## 最新增量：确定性绘图工具与批量快捷操作（2026-10-21，Asia/Tokyo）

Java **67/67**、Vitest **117/117（20 个文件）**、完整 Chrome E2E **39/39（3.5 分钟）**、TypeScript/Vite 生产构建通过。后端已重新打包启动，浏览器请求真实 Java/MySQL；保留已有大分包提示。新增 10 项 Java、7 项前端与 3 条真实浏览器用例；未接模型、未使用付费 API。

新增五种展示操作的 JSON Schema 目录与只读预览 API，拒绝未知参数、代码/任意路径、无效数值、错误范围、失效序列、跨项目数据和旧 revision。批处理在配置深拷贝上校验，保留未修改字段与未来扩展字段；前端再次校验源数据指纹及展示白名单之外的配置不变。论文模式使用 pt，专业图表按实际标题字段写入，固定坐标和无效属性组合同时在前后端限制。

真实浏览器：文字/标题、图例、坐标轴、序列颜色、画布宽度组成五项操作，校验预览时原画布与数据库版本不变，确认后一次应用、一步撤销/重做；保存刷新后配置与响应一致，CSV 原始字节一致，SVG 保留文字/颜色且无整图位图。另验错误批次不能应用、外部保存后旧版本拒绝、成品字号、ROC 实际横轴标题生效和固定范围控件不展示。全量既有导入、统计、样式库、导航草稿、PNG/PDF、备份恢复继续通过。

已目视检查 [批量操作面板](screenshots/quick-actions.png)，浏览器保留当前项目的快捷操作入口供手动检查。架构、字段、边界及运行命令见 [工具协议](FIGURE-TOOLS.md)。本轮是 Agent 的工具准备层，尚无模型适配、自动执行循环或持久化 Agent 审计。

## 最新增量：预设区分与预览诊断收敛（2026-10-21，Asia/Tokyo）

Vitest **110/110（19 个文件）**、样式库与成果交付 Chrome 定向回归 **7/7（38.3 秒）**、TypeScript/Vite 生产构建通过；保留原有大分包提示。本轮前端修改，没有重跑 Java 或完整 36 条浏览器测试，不将上轮的 57/57、35/35 写成此次结果。

内置示意固定三组序列，四套实际样式同时区分配色、线宽、点形/大小、虚实线、网格、图例和热力图色板，附简短特征标签。单条真实序列也能通过示意比较多序列外观，右侧仍使用当前真实数据。

将直接拼接全部 warnings 的文字墙改为默认折叠诊断；详细信息独立滚动，每次追加 30 条。新增合成 CSV 的真实 Java/MySQL 浏览器流程：60 个 X 类别 × 3 条小提琴序列产生 180 条样本不足提示，验证默认不生成列表、可展开 30/60 条、诊断高度上限、预览高度及 1280/1560 窗口中滚动内容与固定应用区域无重叠。关闭后原配置和 revision 均未变化。没有修改分布估计算法或补造密度。

继续验证四种基础图预览、SVG、撤销/重做、保存重开、模板管理、显式映射、PDF/PNG、项目备份恢复。截图目视检查 [区分后的样式](screenshots/styles-builtin.png) 和 [180 条诊断摘要](screenshots/styles-warning-summary.png)，详情见 [样式库记录](STYLE-LIBRARY.md)。

## 最新增量：样式预览与个人模板管理（2026-10-21，Asia/Tokyo）

Java **57/57**（含独立 MySQL 集成和新 PATCH 接口验证）、Vitest **106/106（18 个文件）**、完整 Chrome E2E **35/35（2.4 分钟）**通过，TypeScript/Vite 生产构建通过；保留既有大分包提示。没有使用外部 AI 或付费 API。

新增四种内置样式的图形示意和当前真实数据预览，预览不修改编辑器，应用才进入撤销栈。个人模板默认当前项目，可搜索、切换全部项目、分批展示、保存、预览、重命名、确认删除。新接口校验名称、404、同名重试及 profile/项目归属不变。未来浏览器测试仅清理本轮创建项目中的模板，历史数据未批量删除。

真实浏览器覆盖折线、分组柱、散点、矢量热力图；验证关闭预览保留原图、应用/撤销/重做、MySQL 保存重开、SVG 文字/矢量与颜色、跨项目套用、删除取消与确认、键盘页签、1280/1920 适配和搜索框图标间距。原有 CSV/XLSX、统计与评估、SVG/PNG/PDF、备份恢复全部继续回归。

开发检查发现数据列表不含行数据、预览面板被 flex 压缩裁切及搜索输入样式优先级问题，修复并补充真实数据与几何检查后完成上述全量通过。中途一次定向运行发生 Windows worker 退出（3221226505）；最终完整运行无失败，没有跳过用例。Java 测试在 `labflow_test` 执行，本地运行服务已重新构建启动。

详情见 [样式库记录](STYLE-LIBRARY.md)，截图：[内置样式](screenshots/styles-builtin.png)、[个人模板](screenshots/styles-personal.png)、[热力图预览](screenshots/styles-heatmap.png)。

## 最新增量：模块续接与无打断导航（2026-10-21，Asia/Tokyo）

Vitest **101/101（17 个测试文件）**、完整 Chrome E2E **32/32**、TypeScript/Vite 生产构建通过。最终完整浏览器运行全部通过，`test-results/.last-run.json` 状态为 `passed`，无失败用例。保留已有大分包提示；Java/SQL 源码未修改，本轮未重跑 Java 单测，浏览器流程使用真实 Java/MySQL。

验证普通模块切换不弹保存确认、最后输入同步保留、同版本草稿自动恢复、新数据集草稿隔离、模块/项目/属性页签/实验筛选续接。通过注入本机存储失败检验取消离开与重试；通过真实 API 更新图表检验旧草稿冲突选择。保存仍显式创建数据库版本，浏览器验证普通导航不会偷偷增加 revision。保存期间锁定编辑区，保存返回后保持所选属性页签。

原有 CSV/XLSX、科研计算、评估、SVG/PNG/PDF、备份恢复流程均纳入此次完整回归。新增导航错误监听，快速切换无未处理页面异常。截图目视检查 [编辑器](screenshots/seamless-editor.png) 与 [数据工作区](screenshots/seamless-data.png)；设计与边界见 [模块续接记录](WORKSPACE-CONTINUITY.md)。没有进行独立帧率基准测量。

## 最新增量：首页入口与研究工作区（2026-10-21，Asia/Tokyo）

Vitest **92/92**、首页/工作区/图廊/导航 Chrome 回归 **7/7（25.9 秒）**、TypeScript/Vite 生产构建通过（保留已有大分包提示）。新增 2 项组件交互测试与 1 条真实 API 浏览器流程。

入口改为一个绘图主入口和三个紧凑快捷入口；项目区首屏 4 个、按需展开，移除嵌套滚动；最近图表改为真实元信息文档卡片。验证搜索、切换项目、显示更多、无项目创建引导、导入忙碌状态、键盘与减少动画，覆盖 390–2560 px 首页适配。截图检查中发现搜索图标与文字重叠，修正样式优先级后加入几何检查并重跑通过。

接口和图表配置未改动。Java 测试与全量科研绘图 E2E 本轮未重跑。详见 [工作区记录](HOME-WORKSPACE.md) 和 [实际截图](screenshots/home-workspace-refined.png)。

## 最新增量：居中首页与科研图廊视觉（2026-10-20，Asia/Tokyo）

本轮 Vitest **90/90**、首页/导航/图廊 Chrome 回归 **6/6（28.4 秒）**、TypeScript/Vite 生产构建通过；最后调整图版网格并补充组合截图后，图廊用例再次 **1/1（3.9 秒）** 通过。保留既有大分包提示。没有修改 Java、SQL 或图表计算，本轮没有重跑 Java 测试和 29 条全量 E2E。

验证 10 张参考图本地加载、无外部运行时请求、无播放控件、悬停与聚焦时仍持续滚动、减少动画偏好、390/900/1280/1920/2560 宽度无横向溢出、宽屏页头居中、功能卡片的黑白背景/标题颜色，以及真实模块跳转、前进/后退、取消离开与草稿恢复。首次窄屏检查发现光晕横向超界，修复后通过。

图廊采用蓝/青/暖橙配色和一张深色图版，替换原先杂乱的紫绿热力图等参考图片；功能入口保持黑白。重新渲染的每张参考图保留上游示例数据/计算方式、固定随机种子与改编说明，10/10 输出 SHA-256 核对通过。没有生成 AI 曲线，没有修改真实实验数据，也不将参考图版宣称为 LabFlow 导出截图。

已目视检查 [图廊与入口](screenshots/home-gallery-actions.png)、[完整首页上半部](screenshots/home-centered.png)、[2560 px 宽屏](screenshots/home-wide.png)。运行和素材重建命令见 [首页与路由记录](HOME-AND-ROUTING.md)。

## 最新增量：首页图廊与独立工作台（2026-10-20，Asia/Tokyo）

Vitest **90/90**、完整 Chrome E2E **29/29（2.1 分钟）**、TypeScript/Vite 生产构建通过，保留大分包提示。新增 13 项路由解析/恢复测试、3 项图廊交互测试、3 条浏览器流程。原有用例改用真实导航链接，并验证刷新直接恢复当前图表；首页入场测试只等待有限动画，避免被循环图廊阻塞。

覆盖 hover 指示器移动、键盘导航、独立 URL、前进/后退、取消离开、确认后草稿恢复、深链接错误态、画廊播放/暂停、减少动画、900/1280/1920 首页适配及图片本地加载。素材 SHA-256 逐一核对，保留 Matplotlib 许可；图片仅作图库参考，不冒充 LabFlow 导出。详情与截图见 [首页与路由记录](HOME-AND-ROUTING.md)。

开发中修复了取消离开后确认框可能再次触发的问题；中途本地前端服务退出导致的连接失败已在恢复后完整重跑，最终 29 项无失败。Java 无修改，本轮未重跑 Java 单测。

## 最新增量：绘图编辑器信息层级（2026-10-20，Asia/Tokyo）

Vitest 74/74、TypeScript/Vite 生产构建通过（保留既有包体积警告）；Chrome E2E 共 26 项均验证通过：最后完整运行 23 通过、3 失败，3 项失败来自测试在编辑器懒加载完成前判断图表选项的可见性，随后错误地收起了新图表默认展开的选择器。补上明确的面板加载等待后，`playwright test --last-failed` 3/3 通过（8.8 秒）。未删除或跳过测试，未将重跑写成一次无失败的完整运行。开发过程中也修复了属性导航保留旧固定高度导致第二行被遮挡的问题。

新增分区互斥、键盘折叠、无脏配置、三种桌面宽度的 E2E；原有真实数据导入、保存/恢复、11 类图、模板、备份和 SVG/PNG/PDF 流程继续验证。设计与截图见 [布局记录](EDITOR-LAYOUT.md)。仅修改前端，没有重跑 Java 测试。

## 最新增量：第九批前端体验（2026-10-20，Asia/Tokyo）

Vitest **74/74**、TypeScript/Vite 生产构建通过；Chrome E2E **25 项用例均验证通过**。最后完整执行为 23 通过、2 失败：一项 Windows worker 以 3221226505 退出，另一项 PDF 模块请求在网络 trace 中明确报告 `net::ERR_NO_BUFFER_SPACE`。停止并行构建负载后，用 `playwright test --last-failed` 定向重跑，两项均通过（22.6 秒）；没有删除或跳过失败用例。此前同一批功能曾完整 25/25 通过。没有将资源错误记成一次无失败的完整运行。

新增 10 项单元/组件测试覆盖草稿写入合并、刷新冲刷、正式保存取消草稿、存储失败重试、布局属性删除、首页搜索和分批显示；新增 2 条 E2E 覆盖 1280/1920 窗口、2400 px 大画布、手动缩放、对数轴/自动范围恢复、最后配置 SVG、真实 MySQL 重开与刷新恢复草稿。现有导入、11 类图、统计、实验关联、撤销/历史、模板、备份及 SVG/PNG/PDF 流程均继续检验。

已目视检查首页、数据页、复用弹窗和 1280/1440/1920 编辑器截图。三轮生产测量与构建大小、条件和原始数据见 [机器可读记录](test-evidence/frontend-experience.json)，修改和运行命令见 [第九批记录](BATCH-9.md)。较大数据的重新计算仍在主线程，保留 Vite 包体积警告；未修改 Java 或重跑 Java 测试，上一批 56/56 仅作为历史记录。未推送远端。

## 第八批成果复用与交付（2026-10-19，Asia/Tokyo）

Java **56/56**、Vitest **64/64**、完整 Chrome E2E **23/23（1.7 分钟）** 与 TypeScript/Vite 生产构建通过。新增 5 项真实 MySQL 集成、5 项前端函数/交互及 3 条 Chrome 流程；最后补强模板白名单后重跑 Java 与新增浏览器验收。npm audit 0 项漏洞。远端 CI 未执行。

验证模板白名单、统计/绑定不变与撤销、显式字段映射及数值类型、原图不覆盖、PDF/SVG/PNG 下载、完整项目备份预览不写库、恢复新项目的图表与原始文件一致、ID 与来源引用重建、参数数字不误改、历史/时间保留、归档项目及空项目、损坏校验/路径/引用/不完整历史拒绝、语义校验失败全部回滚。恢复后可继续保存新图版本，原项目 revision 不变。

PDF 实测 89 × 58.553 mm、单页、中文/α 字形可提取、嵌入字体、26 个矢量对象和 0 个栅格 image，标题中心偏差约 0.001 pt。另验粗体热力图、转换器多行 tspan/±；编辑器仍按纯文本处理。检查实际页面渲染并修复文字定位偏移。SVG 与 PNG 保持原流程，不生成统计值。实际证据与操作命令见 [第八批记录](BATCH-8.md)。

独立创建“成果复用与交付 · 合成演示”（两份数据、两条实验、两张图/三快照、一个样式），供手动检查。运行仍仅用本地 Java/MySQL/浏览器，不用收费 API。PDF 字体限定内置 Noto Sans SC 常规/粗体；其他字体继续用 SVG/PNG。Plotly 约 4.96 MB 的按需包体积提示保留，性能/页面美化未作专项改造。

## 最新增量：第七批混淆矩阵与共同样本（2026-10-19，Asia/Tokyo）

Java **51/51**、Vitest **59/59**、完整 Chrome E2E **20/20（约 2.3 分钟）** 通过，TypeScript / Vite 生产构建通过。Java 新增 6 项纯计算与 2 项真实 MySQL 集成测试；前端新增 10 项计算/交互测试，浏览器新增两条完整流程。

手算三类矩阵 `[[1,1,0],[0,1,1],[0,0,2]]` 核对逐类 precision/recall/F1、support、macro/micro/weighted 与 accuracy；验证按行、按列、全部归一化仍保留相同计数和指标。零分母保持 null；未知类别、重复/缺失样本 ID、错误字段与跨项目请求被拒绝，不自动去重或补零。

真实 Chrome：逐样本标签 → 两模型映射 → 明确类别顺序 → 计数 → 归一化与共同样本 → MySQL v1/v2 → 刷新重开 → SVG/PNG/Java JSON。下载的 Java reports 与前端纯函数逐项深比较，包括原始计数、显示矩阵、每类与平均指标、排除诊断及源行号。额外测试共同样本 ROC 在按模型分面后仍保持交集，非唯一 ID 无法覆盖已保存版本。原始 CSV 下载字节不变。

SVG 保留文本、色块矢量路径与百分比，不含 image；PNG 实测宽 1520 px。矩阵标注所选模型/组与有效 n。已目视检查 [三分类工作台](screenshots/multiclass-matrix.png)、[演示工作台](screenshots/classification-demo.png)；实际 [SVG](exports/multiclass-matrix.svg)、[PNG](exports/multiclass-matrix.png)、[Java JSON](exports/multiclass-report.json)。

独立创建“分类评估与共同样本 · 合成演示”，两份合成数据、三张保存图。三类预测共 12 行，共同样本为两模型相同的 8 行，来源始终为合成演示；没有修改用户现有项目。

边界：共同样本只按同一不可变数据版本对齐，不跨文件 join；最多 20 类、100 个模型分组。分类指标为完整单标签分类，不提供多标签、多分类 ROC/AP、显著性或置信区间。矩阵单图选择模型/组，暂不支持矩阵分面。包体积提示仍存在（Plotly 按需包约 4.95 MB），性能/品牌/首页动效未作专项调整。详见 [第七批记录](BATCH-7.md)。

## 第六批数据处理与重复实验汇总（2026-10-19，Asia/Tokyo）

Java **43/43**、Vitest **49/49**、完整 Chrome E2E **18/18（约 1.5 分钟）** 通过；最后补充分组条件保护与多个指标映射后，49 项前端测试与本批 3 条 E2E 再次通过。TypeScript / Vite 构建通过，Plotly 包体积提示仍存在。本批以功能为主，没有修改首页、入场动效或品牌视觉。

新增 7 项纯计算测试覆盖手算均值/SD/SEM、缺失与 n<2、常量、缺失分组、数值排序稳定性、重复标识、非法字段、列名冲突、极大偏置、极小数及结果溢出。新增 3 项真实 MySQL 集成测试覆盖预览不写库、预览/保存行与字段精确一致、来源规则/指纹、图表配置恢复、CSV 指纹、跨项目拒绝、无效请求不写入，以及派生版本继续排序。

首次 MySQL 集成测试发现 JSON 数值转换使派生下界末位变化；修复为带版本标记的精确数值文本内部编码，读取恢复 number 后重跑通过，未修改旧原始版本。浏览器数值精度验收先与手算值作精度比较，再用服务器预览结果精确核对保存、绘图与重新打开，避免 JS 中间浮点舍入差异干扰一致性验证。

三条真实浏览器流程：逐次观测 → model+epoch 分组 → SEM → 预览 → 独立数据集 → 自动均值/误差列映射 → MySQL 图表保存 → 刷新重开 → SVG/PNG；重复标识错误 → 修正分组 → 改规则使旧预览失效 → 区间图；源过滤 → 数值稳定排序 → 另存 → 原 CSV 字节不变。SVG 含误差棒路径、文字且无 image；PNG 为 1520×1000 px。

截图已目视检查：[处理预览](screenshots/processing-preview.png)、[均值误差图](screenshots/processing-sem.png)、[区间图](screenshots/processing-band.png)、[合理数值演示](screenshots/processing-demo.png)、[来源追溯](screenshots/processing-source.png)。[实际 SVG](exports/processing-sem.svg)、[实际 PNG](exports/processing-sem.png)。已创建独立合成演示项目，17 行逐次观测、2 份派生结果和 2 张图；保留现有用户项目。

边界：最多 4 个分组、5 个指标、8 条源过滤、4 个排序字段，结果上限沿用 20,000 行/200,000 单元格/10 MB。重复标识校验可选，独立观测解释仍由用户确认；不生成置信区间或显著性。长宽表转换、派生规则可视化历史编辑、项目备份、PDF、性能及外观专项不在本批范围。详见 [第六批记录](BATCH-6.md)。

## 第五批模型评估与实际区间（2026-10-19，Asia/Tokyo）

Java **33/33**（含真实 MySQL 集成）、Vitest **43/43**、完整 Chrome E2E **15/15（约 1.3 分钟）** 通过，TypeScript / Vite 构建通过。最后补充单类别分面的指标保留与 seriesId 追溯后，43 项前端测试与 2 条新增 E2E 再次通过。

手算标签 [0,0,1,1]、分数 [0.1,0.4,0.35,0.8] 验证 AUC=0.75、AP=5/6；并列常量分数 AUC=0.5、AP=正类比例。覆盖中文正类、缺失、单一类别、过滤和分面、阈值指标、上下界缺失断点/对数/反向边界/行顺序。后端覆盖新字段、算法版本、归属和反向区间拒绝，以及三类图表完整配置 MySQL 保存/重新打开。

真实 Chrome 流程核对 ROC 点位、PR 阶梯、评估 JSON、配置 v1→v2 与阈值恢复；上下界缺失生成两个独立填充多边形，刷新重开后保持一致。实际 SVG 含文本/路径且无 image，区间 PNG 实测 1520×1000 px。反向区间保存返回错误，原版本保留；分类原始 CSV 下载字节不变。新增功能未引入收费服务或新依赖。

已目视检查 [双模型 ROC 工作台](screenshots/evaluation-demo.png)、[PR 工作台](screenshots/binary-pr.png)、[实际区间工作台](screenshots/actual-bands.png)。独立创建“模型评估与区间 · 合成演示”项目（22 行分类、8 行区间，3 张保存图），测试项目与演示均明确标记合成，保留用户已有项目。截图和文件均来自实际运行，不是界面 Mock。

边界：只支持二分类；多模型独立取有效行，不自动做样本配对，不计算置信区间、显著性或多分类平均。PDF 与多数据源混合子图尚未实现。Plotly 按需包仍约 4.93 MB，构建给出体积提示。完整协议与使用见 [第五批记录](BATCH-5.md)。

## 第四批论文尺寸与经验分布（2026-10-19，Asia/Tokyo）

Java **31/31**（真实 MySQL）、Vitest **33/33**、Chrome E2E **13/13（约 1.4 分钟）** 通过，TypeScript 与 Vite 构建通过。新增数值边界测试覆盖等宽分箱、端点、范围排除、概率/密度、ECDF 重复值、mm/pt 换算、SVG 物理尺寸、PNG pHYs 和热力图发散中心。

真实浏览器保存并重新打开 histogram/ecdf 配置，核对基础字号换算；导出 SVG 为 89 mm 宽且保留文本/路径，PNG 为 1051×691 px 并写入与有效 DPI 一致的密度元数据。热力图数值标注、色块与色标一致，无效色阶保存被拒绝，旧版本保留。原始 CSV 字节不变。

已检查本批截图和实际 PNG。GitHub Actions 已新增前端测试/构建和 Java/MySQL 验证配置，尚未推送或远端执行。Plotly 包体积警告、SVG 字体依赖、根项目许可证未选定仍为已知边界。详见 [第四批记录](BATCH-4.md)。

## 第三批分布图与多子图（2026-10-19，Asia/Tokyo）

Java **28/28**、Vitest **23/23**、Chrome E2E **11/11（约 1.2 分钟）** 通过。后续针对共享/独立坐标切换、类别轴禁用数值控件增加断言，新增专业绘图 3 条 E2E 再次通过；八行布局自动适配的尺寸边界另由组件测试验证。TypeScript / Vite 生产构建通过；Plotly 按需包体积警告仍存在。

实际验证箱线图与小提琴 SVG 路径、已知样本三种四分位算法、真实样本数、缺失/常量处理、带宽拒绝、子图布局、标题、轴范围匹配、MySQL 保存/重开、原数据字节不变，以及两子图 SVG/PNG 下载。SVG 保留文本且无 image 嵌入；PNG 尺寸与配置及倍率一致。截图、导出文件与边界见 [第三批记录](BATCH-3.md)。

测试发现的 Java 用例编译及整数节点比较问题已修正后重跑通过；没有跳过失败检查。验收项目为明确命名的合成数据，保留本地，未清理用户已有项目。以下为此前历史记录。

## 第二批实验关联与对比（2026-10-18 晚）

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
