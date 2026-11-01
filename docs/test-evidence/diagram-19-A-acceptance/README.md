# 19-A 最终本地验收 · 2026-10-31

任务19-A：19-A-7收尾、恢复19-5、总验收完成。A–C主体验收已由主人通过；本报告记录后续实现和自动验收，新增截图供主人复核。仅feature/diagrams本地提交，未推送、未开PR，19-B未开始。

改动文件：机制图DiagramReview/collectFacts、DiagramCanvas/Editor/Export、render/glyphs/geometry、DiagramPaletteAudit/Catalog及review/diagram包；共享ReviewIssues/ReviewResult仅增加可选描述与默认兼容泛型；App中数据图类型切换放入顶栏空位，原数据图布局、操作和基线不变；相关单测/E2E、证据脚本、API/DIAGRAMS/进度文档。后端均属于任务19机制图/只读审稿授权，无迁移、真实数据、账本或模型调用改动。

## 验证（实际运行）

| 检查 | 结果 | 命令 / 证据 |
| --- | --- | --- |
| H2后端全量 | 450总数：449通过、0失败、1跳过 | JAVA_HOME=.runtime/java下JDK21；LABFLOW_TEST_DB=h2；mvn -B -f backend/pom.xml test；backend-h2.txt |
| MySQL后端全量 | 455总数：454通过、0失败、1跳过 | LABFLOW_TEST_DB=mysql；同上命令；backend-mysql.txt；33316为已核验datadir的隔离实例 |
| 前端全量 | 587/587，71文件 | npm test -- --run --maxWorkers=2；frontend.txt |
| 构建 | 通过 | scripts/test-agent.ps1重建精确源码副本，npm ci + npm run build（tsc -b/vite）+desktop JAR；desktop.txt |
| 完整桌面E2E | 101通过、0失败、3跳过 | scripts/test-agent.ps1 -All -Desktop -FixturePort 18770；desktop.txt/desktop-summary.json |
| 独立JVM重启审计 | 通过 | 完整桌面测试后强制停止本轮JVM，再启动，完成审计持久/未完成运行恢复验证 |
| 12模板×6风格×2语言 | 144/144均0 error | 真实浏览器SVG几何与后端审稿；template-review.json；除保留D3意见外，D1/2/4/5/6/7全部通过 |
| 全31图元几何事实 | 通过 | 包含独立P/编号、二聚体P、磷酸化/数字徽标，字段完整性与无标签/ID载荷均校验 |
| 导出 | SVG、300/600dpi PNG、中英文PDF通过 | 物理尺寸、PNG pHYs、可解析矢量、中文嵌字；pdf-verification.json和exports/实际PDF/Poppler PNG |

明确未执行：两个后端各1项ServerEvaluationTest.evaluateExistingConfiguredServer，未提供labflow.eval.server，保持既有跳过，未连接外部真实模型；3项migration.spec.ts为专用已迁移数据夹具验收，普通-All入口不设置LABFLOW_MIGRATION_E2E，保持原条件跳过，不算通过。系统托盘/SmartScreen等人工项本轮未执行，本轮未发布安装包。

完整桌面捕获设置LABFLOW_CAPTURE=1、LABFLOW_DIAGRAM_CAPTURE_PHASE=diagram-19-A-acceptance、LABFLOW_CAPTURE_PREFIX指向本目录。截图专用用例也已执行，仅镜像本目录，未覆盖历史A/B/C和其他任务证据。

## 已处理的问题和偏差

- 本轮19-A-7的1–6项均落实，12个模板保留；对照原VISUAL-REVIEW：05 #5标记/#12示例，08 #5示例，02–04 #1模板/#2三栏/#3固定操作栏和名称完整，及“线宽与配色”。原A–C问题已经主人通过，本轮没有遗留未实现的视觉编号；配色色对决策仍待主人决定。
- 首次真实几何检查发现英文Beam splitter在6风格下溢出；节点加宽并保留完整单词，复跑144组0 error。保留template-review-first-attempt.json，不用快照替代视觉证据。
- 第一轮完整E2E为100通过/1失败/3跳过：新增类型切换行推低旧数据图编辑器约46px。入口移入主顶栏空位后旧布局基线原样通过；没有更新或删除旧断言。后续完整轮次全绿，最终文件见desktop.txt。
- 前端默认高并发曾使既有复杂页面触发5秒超时；以2个worker完整复跑，保留原超时和断言，587全部通过。
- 构建发现图表原修复类型只接受简单参数；采用默认类型兼容的泛型承载机制图嵌套参数，共享图表行为不变。
- 实际PDF复核发现字形定位重建文字后丢失stroke，导致P字母继承形状描边。只在机制图PDF定位后设置文字无描边，并补回归测试；前端587全量和最终完整桌面再次通过，中英文PDF重新解析、渲染和目视复核。
- D3遵守主人最新要求：只检查实际角色轮廓，不检查浅填充；默认Okabe–Ito的失败不自动换色、不调阈值。其他配色只有存在全部实际色对达标的目录方案时才提供可选修复，仍须用户确认。

