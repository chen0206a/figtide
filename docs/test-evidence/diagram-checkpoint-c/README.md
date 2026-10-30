# 19-A 视觉返工 A–C：最终验收入口

日期：2026-10-30，Asia/Tokyo。分支：feature/diagrams。只在本地提交，未推送。

这是返工实现及证据交付，**尚未获得主人视觉验收通过**。按主人最新“从A一直做到C”的指示连续完成；19-5保持暂停，19-A总验收尚未开始。A/B目录保留阶段历史，**本目录C为最终实现材料**。

## 最先看这些图

| 材料 | 文件 |
| --- | --- |
| 物理装置分类与分区拖动复核 | [10-optics-editor.png](10-optics-editor.png) |
| 新建页完整文档截图 | [new-page.png](new-page.png) |
| 分区机制编辑器，1440×960 | [mechanism-1440.png](mechanism-1440.png) |
| 方法框架编辑器，1440×960 | [framework-1440.png](framework-1440.png) |
| 导出窗口完整截图 | [export-dialog.png](export-dialog.png) |
| 真实操作GIF | [operations.gif](operations.gif) |
| 分区机制左右对照 | [compare-mechanism.png](compare-mechanism.png) |
| 方法框架左右对照 | [compare-framework.png](compare-framework.png) |
| 12模板缩略图总览 | [templates-overview.png](templates-overview.png) |
| 六风格图元总览 | [glyph-sheet-overview.png](glyph-sheet-overview.png) |
| 六配色分区机制总览 | [mechanism-overview.png](mechanism-overview.png) |

新建页采用实际1440×960浏览器视口的full-page截图，因此PNG高于960，完整保留12个模板和右栏表单；固定创建按钮是实际页面控件。左右对照仅拼接原始页面与原设计图，不修改两侧内容。英文长模块名按7pt自动换行，不压缩成更小字号。旗舰模板的小分子按05 #6进一步缩到不超过JAK宽度，路径几何保持原型；会议分组标题保留原浅色带，文字按4.5:1可读性改为深色。

## 检查点A的最终样张

全部图元按7.5px/mm输出，前3行沿用golden样张的24个对象顺序，另加现有独立标记和兼容的低值柱图；底部附双层磷脂膜。对应SVG一起保存。样张使用统一Okabe–Ito配色以比较形状，风格独立于配色；因此多数非手绘独立图元的轮廓相同，圆角、填充及手绘线条按风格区分。等距面体用于框形节点，不将受体/蛋白强行立体化。

| 风格 | PNG | 配色 | 分区机制PNG |
| --- | --- | --- | --- |
| Nature扁平 | [样张](glyph-sheet-nature-flat.png) | Okabe–Ito | [机制图](mechanism-okabe-ito.png) |
| 柔和插画 | [样张](glyph-sheet-soft-illustration.png) | NPG风格（非官方） | [机制图](mechanism-npg.png) |
| 线稿极简 | [样张](glyph-sheet-line-minimal.png) | AAAS风格（非官方） | [机制图](mechanism-aaas.png) |
| 会议框架 | [样张](glyph-sheet-conference-framework.png) | NEJM风格（非官方） | [机制图](mechanism-nejm.png) |
| 等距3D | [样张](glyph-sheet-isometric.png) | Lancet风格（非官方） | [机制图](mechanism-lancet.png) |
| 手绘草图 | [样张](glyph-sheet-sketch.png) | JAMA风格（非官方） | [机制图](mechanism-jama.png) |

六套配色图均使用Nature扁平，表格左右两组是独立材料，并不将特定风格绑定到某套配色。期刊色值原样保留；实际色觉不达标色对由目录返回并在界面提醒，阈值仍是ΔE00≥20。

## VISUAL-REVIEW-19A.md编号落实

以下是实现状态，不能替代主人/Claude对图片的视觉判定。

| 问题编号 | 实现与证据 |
| --- | --- |
| 05 #1/#15、08 #1 | 默认纸宽=画布区×0.9，最小4px/mm；单一真实缩放百分比、适应宽度按钮；浏览器实测1440/1920 |
| 05 #2–#6 | 规范受体封闭三段、品字配体、无内部细胞装饰的蛋白、二聚体顶边双P、共边六边形小分子；glyph-sheet-*与机制图 |
| 08 #2/#3 | LLM横条仅上下两端；原型块尺寸、可见冻结/火焰标记；framework-1440 |
| 线宽与配色 | 1pt轮廓、1.25pt边、0.75pt分区、0.5pt膜头、0.6pt引线、1.8pt光路、7pt正文；六配色与明确警告 |
| 05 #7–#11 | 胞外去框、浅胞质、右端膜标签带底、浅双核膜、图例不含Flow且固定排序、转运虚线、图元本体吸附及规范直角线路 |
| 05 #12、08 #4–#6 | JAK–STAT及视频问答示例；橙色三级注意力图、低值筛选柱图、无色带放大框、两条规范放大引线 |
| 02–04 #1 | 12模板均含至少两类科学图元；另补与类型匹配的光路/能级示意；缩略图非缩放描边下限1px |
| 05 #13/#14 | 四列图元面板、点击中心添加/真实拖拽、未选中画布属性、折叠图层；C截图及交互测试 |
| 02–04 #2–#4 | 三栏整页，左中文科研图示类型及英文小字，中模板，右名称/预览/六风格/六配色/成品尺寸；无无效步骤标签，创建按钮固定 |
| 06 | 标记/编号折叠，右栏独立滚动；06-node-properties.png |
| 07 | 矢量预览、格式说明、PNG像素；export-dialog及SVG/PNG/PDF下载用例 |
| 01 | 三个“从模板开始”入口卡片；01-diagram-list.png |
| 09 | 保留版本恢复及冲突语义，历史UI留图；09-version-history.png |

