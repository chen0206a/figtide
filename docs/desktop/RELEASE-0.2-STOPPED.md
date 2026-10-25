# v0.2.0发布门槛失败：按任务书停止

日期：2026-10-25（Asia/Tokyo）。15-1至15-3完成；15-4已合并并推送标签，但Windows工作流失败，发布未完成；15-5未执行。没有用本地ZIP替代，没有改写提交/标签，没有在失败后再次推送或重跑。

## 已执行的远端操作

- [PR #2](https://github.com/chen0206a/figtide/pull/2)：push/PR两轮frontend、backend、backend-h2共6项全部通过后，普通merge合并。
- 合并提交：`63f01283cebacd63fd3833f586f90054a1247c31`。
- 标签：[v0.2.0](https://github.com/chen0206a/figtide/tree/v0.2.0)，指向上述合并提交。
- [Windows发布工作流](https://github.com/chen0206a/figtide/actions/runs/40161500613)：failure，在Test source失败，打包、EXE检查、浏览器验收和草稿准备全部跳过。
- [main检查](https://github.com/chen0206a/figtide/actions/runs/40161489964)、[标签检查](https://github.com/chen0206a/figtide/actions/runs/40161500547)、[展示页部署](https://github.com/chen0206a/figtide/actions/runs/40161489986)均成功。部署成功不代表Windows发布通过。
- API核对：没有v0.2.0草稿或正式Release；旧v0.1.0保持原样。未清理远端分支，因为尚未满足完整发布门槛。

## 失败原文与根因证据

失败测试：`backend/src/test/java/dev/labflow/desktop/DesktopPagesTest.java:27`，`hashedAssetsHaveLongCacheAndMissingAssetsAre404`。

JUnit XML的CDATA原始字节显示（显式展示不可见行尾）：

```text
Response content expected:<window.desktopTest = true;\n>
but was:<window.desktopTest = true;\r\n>
[ERROR] Tests run: 258, Failures: 1, Errors: 0, Skipped: 1
[INFO] BUILD FAILURE
H2 tests failed
Process completed with exit code 1.
```

Java测试把预期内容写死为LF，Windows runner测试资源内容为CRLF。不是删除断言可以解决的问题；后续应在保留响应内容/缓存/404检查的前提下解决跨平台行尾契约。本轮只读取日志和JUnit XML定位，没有修改测试或产品。

远端证据包含`backend/target/surefire-reports/TEST-dev.labflow.desktop.DesktopPagesTest.xml`（工作流desktop-package-evidence artifact）。本地原始完整失败日志`.runtime/task15-4-windows-failed.log`；下载的原始JUnit报告`.runtime/task15-4-failed-evidence/`；工作流/PR状态`.runtime/task15-4-{pr-checks,merge,windows-final,failed-summary}.json`。机器摘要及哈希见`docs/test-evidence/release02-stopped.json`。

## 未执行

- v0.2.0草稿核验、正式发布、远端分支删除。
- 15-5从真实Release重新下载、校验、全新目录冒烟与互联网下载SmartScreen人工复核。
- 本地失败记录仅提交到保留的release/v0.2.0分支，未推送。main与已推送标签不改写。

停止依据：任务15-4明确要求“工作流失败就停下汇报，附日志，不要手动上传本地构建的ZIP来代替”。因此本轮不继续修复/重发，也不把本地通过写为远端发布成功。

## 处理结果

2026-10-25，仓库主人新授权恢复发布。原失败来自Windows测试资源CRLF与断言写死LF不一致。新增.gitattributes，默认文本LF、bat/cmd为CRLF、二进制不转换；renormalize后没有已有文件内容变化，单独提交8ab780f。DesktopPagesTest改为逐字节比较HTTP响应与实际classpath资源，保留缓存头和404检查。本地LF与CRLF资源各4项全部通过，没有删除断言或修改生产响应。

Windows工作流增加PR到main触发，在合并前完整构建、后端测试及EXE/浏览器验收；PR不创建Release。原失败记录1bb9a0c包含在修复分支中。

标签重打原因：旧v0.2.0指向未修复提交，无法验证修复后的Windows产物；用户本次明确允许仅删除并重建v0.2.0，不允许强推分支或改其他标签。当前尚未执行重打，必须先等修复PR包括Windows在内的全部检查通过。实际时间与最终发布/下载结果在完成后补记。

### 2026-10-25恢复检查结果：再次在门槛处停止

修复提交：8ab780f（只新增换行规范，renormalize没有已有文件内容差异）、a59ca64（资源字节断言及Windows PR门槛）。[PR #3](https://github.com/chen0206a/figtide/pull/3)已包含原失败记录1bb9a0c。常规push/PR六项检查全绿；[Windows PR运行40170049640](https://github.com/chen0206a/figtide/actions/runs/40170049640)的前端280项、Node40项、H2 257通过/0失败/1跳过、完整便携包构建均成功，证明原行尾问题已修复。

2026-10-25 15:46（UTC+09:00），Windows EXE探针报错：

```text
Error: Packaged EXE was not ready; inspect D:\a\figtide\figtide\.runtime\package-smoke-90bfbae9-8621-4ef3-bd05-409d7826f2ed
    at ready (.../scripts/desktop/probe.cjs:55:9)
    at async .../scripts/desktop/probe.cjs:84:39
Packaged application verification failed.
Process completed with exit code 1.
```

这是独立于原LF/CRLF问题的启动就绪失败，当前只确认约45秒内未就绪；artifact下载到67份后端测试报告，没有process-*.log或figtide.log，尚不能确定EXE内部启动原因，不能把延长超时当成已验证修复。

按“失败就再次停下”停止：PR #3未合并；**截至本次记录未删除或重打标签，故没有重打执行时间**，旧v0.2.0仍指向63f01283cebacd63fd3833f586f90054a1247c31。没有创建v0.2.0草稿/正式Release，没有上传本地ZIP，没有清理远端分支；15-4后续与15-5未执行。重打原因和唯一标签授权保留，但执行前提尚未满足。

完整日志`.runtime/release02-retry-windows-full.log`、失败步骤原文`release02-retry-windows-failed.log`、原始后端报告`release02-retry-failed-evidence/`及机器摘要`docs/test-evidence/release02-retry.json`保留。失败后的追加记录仅本地提交，不推送或自动重跑。

### 第二个问题：第1轮仅诊断

新授权允许最多3轮Windows检查，第一轮只采集证据。完整隔离目录和诊断事件加入artifact并启用隐藏文件上传；保留原45秒就绪循环。加入CIM进程树、退出状态、监听/排除端口及Java实际命令行。没有修改产品、合并、标签或Release。本机7组探针及2项诊断测试通过，已证实本机Java收到关闭托盘/浏览器参数；CI的启动根因仍待本轮artifact，不把本机结果替代远端证据。

### 第二个问题：第1轮结果与第2轮补充定位

[第1轮40170951898](https://github.com/chen0206a/figtide/actions/runs/40170951898)约46秒无数据目录和app.port，端口17920未排除且未监听；父子EXE存活，但对子JVM附加超时，没有证据允许延长超时。启动参数存在于进程命令行，尚未确认进入Java main。根因仍未定。第2轮新增受限GUI错误窗口文本和相同runtime/JAR的控制台/直接Java对照启动（失败也保持原门槛失败）；不修改产品或等待时限。标签和Release继续冻结。

### 第二个问题：根因、证据与第3轮修复

第2轮控制台变体和包内Java均在约0.5秒退出1，完整异常为`InvalidPathException: Illegal char <?>`：jpackage JLI参数把`中文 空间`变成`?? ??`，DesktopPaths.java:18在数据目录/日志创建之前失败。GUI错误框“Failed to launch JVM”保持进程存活，造成原45秒超时。参数已带tray=false/open-browser=false，netsh无17920排除，故不调长超时。

修复：打包脚本在原PE manifest加入进程UTF-8，保留提权/DPI/兼容性/图标/版本，不改Java业务、不改系统区域设置、不移除中文用例。Microsoft文档要求Windows10 1903及以后。新真实启动器测试和原探针本机4项+7组通过，首ping4.86秒。原始错误文件SHA256与运行ID见docs/test-evidence/release02-startup.json。第3轮为授权的最后一次PR诊断/修复运行，结果待CI；标签/Release仍未操作。

### 第二个问题：第3轮最终结果，按3轮上限停止

2026-10-25 16:22:32（UTC+09），[最后一轮40172406890](https://github.com/chen0206a/figtide/actions/runs/40172406890)，commit69376ff，仍为failure：前端280/0/0、迁移40/0/0，新增启动器/诊断3/1/0。UTF-8更新后同安装位置的Unicode数据参数已通过，但复制到`中文 安装 Δ café/app`后的原生启动在launcher-utf8.test.cjs:47报`spawnSync .../UnicodeProbe.exe ENOENT`。此新场景根因尚未确定，不能当作成功，也没有删除断言。H2/Maven、完整打包、EXE探针、E2E和草稿步骤全部未执行；没有浏览器trace，原始错误全文见docs/test-evidence/release02-round3-error.txt、日志SHA256见release02-startup.json。

授权3轮已用完，停止任何额外推送/dispatch，不合并PR #3，不操作标签或Release；没有第4轮。旧v0.2.0仍在63f0128，故重打时间仍为未执行。只在本地提交此次失败记录，不推送以避免新运行。15-4后续与15-5继续未执行。本地4/4和7组通过不代替Windows远端门槛；进一步修复/CI重跑需要追加授权。

### 后续本机定位：第三轮ENOENT为Node22测试复制缺陷

用户要求自主判断修法后，在本机下载并校验官方Node22.23.4，旧用例精确复现CI同一ENOENT：fs.cpSync未报错，但源102文件、目标目录不存在、目标0文件。与Node官方#61878一致。旧Node24用例通过，原Java UTF-8参数修复与此独立，不撤销。

仅修改测试：改用.NET真实ZIP创建/解压到中文安装目录，启动前核对完整文件清单与SHA256；保留原中文启动/内容断言，现场移到artifact覆盖的独立目录。Node22/24各4项全过，UTF-8 FigTide完整本地ZIP在中文目录的真实冒烟两版本各7组全过。证据与哈希见docs/test-evidence/release02-copyfix.json。没有远端新运行/推送/合并/标签/Release；仍不能把本机结果当作远端全量发布门槛通过。