## 图片与操作记录

- templates-overview.png：12个真实科研示例模板总览；新建页模板网格3列。
- new-page-1440.png、new-page-lower-controls.png、02-new-templates.png：完整新建页面；右栏内容滚动，底部操作栏独占空间、按钮无遮挡。
- mechanism-1440.png、framework-1440.png、compare-mechanism.png、compare-framework.png：两个旗舰编辑器和设计稿左右对照。
- review-panel.png、repair-preview.png、review-fixed.png、export-reviewed.png：原审稿、未应用候选、修复后审稿、导出提示。
- operations.gif：21张真实1440×960浏览器截图，拖动节点、拉连线、切风格、切配色、撤销、保存。
- review-repair.gif：7张真实截图，审稿→预览→取消→确认→撤销→复查→保存；预览/确认之前均未创建版本。
- glyph-sheet-*.png、mechanism-*.png：最终六风格图元样张（7.5px/mm）和六套固定配色样张。
- exports/mechanism-en.pdf、mechanism-zh.pdf及*-render.png：实际最终导出，180×110mm、0位图，中文可提取且嵌入字体。

修复预览先调用原目录/DiagramOperations/DiagramValidator，只读返回候选和前后变化；应用整批只增加一次撤销，保存独立。报告在文档/版本/期刊/尺寸变化时失效，迟到响应不覆盖新编辑。所有用例使用隔离H2/MySQL、合成数据和本地协议夹具；不含任务18收费评测归档或真实工作区数据。

## 需要人决定：Okabe–Ito色对

当前Nature扁平的分区机制图仅使用参与者/过程/模型/注释四角色。以下为实际轮廓色（按规范原色映射），取protan/deutan/tritan三种完全色觉缺陷模拟下最小CIEDE2000；阈值严格保留20。原色值、映射和阈值不改，不把这些warning写成通过。

| 角色 | 实际轮廓色 | 最小ΔE |
| --- | --- | --- |
| 参与者 / 过程 | #0069A4 / #00916A | 11.802929 |
| 参与者 / 模型 | #0069A4 / #BC6F9A | 11.724817 |
| 过程 / 模型 | #00916A / #BC6F9A | 15.103760 |
| 过程 / 注释 | #00916A / #C45600 | 17.863662 |
| 模型 / 注释 | #BC6F9A / #C45600 | 13.643554 |

逐模拟完整值见okabe-ito-audit.json。是否保留配色、依靠标签/形状辅助或另行修订规范，由主人决定。本轮保留原色和提示，未自行处理这项设计决策。

## 本地提交与复现

19-A-7：e1195c1；19-5功能：8b1884711b2f0a68c446c302d6c659fb63da6db8。当前源代码与tested-source-sha256.json逐项按Git LF校验一致；精确构建JAR/依赖锁哈希见source-and-build.json。日志归档统一为LF文本并去除行尾空白以符合Git校验，原始.log继续保存在本机.runtime，本轮没有改写收费评测原始文件。

```powershell
# 在LabFlow仓库根目录；33316须为经datadir核验的本轮隔离MySQL
$env:JAVA_HOME=(Get-ChildItem .runtime/java -Directory|Select-Object -First 1).FullName
$env:Path="$env:JAVA_HOME/bin;$env:Path"
$env:LABFLOW_TEST_DB='h2'
mvn.cmd -B -f backend/pom.xml test
$env:LABFLOW_TEST_DB='mysql'
mvn.cmd -B -f backend/pom.xml test
npm.cmd --prefix frontend test -- --run --maxWorkers=2
$env:LABFLOW_CAPTURE='1'
$env:LABFLOW_DIAGRAM_CAPTURE_PHASE='diagram-19-A-acceptance'
$env:LABFLOW_CAPTURE_PREFIX=(Join-Path (Get-Location) 'docs/test-evidence/diagram-19-A-acceptance')
./scripts/test-agent.ps1 -All -Desktop -FixturePort 18770
```
