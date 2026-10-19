# 第五批：模型评估与实际区间（开发契约）

纵向流程：上传逐样本标签/分数 → 明确正类 → ROC/PR 与指标 → 保存版本 → 重新打开 → SVG/PNG。另为折线图增加用户提供上下界的区间带。

## 数据和计算

- 增量扩展 schema_version=1，旧配置无需迁移。新增 roc/pr 类型和可选 evaluation；Series 新增可选 band。原文件、行数据保持不可变。
- evaluation 固定 algorithm=binary-ranking-v1、missing=exclude，保存标签字段、正类值、有限决策阈值、基准线开关及 ROC/PR 各自轴标题。分数越大越倾向正类；阈值规则 score >= threshold。不自动推断正类或把分数当概率。
- 仅二分类。标签统一按导入后的值字符串匹配；缺失标签/分数不当作零，逐序列报告排除数。分数并列作为同一阈值处理。ROC AUC 为梯形积分；AP 为各召回增量 × 对应精确率之和，不等于梯形 PR AUC。PR 使用阶梯线（vh），无预测阳性时 precision 未定义；有实际阳性且全部漏检时 F1=0。
- 每条序列/分组独立使用有效成对样本，报告 n、正负例、排除、AUC、AP、TP/FP/TN/FN、precision/recall/F1/accuracy。比较不同缺失模式时需用户核查样本数；不隐式取公共交集。单一类别组不生成曲线或 AUC/AP。
- band={enabled,lower,upper,opacity,label} 仅折线图生效。上下界来自已有数值列，不从均值推算，不宣称统计置信度。按原始顺序、分组分别绘制；缺失断开，不跨缺口填充。X 须严格递增，反向上下界不绘带并告警；启用带时保留但不显示误差棒映射。仅 SVG scatter 多边形，无栅格填充。
- 所有变更进入既有历史栈、乐观锁快照与导出路径。分面继承同一计算规则，指标随子图标识聚合。

## 界面和验证

左侧新增 ROC、PR；专业面板放标签、正类和阈值；底部指标检查可导出 JSON（包含数据版本、过滤及计算设置）。序列面板配置真实区间。评估坐标使用线性 [0,1]，原有普通轴设置保留。

覆盖已知手算 AUC/AP、并列分数、中文正类、缺失和单类别、过滤/分面、区间断点与非法顺序，后端字段归属及配置恢复；真实 MySQL 与 Chrome 验收，检查向量导出。完成后记录实际结果。

依据：[scikit-learn AP 定义](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.average_precision_score.html)、[Plotly 向量填充](https://plotly.com/javascript/continuous-error-bars/)。

## 运行与交付

既有本地启动方式不变：`powershell -ExecutionPolicy Bypass -File scripts/start.ps1`，浏览器 `http://127.0.0.1:5176/`。已运行的本地 API 为 8086、独立 MySQL 为 33316。无需数据库迁移，无新增 npm/Maven 依赖。

`node scripts/seed-evaluation-demo.mjs` 幂等创建独立合成演示项目，内含 ROC、PR、实际区间三张真实保存图。可从顶部项目选择器选择“模型评估与区间 · 合成演示”，重新打开图表。分数列在图表/序列面板映射，标签与正类在专业面板，指标在底部“模型评估”；区间在折线的序列属性中启用。

修改：模型类型与派生算法、绘图和分面协议、专业/序列/指标面板、Java 配置形状和数据字段校验、保存恢复集成测试、真实浏览器测试、合成数据和演示脚本、API/运行/验收文档。evaluation 和 band 为可选增量，旧图不自动重写配置。

验证：Java 33/33、Vitest 43/43、完整 Chrome E2E 15/15 通过；单类别分面最后修订后，再跑 43 项前端测试与新增 2 条 E2E 通过。TypeScript / Vite 生产构建通过。浏览器验收核对真实 MySQL 重新打开、原始文件不变、SVG 文本/路径、PNG 尺寸。错误区间拒绝保存，不改写现有快照。

截图：[双模型 ROC](screenshots/evaluation-demo.png)、[PR 与指标](screenshots/binary-pr.png)、[实际区间](screenshots/actual-bands.png)。实际导出：[PR SVG](exports/binary-pr.svg)、[评估 JSON](exports/binary-evaluation.json)、[区间 SVG](exports/actual-bands.svg)、[区间 PNG](exports/actual-bands.png)。全部为合成数据；区间示例不具有统计置信含义。

已知边界：只做二分类，AUC/AP 不带置信区间；各模型独立有效行、无隐式配对；排序只发生在计算评估曲线的副本，普通折线和区间不自动排序。PDF、多分类宏/微平均、自动重采样和显著性留待后续。Plotly 按需包约 4.93 MB，构建仍提示包体积较大。
