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
