# 演示数据声明

`LabFlow-合成演示-学习曲线.csv` 是可直接上传试绘的 180 行长表（3 个演示模型 × 60 轮）。X=`epoch`，Y=`accuracy_pct`，按 `model` 分组；可选误差列 `accuracy_std_pct`。准确率和标准差的单位均为百分点；`loss` 可单独作为 Y 绘制损失曲线，`n=5`，`data_kind=synthetic_demo`。每个模型/轮次用确定性的指数趋势、正弦扰动和五组固定偏移生成合成重复观测，再计算均值和样本 SD（分母 n−1）。没有进行训练，误差不具有真实实验或置信区间含义。文件为 UTF-8 BOM，含标准表头，不含公式、代码或注释行。

`synthetic-reuse-source.csv` 与 `synthetic-reuse-target.csv` 为第八批两份人工合成学习曲线，使用不同字段名演示显式映射。未进行模型训练，也不带推断统计或误差结论。`node scripts/seed-delivery-demo.mjs` 会用它们创建独立的“成果复用与交付 · 合成演示”。
这里的 CSV 完全由人工合成，用于测试导入、映射、绘图和导出，不来自真实模型训练，不可作为论文实验依据。
`demo-learning-curves.csv` 模拟训练曲线；`measured_std` 也是合成的示例数值，只有显式映射后才显示误差棒。
`demo-heatmap.csv` 模拟模型 × 数据集准确率矩阵，标签仅演示软件操作。

`demo-repeat-observations.csv` 为 72 行确定性合成观测（2 个评估集 × 3 个方法 × 12 次运行），包含 accuracy、f1、latency_ms。每组通过正弦/余弦扰动生成，不来自训练；data_kind 列明确标记 synthetic_demo。适合测试箱线、小提琴、样本数和分面。推荐 X=model、Y=accuracy，按 dataset 分面；不要将两种评估集的结果混合作为同一分布。

`synthetic-classification.csv` 为 22 行人工设定的二分类样本，label=1 为正类；model_a_score/model_b_score 为两组预测分数。最后两行演示缺失分数和标签；每个模型的有效样本数可能不同。使用 ROC/PR 时明确选择 label 和正类 1，再将两个分数列分别加入序列。所有数值只是功能演示，不来自实际模型。

`synthetic-intervals.csv` 为 8 个 epoch 的合成准确率与人工设定上下界，第四行故意缺失区间。设置 X=epoch、Y=accuracy、区间下界=lower、上界=upper。这里的上下界没有统计置信含义，不可称作真实 SD/SEM/CI；系统不会补全第四行的区间。

`synthetic-grouped-runs.csv` 为 17 行人工合成逐次观测（2 个模型 × 3 个 epoch）。按 model+epoch 分组，以 seed 校验重复标识，accuracy 为指标，X=epoch、类别=model，并明确按 model、epoch 升序排序。第一组含一条缺失值；Method A 的最后一组只有一次有效运行，均值可展示，SD/SEM 和区间必须缺失。计算出的 SD/SEM 只是合成数值的汇总，不能据此作模型结论。

`synthetic-multiclass.csv` 为 12 条人工合成三类预测，truth 为真实标签，model_a/model_b 为两个模型预测，sample_id 唯一。类别 cat/dog/bird 只是演示标签；同时含缺失真实值与缺失预测，用于比较独立有效样本和共同有效样本的差异。不是已训练分类器的结果。选择混淆矩阵后明确读取并保存类别顺序，不自动将缺失判作某类。

## 新格式演示

`synthetic-training.jsonl`：合成训练日志，12 条记录，嵌套指标展开为 `metrics.accuracy` / `metrics.loss`。可选择 epoch 为 X、metrics.accuracy 为 Y、model 为分组，预览两条真实来源于样例行的学习曲线；没有误差数据，不配误差棒。

`synthetic-splits.json`：合成训练/验证数组，预览时必须明确选择 `/train` 或 `/validation`，确认后才导入所选数组。两份文件均为界面验收样例，不是真实科研成果。
