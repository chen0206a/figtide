# 第三批：分布图与多子图

本批补齐基于真实重复观测的箱线图、小提琴图，以及按序列或字段类别生成的分面图。复用已有不可变数据版本、过滤步骤、历史栈、MySQL 保存和 SVG/PNG 导出。

## 配置约定

schema_version 继续为 1，以可选的 distribution、facet 对象扩展。缺省时采用固定默认值；旧配置不自动改写。新图表创建时写入明确默认值。数据库不增加迁移，所有参数存入已有配置版本 JSON。

- distribution：points(all/outliers/none)、quartileMethod(linear/exclusive/inclusive)、mean、innerBox、bandwidth(空字符串自动/正数字符串)、span(hard/soft)。原始有限数值用于分布计算，缺失值不作为 0。小提琴图至少 3 个观测且至少 2 个不同数值，否则只显示真实观测点并告警。
- facet：mode(none/series/field)、field、columns(1–3)、gapX/gapY(像素)、shareX/shareY、labels、titles(稳定子图键到自定义标题)。最大 8 个子图，超限要求过滤或减少序列，不静默截断。首版所有子图使用同一种图表类型、同一固定数据版本；热力图暂保留单图显示。
- 全局样式与轴参数作用于全部子图；按序列分面时可采用各指标名作为 Y 轴标题。共享范围由 Plotly 的 matches 实现。切换类型或退出分面保留不相关设置。

## 统计与交互边界

箱体使用显式四分位算法；须选用真实逐次观测，不能把汇总均值当作重复样本。小提琴为核密度估计，默认带宽由 Plotly 决定；硬边界限制到样本极值。分布图保留误差列设置但不使用额外误差棒。分类 X 轴忽略对数设置并提示。提供各类别有效样本数、缺失数与极值检查，不生成 p 值或显著性。

参考 Plotly 官方协议：[箱线图](https://plotly.com/javascript/reference/box/)、[小提琴图](https://plotly.com/javascript/reference/violin/)、[坐标匹配](https://plotly.com/javascript/reference/layout/xaxis/#layout-xaxis-matches)。

## 使用

1. 数据管理上传 `samples/demo-repeat-observations.csv`（72 行合成数据：2 个评估集 × 3 个方法 × 12 次观测），将 model 指定为 X、accuracy 指定为 Y。数据不代表真实模型结论。
2. 进入绘图编辑器，选择箱线图或小提琴图；“专业”页调整观测点、四分位算法、带宽与密度边界。
3. 将分面方式设为“按字段类别”、字段设为 dataset，点击“适配多子图画布”；按需要共享 Y 范围并编辑子图标题。
4. 底部“样本检查”显示每个子图、序列、类别的有效 n、缺失、对数排除与极值。
5. 保存后刷新并重新打开；SVG/PNG 使用同一实时图形。SVG 保留路径和文本，无栅格嵌入。

## 验证与交付

- Java 28/28，真实 MySQL 集成测试覆盖旧配置、分布参数与分面 JSON 的保存/恢复、历史版本和非法字段拒绝。
- 前端 23/23，通过测试覆盖原始观测、稀疏/常量类别、缺失与对数排除、轴域分配、分面超限、画布不足、八行布局尺寸限制、样式保留与交互表单。
- Chrome E2E 11/11：含新增真实 CSV → 分布图 → 两子图 → MySQL → 刷新恢复 → SVG/PNG，以及小样本和非法带宽。已知样本 [1,2,3,4,5] 实测 exclusive 的 Q1/Q3 为 1.5/4.5、inclusive 为 2/4、Plotly linear 为 1.75/4.25。
- [箱线图工作台](screenshots/professional-box.png)、[分面工作台](screenshots/professional-facets.png)、[SVG 导出](exports/professional-facets.svg)、[PNG 导出](exports/professional-facets.png)。均为真实浏览器和合成观测。

边界：首版为同类型、同数据版本的规则分面，不能自由混排不同图表或多数据源。热力图暂不分面；不提供 PDF、显著性检验和统计推断。分布图最多 100 个 X 类别、50 个分组，分面最多 8 个子图、200 条轨迹；超限先过滤或减少序列。自动带宽依赖锁定的 Plotly 版本，升级依赖需重新验收。Plotly 按需包体积警告仍存在；未覆盖 Firefox/Safari。
