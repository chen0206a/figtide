# FigTide 任务19：当前页面截图，供视觉验收

截图日期：2026-10-30（Asia/Tokyo）。

来源：feature/diagrams，HEAD a541aed，加当前未提交的19-5后端开发文件及截图脚本。由当前源码重新构建 frontend + desktop JAR，在隔离 H2 测试工作区中打开实际页面。浏览器视口1920×1080，原始PNG截图，无裁剪、修图或合成；全部内容为合成示例，无真实用户数据、无模型调用。

这是一份当前实现的验收材料，不表示19-A已经完成。19-5审稿UI和19-A总验收尚未完成；截图不包含尚未实现的界面。19-B/19-C未开始。

## 截图索引

| 文件 | 页面/状态 |
| --- | --- |
| 01-diagram-list.png | 机制图列表（空列表） |
| 02-new-templates.png | 新建机制图：12模板与6风格入口 |
| 03-new-mechanism-preview.png | 分区机制模板和新版蓝绿配色预览 |
| 04-new-size.png | 成品尺寸与创建步骤 |
| 05-mechanism-editor.png | 分区机制编辑器，未选择元素 |
| 06-node-properties.png | 选择 Protein A 后的属性面板 |
| 07-export-dialog.png | 导出窗口 |
| 08-framework-editor.png | 中文方法框架编辑器 |
| 09-version-history.png | 版本历史 |

## 复现与边界

命令（仓库根目录PowerShell）：

```powershell
$env:LABFLOW_CAPTURE='1'
.\scripts\test-agent.ps1 -Desktop -FixturePort 18770 -Specs @('diagram-capture.spec.ts')
```

本次frontend构建、desktop打包和截图脚本通过（1/1）；启动脚本的JVM重启审计探针也通过。该结果只说明截图流程与所访问页面可运行，不替代功能总验收或视觉验收。

## 给 Claude 的验收说明

请先阅读附带的新版任务书，再对照 reference-design/ 中原始设计参考截图，检查这9张 actual 页面截图。请逐页报告与要求的偏差，尤其关注布局比例、信息密度、字体与成品文字可读性、色彩、科学图元造型、留白、预览尺寸、面板滚动和控件遮挡。标注截图文件名、问题位置、严重程度及具体改法。

不要因为截图流程通过就认定视觉合格。仅凭静态截图无法确认的拖动、撤销、保存冲突和导出行为，请列为需要交互验证；未完成的19-5审稿功能请单独标明，不把它写成已经存在。

压缩包另含新版任务书、原始设计截图及当前进度说明。参考设计与实际截图分目录存放，避免混淆。
