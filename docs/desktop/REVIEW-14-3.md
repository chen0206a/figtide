# 14-3 独立验收（2026-10-24）

> 后续处理：R1–R4已全部修复并补测，双库、开发完整83/0/4、桌面完整84/0/3及增强迁移5项目验收通过。最新结论见TEST-RESULTS顶部「14-3修复后总验收通过」，证据desktop14-3-fixes.json。下文保留原审阅发现与当时结果，不代表修复后的状态。

审阅 `desktop/14-3@01fa0c6`，基线 `b5ed551`。结论：**需要修改，暂不通过任务14-3总验收**。正常路径已重新跑通，但有3处可复现的功能问题及1处测试缺口。未修改产品代码，未访问8086、真实labflow库或用户桌面目录。

## R1 · P1：合法的同名图表、同名模板无法完成迁移核对

- 位置：`scripts/migration/normalize.cjs:120–122`、`:253–254`。
- 图表以 `c:${name}`、模板以 `s:${name}` 为唯一稳定键，重复即抛异常。但数据库没有这些名字的唯一约束，WorkspaceService.saveChart / StyleTemplateService.save也不拒绝同名。
- 从已有合成项目备份复制一个图表及其版本，分别另复制一个模板，使用新ID、保留名字。真实隔离桌面服务的 `POST /api/backups/preview` 对两份备份均返回200，分别显示charts=2、style_templates=2。规范化函数却分别报 `图表稳定键冲突：c:准确率曲线`、`样式模板稳定键冲突：s:论文样式`。
- 首次迁移可能已恢复项目，随后核对抛错，报告失败；再次运行也无法按内容跳过。不能让用户先改合法名字，或忽略重复对象来绕过比较。
- 应修复：建立允许重复的稳定对应关系，保留对象个数、图表版本和引用；补同名图表/同名模板的真实迁移与幂等E2E。

## R2 · P2：Verify核对的不是正式迁移选中的副本

- 位置：`scripts/migration/migrate.cjs:221–235`，与`:245–260`的正式迁移逻辑不一致。
- 源项目P；目标原有不同内容的P，以及已正确迁移的P（迁移）。正式迁移会找到后者并报告「已迁移」，但Verify只查P，并且没有应用重命名比较规则。
- 用同一组HTTP协议夹具调用实际CLI：正常模式exit=0、target=P（迁移）、无diff；Verify模式exit=1、target=P、误报description差异。夹具只在本机临时端口运行，没有连接任何用户服务。
- 应修复：复用正式迁移的目标匹配/项目映射与重命名规范化规则；针对真正迁移副本验证，补冲突改名后的Verify成功和篡改失败用例。

## R3 · P2：合法的最长项目名在冲突改名后超出API限制

- 位置：`scripts/migration/migrate.cjs:247`、`:280`；后端限制见`BackupService.java:522`。
- 原项目名120个字符合法；若目标有同名异内容项目，直接追加「（迁移）」后变成124个字符，恢复必然被1–120字校验拒绝。
- 实际CLI经HTTP夹具已捕获124字符的restore name，并返回exit=1，错误「400 新项目名称须为 1–120 字」。夹具拒绝规则与真实BackupService限制相同，此项没有伪称为真实后端迁移用例。
- 应修复：为后缀及数字预留长度，生成合法且稳定的候选名；确保重跑可识别已经改名的副本，补120字符冲突及二次幂等用例。

## R4 · P2：默认备份上限测试无法检测上限被放大

- 位置：`backend/src/test/java/dev/labflow/BackupLimitsIntegrationTest.java:25–44`。
- 64MiB+1的随机字节不是合法ZIP。测试只断言400/REQUEST_400，因此即使取消/放大尺寸限制，仍会因ZIP格式错误得到相同结果。
- 独立运行 `LABFLOW_TEST_DB=h2 mvn -B -f backend/pom.xml -Dtest=BackupLimitsIntegrationTest -Dlabflow.backup.compressed-limit=134217728 test`，测试仍1/1通过。这是测试缺口，不表示当前默认配置已经变成128MiB。
- 应修复：断言明确的64MiB尺寸错误；加入能排除格式错误的边界样本，并覆盖展开96MiB限制。不要用一份必然解析失败的随机文件证明大小边界。

## 验收证据需要补正

原`TEST-RESULTS.md`的14-3表格写开发83/0/4、桌面84/0/3，后文却写两个通道「第3轮完整跑通」又各有1条失败、随后专项通过。专项通过不能证明完整一次全绿。本次开工时`frontend/test-results/results.json`也只有3条专项通过，未包含完整两通道结果。

修复以上问题后，应重新完整运行两通道并保留整轮JSON/失败trace，不能把专项结果作为全量通过的证据。本轮没有重新运行两个完整通道，也不将原报告直接计为本次通过。

## 本次实际验证

| 项目 | 结果 |
|---|---|
| Node迁移单测 | 28 passed / 0 failed |
| MySQL备份相关Java测试 | 7 passed / 0 failed / 0 skipped |
| H2备份相关Java测试 | 7 passed / 0 failed / 0 skipped |
| `./scripts/test-migration.ps1 -Keep` | exit0；首轮4成功、复跑4已迁移、篡改正确exit1、旧库10张表行数与CHECKSUM一致、浏览器3/3 |
| 实际桌面后端接收同名对象备份预览 | 两份均HTTP200；规范化却拒绝，见R1 |
| 名称冲突CLI协议复现 | R2、R3均复现，见上 |
| 默认限制测试的128MiB覆盖实验 | 1/1仍通过，证明R4缺口 |

`test-migration.ps1`内的默认后端package、独立前端npm ci/build、desktop package均通过。浏览器teardown打印HTTP405清理提示（测试桌面未开启清理路由），脚本仍正常退出并移除了自己创建的H2目录；旧测试库仅保留隔离种子，未碰真实库。

未重跑：双库全量Java、单独的前端组件测试/单独build、完整开发与桌面E2E；当前已有阻塞问题，本轮以迁移专项及边界复现为验收依据。没有删除断言或刷新基线。自动化运行改写的原14-3报告样例已恢复，新增独立证据为`docs/test-evidence/desktop14-3-review.json`。

原始记录保存在`.runtime/review14-3-*.log`，整轮迁移证据为`.runtime/migration-e2e-20261024-230839/`；边界复现脚本`.runtime/review14-3-edge.cjs`、真实预览脚本`.runtime/review14-3-preview.cjs`均只使用合成备份、临时端口与本轮隔离H2目录。
