# 第六批：数据处理与重复实验汇总

本批先完善功能，不调整首页视觉或入场动效。

## 交付契约

数据管理 → 处理与统计 → 明确过滤、分组、观测单位、可选重复标识和排序 → 服务端无落库预览 → 服务端重新计算并保存独立派生数据集 → 自动映射均值/SD/SEM 或上下界 → 图表保存重开与导出。

采用 Java 计算，Controller / Service / 纯计算器分层。复用 dataset_versions 的不可变行、字段、CSV 字节和 source_meta_json，无新增数据库迁移。新增来源联合类型 data_processing，与既有 experiment_comparison 区分，避免编辑器把所有来源当实验对比。

POST `/projects/{p}/data/{id}/process/preview` 与 `/process` 接收同一 `{name,rules}`：rules 包含 schema_version=1、mode=aggregate/sort、groupBy、metrics、filters、sort、missingGroup=include/exclude、error=sd/sem/none、observationUnit、replicate、x、group、display=bars/band。源版本从 URL 确定；客户端不传计算后的行。

分组键保留字段类型与 null；缺失分组可明确包含或排除。每指标输出 total/n/missing/mean/sd/sem/lower/upper；派生列名由服务端分配并返回 statistics 映射，避免与原分组列冲突。n=0 均值缺失，n<2 SD/SEM 和上下界缺失；不把 SD/SEM 称为置信区间。使用十进制中心化两遍计算以避免大偏置方差相消；不可表示结果拒绝处理，不默默写入无穷数。

每行必须为用户声明的观测单位；可选 replicate 字段验证同组标识不重复且非缺失，不能把同一次运行的多个 epoch 随意视作独立重复。SEM 的解释依赖独立观测假设，不执行显著性检验或自动 CI。

过滤先作用于源行；排序作用于最终输出，最多四个关键字，数值按数值、文本按 UTF-16 字典序、缺失始终最后，同值保留原顺序。无排序规则不自动排序。预览最多 20 行，计数来自完整结果。修改任何规则后旧预览失效，保存必须基于当前规则重新预览。

来源保存源 datasetVersionId/datasetId/version/filename/sha256、算法版本 group-summary-v1、完整规则、统计列映射与行数诊断。派生版本重新上传为新版本时不继承旧计算来源。历史数据、实验对比、图表 schema_version=1 保持兼容。

派生数值内部使用 decimal-strings-v1 编码，避免 MySQL JSON 数值转换改变小数末位；读取仍按字段类型返回 number。计算预览与真实数据库返回做精确比较，未用宽松断言掩盖存储漂移。

汇总图除 X、类别外的一个变化条件自动分面；仍有未映射的变化条件时停止普通曲线绘制并提示设置过滤/分面，避免把不同数据集或实验条件混在一条线中。对已汇总数据再次处理时明确提示观测单位变化。

统计口径依据：[NIST 样本标准差](https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/trimsd.htm)、[NIST 均值标准误](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3521.htm)。

## 验证计划

手算均值/SD/SEM、缺失和 n<2、常量、极大偏置/极小数、重复标识、混合类型分组、排序与不可变性；真实 MySQL 验证预览不落库、保存一致、跨项目拒绝、来源恢复和源文件字节不变；组件交互与真实 Chrome 完整操作、SVG/PNG 导出。

## 运行与验收结果

本机服务继续运行于 `http://127.0.0.1:5176/`，Java 8086、独立 MySQL 33316。启动命令不变：

```powershell
cd 'D:\RAG-agent项目\LabFlow'
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
node scripts/seed-processing-demo.mjs
```

数据管理选择源数据 → “处理与统计” → 选择分组和指标、说明观测单位 → 按需选择重复标识、过滤与排序 → “预览处理结果” → “保存独立数据集”或“保存并绘图”。处理后的数据可下载结果 CSV，并从“数据处理来源”下载固定源文件、查看完整计算规则。切换指标或误差口径等规则后必须重新预览。

演示脚本幂等创建“重复实验汇总 · 合成演示”，17 条合成逐次观测生成 6 个 model×epoch 组。两份派生数据分别采用 SD 误差棒与 SEM 区间带；Method A 最后一个 epoch 只有一次有效观测，均值可见、区间缺失。没有使用真实训练结果冒充演示。

验证：Java 43/43（7 个计算测试、3 个新增真实 MySQL 集成测试）、前端 49/49、完整 Chrome E2E 18/18 通过；分组条件保护最后修订后，前端 49 项及新增 3 条 E2E 再次通过。TypeScript / Vite 构建通过。精确核对预览与 MySQL 行结果、字段、来源规则和指纹；旧实验对比及原有各图表流程回归通过。

修改清单：新增 ProcessingController / ProcessingService / ProcessingRules / DataProcessor；扩展 Dataset 来源联合类型与数值读取编码；新增数据处理弹窗、来源查看及自动均值/误差映射；为多条件汇总图增加分面/未映射条件保护；新增单测、MySQL 集成与浏览器流程、合成数据、演示脚本和 API 文档。无需新依赖、数据库迁移或收费服务。

截图：[预览](screenshots/processing-preview.png)、[SEM 误差棒](screenshots/processing-sem.png)、[SEM 区间](screenshots/processing-band.png)、[演示图](screenshots/processing-demo.png)、[来源](screenshots/processing-source.png)。实际导出：[SVG](exports/processing-sem.svg)、[PNG](exports/processing-sem.png)。均为真实本地应用截图和明确标记的合成数值。

已知边界：源数据格式和规模上限不变；不包含长宽表转换、合并多个源文件、自动 CI/显著性、带权或稳健统计。当前规则不可在原派生版本上覆盖编辑；重新运行产生新数据集，可从来源查看完整规则。汇总图支持现有同类型规则分面，未映射条件需明确过滤或排版。性能、动效及美化按用户要求延后，Plotly 按需包仍约 4.93 MB。
