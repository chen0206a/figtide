# 19-A-7 收尾（2026-10-31）

任务19-A-7：真实科研示例与创建页收尾。

改动文件：10个模板JSON；DiagramWizard/diagram.css；geometry.wrapLabel；glyphs；DiagramPaletteAudit/DiagramCatalog；PaletteSelect/model；相关单测、E2E和证据。后端改动属于任务19配色目录/确定性审稿授权；无迁移、保存或预算语义改变。

验证：前端全量 `npm test -- --run` 582/582（69文件）；精确源副本 `npm run build` 通过；H2 `mvn -B -f backend/pom.xml test -Dtest=DiagramCatalogTest,DiagramValidatorTest,DiagramOperationsTest,DiagramIntegrationTest` 67/67；桌面 `scripts/test-agent.ps1 -Desktop -FixturePort 18770 -Specs diagram-cleanup.spec.ts,diagram-capture.spec.ts,diagram.spec.ts` 6/6、真实JVM重启审计通过。MySQL全量未执行：留待19-5完成后统一执行总验收。本节没有宣称19-A总验收通过。

首次新增E2E夹具漏传项目description，导致项目创建失败、导航undefined、1失败/1通过；已补齐必填字段并断言ID，第二轮6/6。右栏高度改为扣除完整导航和页头，按钮在1440×960首屏内，滚动内容与操作栏无交叠。

与任务文件的偏差：按主人最新收尾要求替换原占位文字；12模板保留。双组对比为平行实验组；概览对比为共享输入的两条方法分支；步骤放大为顶层流程+文库细节展开。示例无虚构测量数值，化学图明确示意。

对应原视觉问题：05/08图元标记与文字、05模板示例、19-1新建页布局/缩略图/配色；本轮新增1–6项均已实现。原A–C主体验收按主人本轮反馈记为通过；19-5及19-A总验收仍待完成。

## 截图

- templates-overview.png：12模板总览。
- new-page-1440.png：1440×960视口完整页面；new-page-lower-controls.png：右栏滚动到底，完整配色/尺寸及固定操作栏。
- 02-new-templates.png、03-new-mechanism-preview.png：1920宽整页。
- glyph-sheet-*.png：六风格全部31图元；P与编号为实心圆+粗体字。
- 05-mechanism-editor.png、08-framework-editor.png、07-export-dialog.png；exports/实际英文/中文机制图PDF。

## Okabe–Ito 检查结果（待主人决定）

当前分区机制图、nature-flat、实际角色 actor/process/model/note。只比较渲染轮廓，不比较浅填充。Machado三种完全色觉缺陷模拟+CIEDE2000，阈值保持20，下面列各色对三种模拟中的最小ΔE；原色值不改，不自动修色。逐模拟数值见okabe-ito-audit.json（数组顺序protan/deutan/tritan）。

| 角色 | 实际轮廓色 | 最小ΔE |
| --- | --- | --- |
| 参与者 / 过程 | #0069A4 / #00916A | 11.802929 |
| 参与者 / 模型 | #0069A4 / #BC6F9A | 11.724817 |
| 过程 / 模型 | #00916A / #BC6F9A | 15.103760 |
| 过程 / 注释 | #00916A / #C45600 | 17.863662 |
| 模型 / 注释 | #BC6F9A / #C45600 | 13.643554 |

需要人决定的事：以上5个色对仍低于20，是否保留规范配色并依靠形状/文字辅助，由主人决定。本次保留提示和原规范，不因这项决策阻塞已授权的19-5开发。
