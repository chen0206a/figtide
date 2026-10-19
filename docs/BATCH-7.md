# 第七批：混淆矩阵、多分类指标与共同样本

本批继续完成功能，不进行首页/动效美化。新增真实标签驱动的 confusion 图类型；预测标签列支持多分类，分数列经显式阈值支持二分类。展示计数、按真实类/预测类/全部归一化，原始计数永久保留在派生报告中。

schema_version=1 增量：Series.prediction 为可选预测标签列；Config.classification 保存算法 classification-v1、真实标签、input=labels/scores、正类/阈值、明确类别顺序、归一化、矩阵序列/分组、轴标题。Config.sampling={policy:independent/intersection,id:string} 统一作用于 ROC/PR 和混淆矩阵；缺省保持旧图独立有效行行为。

共同样本在同一不可变数据版本、当前过滤后的行上取所有可见模型有效预测的交集，不跨文件猜测配对、不按值去重。可选样本 ID 须在过滤后的全集非缺失且唯一；不填写时使用同一数据表的原始行位置。按序列分面的 ROC/PR 也必须使用完整可见模型集合计算交集。

矩阵行=真实类别、列=预测类别，类别按用户显式顺序，最多 20 类。未知类别拒绝，不静默丢弃；归一化分母 0 显示未定义，不显示为 0%。每类报告 support/predicted/TP/FP/FN、precision/recall/F1；零除为 null。macro 任一类未定义则对应平均为 null，weighted 仅考虑 support>0 的类别、若其中指标未定义则为 null；micro 按总 TP/FP/FN 计算。完整单标签分类的 micro P/R/F1 等于 accuracy。归一化仅改变显示，不改变指标。

实时计算使用前端纯函数；Java 校验同一字段、类别、过滤和样本规则，并提供本地权威分类报告接口供 JSON 导出和前后端一致性核对。保存图表时验证类别与样本，不存可替换的实验结果。旧 ROC、数据处理和实验快照配置兼容。

矩阵首版使用单图选择模型/组，报告包含所有可见模型与组；分面设置保留并提示，不伪装支持混合矩阵分面。SVG 使用矩形、文字与 scatter 交互层，不嵌入栅格热图。

验收：已知 3 类矩阵、计数/归一化、缺失/未知类/零除、类别顺序、共同样本及系列分面、ID 校验、多分类加权指标；真实 MySQL 配置恢复、Java/前端报告一致、浏览器编辑保存重开及 SVG/PNG/JSON 导出。依据：[scikit-learn 混淆矩阵](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.confusion_matrix.html)、[分类指标定义](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_recall_fscore_support.html)。

## 使用与运行

启动命令不变：

```powershell
cd 'D:\RAG-agent项目\LabFlow'
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
node scripts/seed-classification-demo.mjs
```

打开 `http://127.0.0.1:5176/`，选择“分类评估与共同样本 · 合成演示”。脚本幂等创建 2 份合成数据与 3 张图：多分类计数、共同样本行归一化矩阵、共同样本 ROC。预测数据 12 行，交集有效 8 行；二分类分数仍使用此前明确标记的合成样例。

自行操作：上传逐样本数据 → 选择混淆矩阵 → “序列”中逐模型映射预测标签列 → “专业”选择真实标签并点击“读取真实与预测类别” → 核查/调整类别顺序 → 选择计数或归一化、模型和组 → 底部“模型评估”查看并导出报告。分数矩阵切换为 scores 后明确正类与阈值，并在序列中映射数值列。ROC/PR 的专业面板也可切换独立/共同有效行与样本 ID。

JSON 导出通过本地 Java `POST /projects/{p}/classification/report`，按当前完整配置重新计算；附带源文件名、版本、指纹、计算配置和源数据行号。归属、类别和 ID 校验与图表保存复用同一流程；不会修改数据集或实验结果。

## 验证与交付

Java 51/51（新增计算 6、真实 MySQL 集成 2）、Vitest 59/59、完整 Chrome E2E 20/20 通过。TypeScript/Vite 构建通过；图表按需包约 4.95 MB，仍有包体积提示。SVG 含矩形/文本/百分比且无 image；PNG 宽 1520 px；Java JSON reports 与前端结果逐项一致，保存和刷新重开后类别顺序、归一化及共同样本策略保持一致。

修改：新增 Java EvaluationSupport / ClassificationEvaluator 与报告入口；扩展 ConfigValidator/WorkspaceService 的字段、类别及样本校验；新增 classification/sampling 配置和 Series.prediction；新增矩阵矢量渲染、分类与样本属性面板、指标报告及服务端导出；修正 ROC 按序列分面的共同样本集合；新增测试、合成数据、演示脚本和 API 文档。旧配置缺省为 independent，不迁移或重写历史图。

截图：[分类矩阵](screenshots/multiclass-matrix.png)、[演示工作台](screenshots/classification-demo.png)。实际输出：[SVG](exports/multiclass-matrix.svg)、[PNG](exports/multiclass-matrix.png)、[Java JSON](exports/multiclass-report.json)。均为真实本地运行和合成样本。

本批未新增依赖、收费 API、数据库迁移或远端推送。没有实现多标签、多分类 ROC/AP、跨文件自动配对、置信区间或显著性。复用模板、备份迁移、PDF、性能和美化继续留待后续批次。