本轮未留待开发的上述必修编号；是否满足视觉标准由主人明天验收决定。未做的既定后续项：19-5审稿面板/标记及19-A总验收、19-C署名和外部素材、AI调用。系统默认浏览器打开图库的人工检查未执行；无本轮相关产品改动。

## 真实交互与导出

GIF由gif-frames/内21张顺序采集的真实浏览器操作帧合成，延长停留便于观看，不作为性能计时。顺序为拖动JAK、拉出连线（含拖动预览线）、切柔和风格、切NPG配色、撤销配色、保存。对应浏览器还测试了空列表卡片预选对应模板、光学平台携带子节点/撤销、按metadata初始化图元分类、点击添加、原生dragTo添加、一次撤销、草稿恢复、框选、分区带节点移动、Ctrl+S、409和历史恢复。

[英文PDF](exports/mechanism-en.pdf)、[中文PDF](exports/mechanism-zh.pdf)及各自Poppler预览在exports/。检查：180×110mm、无位图、中文嵌入字体且可提取；预览人工查看。显式矢量箭头避免marker缩放，斜体用矢量倾斜保留，PDF将500/600规范到已有常规/粗体字库；原数据图PDF代码未改。

## 验证结果

- 前端全量：67文件，580/580通过；机制图286/286；build通过。
- 后端H2全量：441项，440通过、1既有显式外部评测跳过，0失败/错误。
- 后端MySQL全量：446项，445通过、1同上跳过，0失败/错误。
- 相关E2E：diagram.spec.ts、diagram-visual-rework.spec.ts、diagram-capture.spec.ts共8/8通过；独立JVM重启审计探针通过。
- 跳过的是ServerEvaluationTest（未指定labflow.eval.server），没有调用真实收费服务。完整19-A总验收、全产品Playwright及MCP全套未执行：按要求先交视觉返工，且本轮未改MCP；不能写成全部总验收通过。
- 最后一次纯模板zone关联调整后H2相关67/67通过；MySQL未再复跑（无Java/SQL/API变化，已有全量结果，同一校验/存储逻辑由H2确认）。
- 首轮夹具、样式控件折叠断言、旧图元数量、过期快照、斜体/箭头/字体权重导出问题均已修复后复跑；原失败日志保留在.runtime/logs/task19-rework-*。

## 兼容扩展与边界

唯一新增文档字段为可选style.palette，缺省okabe-ito。已有zoom_of字符串兼容接受节点来源以表达模块放大，旧分区引用不变；已有glyph枚举兼容增加result-bars-low，对应原型chartlow。旧30图元和旧文档仍有效，数据库迁移未改。原型未定义独立的cell/vesicle/phospho/number，保留已有实现；其余规范路径和badge坐标有逐项测试。线稿使用白色遮挡及描边，避免叠层穿透/图元隐形；这不是改变配色色值或降低色觉阈值。

19-5草稿封存在41ab753，其review/diagram文件、DiagramService和DiagramToolController在返工中没有再修改。恢复19-5时应接入当前图例规则、内生P标记、显式箭头端点及palette_audits，再实现审稿面板和画布标记。

## 复现

```powershell
$env:LABFLOW_CAPTURE='1'
$env:LABFLOW_DIAGRAM_CAPTURE_PHASE='diagram-checkpoint-c'
.\scripts\test-agent.ps1 -Desktop -FixturePort 18770 -Specs @('diagram-visual-rework.spec.ts','diagram.spec.ts','diagram-capture.spec.ts')
$env:LABFLOW_DIAGRAM_EVIDENCE_DIR='docs/test-evidence/diagram-checkpoint-c'
node scripts/capture-diagram-evidence.cjs
node scripts/compose-diagram-comparisons.cjs docs/test-evidence/diagram-checkpoint-c
python scripts/assemble-diagram-operation-gif.py
```

数据仅为隔离H2/MySQL合成夹具；不使用真实用户库，不发送模型请求，不推送GitHub。请将此README、最终C材料、新版任务书、原始设计截图及review19规范一起交给Claude验收。
