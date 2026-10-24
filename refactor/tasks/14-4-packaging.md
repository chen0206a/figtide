# 14-4 Windows 自带运行时便携包

本任务书由现有 `refactor/desktop/DESKTOP-PLAN.md` 第6节细化，并非此前用户提供的独立任务包。前置：14-3四项修复及双库、双浏览器通道总验收通过。分支从desktop/14-3新建desktop/14-4；分节提交，不推送、不打标签、不实际发布远端Release。

## 14-4-0 交付边界

- Windows x64，版本从frontend/package.json读取并与backend/pom.xml核对；当前0.1.0。
- `jlink` 裁剪JDK21，`jpackage --type app-image` 生成真正的GUI `FigTide.exe`；便携ZIP解压后双击即可使用，无需安装JDK/MySQL，无管理员要求。不宣称单文件EXE或安装向导已完成。
- 不修改API、数据库迁移、图表语义、草稿/预算/幂等/恢复。数据仍在LOCALAPPDATA，与安装目录分离。
- 本机无WiX；第一版交付app-image便携ZIP。完整产物浏览器E2E在14-5执行；MSI/EXE安装向导不属于既有桌面计划，不虚报验收。

## 14-4-1 本地打包

1. `scripts/package-desktop.ps1` 默认重新构建desktop JAR；明确的SkipBuild仅复用有SHA校验元数据的产物。
2. 解开构建JAR的类/依赖用于jdeps分析；补充反射/编码/TLS/ZIP运行所需模块；输出模块清单。
3. 通过jlink生成运行时，再通过jpackage生成无控制台启动器。JVM固定UTC和desktop profile；用户追加数据目录参数不能丢失desktop默认profile。
4. 从已有512px品牌图生成ICO，不引入未授权素材；版本元数据一致。
5. 严格白名单输入：仅JAR、运行时、品牌资源、LICENSE和使用/依赖说明。禁止把.runtime、数据库、模型密钥或整个工作区复制到包里。
6. 输出便携ZIP、构建manifest和SHA256SUMS，不覆盖已有产物、不递归删除任意目录。

## 14-4-2 产物冒烟

`scripts/test-desktop-package.ps1` / Node探针只用本轮独立临时H2目录；清空JAVA_HOME、PATH仅保留System32，工作目录不在应用目录。

断言：EXE提供真实SPA/API、监听127.0.0.1、同目录第二实例退出且第一实例ID不变、CSV导入与保存图表可用、强杀重开后端口/数据/图表配置一致。检查EXE版本/图标、启动器profile和UTC、包内无用户数据或模型配置。自动化不调用付费模型，不连接真实8086/用户数据目录，不冒充托盘人工点击。

## 14-4-3 CI与说明

- GitHub Actions Windows构建，手动触发仅上传workflow artifact；推送匹配当前版本的vX.Y.Z标签时，测试通过后创建草稿、附资产再发布Release。
- 保留runtime/legal及前端依赖LICENSE/NOTICE；MIT仅指项目自身。未签名、数据位置、退出方法、迁移入口、校验方法和重建命令写入文档。
- 本轮只提交workflow；不替用户推送、打标签或发布。不将静态检查说成GitHub实际运行成功。

## 总验收

打包和产物探针通过；版本/ICO/白名单/ZIP/SHA检查通过。前端/后端产品源码不变时复用14-3刚完成的测试并标明，脚本变更用实际构建与进程测试验证。失败记录原文与日志路径，不删断言、不刷新基线。用户后续授权：14-4通过后继续计划中14-5，全部完成验收后暂停。
