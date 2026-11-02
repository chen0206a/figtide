# 19-B/C 第二轮视觉返工材料

日期：2026-11-02。对应主人本轮 1–3 项；此包全部 PNG/GIF 为 1440×960 视口，不使用 full-page。图像来自本地生产版桌面 JAR 与隔离 H2 的实际浏览器操作。助手输入/输出是人工编写的合成协议夹具，不是模型质量或科学有效性评测。

| 要求 | 证据与自检 |
| --- | --- |
| 简报两行，点击编辑；紧凑事实和原文出处 | assistant-02-facts.png；未编辑时无 textarea，主按钮完整可见 |
| 蓝色编号结构、默认可取消修复、D8 等待确认 | assistant-03-proposal.png（顶部），assistant-03b-three-groups.png（同一面板内滚动后）；三组各自有标题，唯一主按钮固定底部 |
| 取消事实排除结构，恢复勾选可恢复 | assistant-04-fact-excluded.png：取消第3条后Ruxolitinib及抑制边消失，共享RAS保留；assistant-05-ready.png恢复；assistant-fact-selection.gif为这些实际操作帧 |
| 一次应用，不自动保存 | assistant-06-applied.png；E2E另验证一次撤销/重做、手动保存与追改 |
| 无搜索图标网格至少3屏 | icons-grid-1-Lab_apparatus.png、icons-grid-2-Genetics.png、icons-grid-3-Cell_types.png；搜索框均为空，覆盖实验器具/遗传学/细胞类型 |
| 细长图标等比放大居中 | icons-thin-fitted.png（补充搜索示例，不计入无搜索3屏）；getBBox实测长边占viewBox>90%，居中误差<3% |
| 辨识度高的插入效果 | icons-recognizable-inserted.png：抗体、线粒体、整体小鼠；图标保留比例，画布上标签可读 |
| 7pt/1pt默认修复、全图标记错开 | review-panel.png、repair-preview.png：全图编号横向错开；预览明确3→7pt、0.2→1pt，尚未应用 |

截图逐张自检未见遮挡主操作、文字中间断词或图标拉伸。长提案在右栏内部滚动，主按钮固定；两张提案截图分别展示顶部与底部，不将长页面拼成full-page冒充视口。科学图是协议功能示例：夹具故意提出原文没有的Ruxolitinib来触发D8，必须由用户判断，不宣称真实模型生成质量。

同色提示的前后端测试断言“过程和输出用了相同颜色”；不同原色但色觉模拟接近仍使用接近提示。机制图D3仍<10 warning、10–20审稿info，数据图R3仍20。默认机制模板的最小ΔE00仍11.72481721271584（参与者/模型），0 warning、5 info，默认配色区无提示。其他图若实际使用同色角色则如实提示。

图标151项，新增CC0整只小鼠，原150个ID保留。按需加载/缓存与导出内联保持；含本轮助手新增代码后活动异步chunk为216712字节，gzip77869，相对原2709712/606989下降约92.00%/87.17%；详见icon-loading-benchmark.json。

完整命令、计数及跳过原因见acceptance.json和docs/TEST-RESULTS.md。第一次新节点E2E发现7.0/7导致排版语义误判，已按数字语义比较修复并回归。补充图标规范化测试曾发现尾部换行导致非规范SVG，已规范化并通过原安全/哈希断言。未删除或弱化旧断言。

未执行：draw.io人工交互编辑/保存重开确认（之前CLI打开渲染已通过，不能替代人工）；真实模型质量/费用评测（本轮无收费调用）；真实工作区、人工托盘/SmartScreen重验。自己的真实模型评测报告、原始输出及费用记录继续只留本地，不在Git或此包内。

B/C第一轮已通过的其他页面、参考风格/外部图层/导出材料仍见../diagram-19-C/VISUAL-PACKAGE.md；本包专门补交本轮返工。主人尚未确认本轮视觉验收，PR不合并、不发布。
