# 第四批：论文尺寸、经验分布与科学色彩

本批实现论文物理宽度/mm、成品字号/pt、PNG 有效 DPI 和 SVG 物理尺寸；新增直方图与 ECDF，补热力图科学色阶、固定范围、中心值与单元格标注。所有设置仍保存在 schema_version:1 的可选扩展对象中，旧配置缺省时按旧行为渲染。

协议：publication={enabled,widthMm,fontPt,dpi}，高度由画布宽高比决定；empirical={bins,start,end,normalization,valueTitle,resultTitle}，normalization=count/probability/density；heatmap={palette,min,max,center,labels}，palette=series/viridis/cividis/blueRed。直方图用当前序列 Y 数值列作为观测，X 映射保留供其他类型使用；ECDF 不使用分箱。自动范围从当前过滤后的实际数据推导，不改写原始文件。

直方图采用确定性等宽分箱，左闭右开，最后一箱包括右边界；超出显式分箱范围的观测告警并列入排除数。概率密度为 count/(范围内有效 n × 箱宽)。ECDF 合并重复值，右连续，累计概率为计数/n，不平滑，不生成统计推断。

PNG 在目标物理尺寸下按 DPI 计算输出像素，并写入 pHYs 密度元数据；SVG 保留 viewBox、文本和路径，根尺寸使用 mm。尺寸配置不是期刊认证，字体仍需接收设备支持。PDF、ROC/PR 计算、误差带留待后续独立切片。

参考：[Plotly 静态导出](https://plotly.com/javascript/static-image-export/)、[Nature 图件尺寸说明](https://research-figure-guide.nature.com/figures/building-and-exporting-figure-panels/)。89/183 mm 仅提供通用单/双栏起点，投稿以目标刊物现行指南为准。

## 使用与验收

选择直方图或 ECDF 后，在“专业”设置观测列对应的分布参数；观测列在“图表/序列”的 Y 数值字段中指定。“样本检查”统计缺失和排除，不把它们当 0。

开启“按论文物理尺寸输出”，选择单/双栏宽度、成品基础字号及 PNG DPI。改变编辑器缩放只影响浏览器显示；导出按同一图形配置产生，PNG 物理宽度与元数据允许整数像素的舍入误差。

色阶支持固定 min/max/center，发散中心采用分段线性映射，色标与色块一致；连续色阶取五个锚点插值。单元格标注根据颜色选择黑/白，不等于完成可访问性认证。新建超过五条序列时补线型/点形区分，已有图可显式应用色彩组合。

截图：[直方图与论文尺寸](screenshots/publication-histogram.png)、[ECDF](screenshots/publication-ecdf.png)、[科学热力图](screenshots/scientific-heatmap.png)。实际导出：[SVG](exports/publication-histogram.svg)、[PNG](exports/publication-histogram.png)。均使用合成数据。

GitHub Actions 新增 Java/MySQL 与前端构建测试配置，贡献指南已补充。工作流未推送远端、未在 GitHub 执行；许可证待所有者选择。PDF、完整 ML 评估模板和真实误差带不在本批完成范围。

验证结果：Java 31/31、前端 33/33、完整 Chrome E2E 13/13，TypeScript / Vite 构建通过。SVG 为 89 mm 物理宽度且无 raster image；300 DPI 目标的 PNG 实测 1051×691 px，pHYs 使用对应的实际密度。Plotly 按需包体积警告仍存在。
