# API v1

## 第八批增量协议：成果复用与交付（2026-10-19）

`GET /api/style-templates` 返回本机全部模板 `{id,project_id,project_name,name,schema_version,profile,created_at}`；`POST /api/projects/{p}/style-templates {name,config}` 从合法 schema v1 图表中提取外观白名单，返回 `{id,name,profile}`；`DELETE /api/style-templates/{id}` 返回 `{deleted:id}`。本地单用户模式，模板创建项目用于归属和备份，可跨项目应用。profile v1 不含数据版本、字段、标题、轴范围/对数、过滤或统计值；序列只包含 color/opacity/width/dash/symbol/size 及可选 band.opacity。

整图复用仍使用 `POST /projects/{p}/charts`。前端选择目标不可变版本并显式映射所有保存的字段引用，包含暂未启用的热力图、评估、分面、区间和过滤配置；保留非字段设置，清空旧类别的自定义分面标题及矩阵分组选择。服务端按原有保存规则再次验证，失败不创建图表。

`GET /api/projects/{p}/backup` 返回 `application/zip` 附件 `.labflow.zip`。`POST /api/backups/preview` multipart `file` 只读校验格式/内容指纹/内部引用，返回 `{format,name,created_at,counts,original_bytes}`。counts 包含 datasets/dataset_versions/experiments/experiment_datasets/charts/chart_versions/style_templates。

`POST /api/backups/restore` multipart `file` + `name`，重新校验并在事务中创建未归档新项目，返回 `{id,name,summary}`。不覆盖同名项目。ID 全部重新分配，只有协议定义的引用会重建；版本、revision、UTC 创建/更新时间、实验参数/指标和源文件字节保留。来源快照中的历史显示文本（例如名称内的旧编号）作为原始实验内容保留，不当作外键改写。

备份 format=`labflow-project-v1`：ZIP 仅含 `manifest.json` 与其 UTF-8 字节的十六进制 SHA-256 `sha256.txt`。manifest 包含 project 和 tables，数据库 JSON 列作为原文字符串保存，原文件 Base64；完整列合同见 BackupService.COLUMNS。压缩限 64 MiB、展开限 96 MiB、每表最多 10000 条；原始单文件仍限 10 MiB。没有写入上传路径或解压目录。重复条目、重复 ID、其他路径、损坏指纹、缺失引用、不完整图表历史、未知格式/来源 schema 拒绝；失败整体回滚。校验和只检查损坏，不认证发布者。

PDF 在浏览器本地由同一 Plotly SVG 转换，使用随项目提供的 OFL Noto Sans SC 常规/粗体，按需载入 jsPDF + svg2pdf.js；不增加后端 PDF 上传或第三方服务。字体缺失字形、斜体/混合字体富文本、字符定位无法保持时明确报错，避免静默替换。物理尺寸开启时页面按 mm，未开启按 96 px/in；SVG/PNG 字体选项保持兼容。Noto Sans SC 是 schema v1 的增量可选字体，旧配置不改写。

本地基址 `http://127.0.0.1:8086/api`。UTF-8 JSON。当前返回创建资源 HTTP 200。上传为 `multipart/form-data`，字段名 `file`。数据库 ID 为整数。

## 第七批增量协议：混淆矩阵与共同样本（2026-10-19）

图表 type 新增 confusion。chart schema_version=1 与保存/版本/重新打开接口不变。以下为可选扩展片段；classification 存在时内部字段完整，confusion 活跃时额外验证类别与字段。Series 可选新增 prediction（≤120 字符，预测标签列）；旧 y 保留给数值图/分数模式，标签矩阵不要求旧 y 仍有效。

```json
{
  "sampling":{"policy":"intersection","id":"sample_id"},
  "classification":{
    "algorithm":"classification-v1","label":"truth","input":"labels",
    "positive":"1","threshold":0.5,"classes":["cat","dog","bird"],
    "normalization":"true","seriesId":"model-0","groupValue":"","xTitle":"","yTitle":""
  }
}
```

- sampling 同时作用于 ROC、PR 和 confusion；缺省 independent/id空，兼容旧图。policy=independent 按每个模型自身有效预测行；intersection 取所有可见模型的共同有效行（真实标签非缺失、每个可见预测有效）。按模型分面的 ROC/PR 使用完整父级模型集合确定交集，不在子图中退回独立行。
- id 为空时按同一不可变数据版本的行位置对齐；非空时必须为源字段，在当前过滤后的全集非缺失且唯一。不是跨数据文件 join，也不按内容猜测重复样本。隐藏/显示模型会改变交集，配置持久化这一策略。
- classification.algorithm 只接受 classification-v1；label 为源字段，input=labels/scores。labels 使用各可见 series.prediction，可为文本或数值标签；scores 使用 series.y 的有限数值，必须恰好两类且 positive 为其中一类，预测规则 score>=threshold。threshold 为任意有限 JSON number，分数越大越倾向正类，不要求为概率。
- classes 为用户明确的类别顺序，活跃矩阵要求 2–20 个不重复非空值，各 ≤500 字符。通过“读取真实与预测类别”显式初始化，未知真实或预测类别返回 400，不自动忽略。数值标签按导入值字符串形式解释；复杂类别建议使用文本标签。
- normalization=count/true/pred/all，分别为计数/按真实行/按预测列/按全部有效样本归一化。分母为零时 matrix 对应单元格 null，图中显示 —；计数仍保留为 0，未观察到不等于观察到 0% 准确率。
- 行=真实类别，列=预测类别，真实首类显示在顶部。矩阵使用 SVG 矩形与文字，同一配置用于实时画布、SVG、PNG，自动标注所选模型/组与有效 n。
- seriesId 为空时取首个可见模型；非空须存在。groupValue 为空时取当前模型首组；非空是分组原始值的 JSON 字符串（例如文本 A 编码为 `"\"A\""`，数值 1 为 `"1"`，缺失为 `"null"`）。选择失效时告警，不悄悄显示另一组。单图模型/分组选择器不限制底部报告，报告包含全部可见模型与组，最多 100 个模型分组。矩阵分面暂不支持，原分面设置保留。
- xTitle/yTitle 各 ≤500 字符，空时 Predicted class / True class；原普通坐标轴范围/对数、误差棒和线型映射均保留但不作用于矩阵。无效的未使用误差列不阻塞分类图保存。
- 每类 support/预测数/TP/FP/FN 及 precision=TP/(TP+FP)、recall=TP/(TP+FN)、F1=2TP/(2TP+FP+FN)。零分母为 null；macro 对任一未定义值传播 null，weighted 按 support>0 类别加权且传播其中的未定义值；micro 在完整单标签分类中等于 accuracy。不计算多标签、多分类 ROC/AP、统计显著性或置信区间。

`POST /projects/{p}/classification/report` 接收 `{config:<完整图表配置>}`，要求 type=confusion。Java 端执行同一配置/归属/过滤/类别/ID 校验，并重新计算。返回 `{schema_version,datasetVersionId,source,classification,sampling,series,group,transforms,reports}`。source 含 filename/version/sha256；不写数据集、不覆盖原始标签或预测。

reports 每项包含 seriesId/series/groupKey/group/classes、原始 counts、显示 matrix、n/excluded/ownMissing/excludedByOthers、accuracy、perClass、macro/micro/weighted，以及 sampleRows（相对固定源版本的 1 基行号，不含 CSV 表头）。所有归一化共享同一 counts 与指标。前端 JSON 导出使用此接口，浏览器测试与前端纯函数逐项比较 reports。

ROC/PR 的既有 metrics 增加 ownMissing/excludedByOthers；原 excluded 仍为总排除数，JSON 导出新增 sampling。旧配置无 sampling 时行为保持独立有效行。

## 第六批增量协议：数据处理与重复实验汇总（2026-10-19）

`POST /projects/{p}/data/{id}/process/preview` 与 `/process` 接收同一请求。id 为固定源版本，必须属于 p；所有分组、过滤、指标、重复标识均验证源字段归属。客户端只提交规则，不接受替换行数据。

```json
{"name":"模型均值 SEM","rules":{
  "schema_version":1,"mode":"aggregate","groupBy":["model","epoch"],"metrics":["accuracy"],
  "filters":[],"sort":[{"field":"model","direction":"asc"},{"field":"epoch","direction":"asc"}],
  "missingGroup":"include","error":"sem","observationUnit":"同一模型与 epoch 的独立 seed 运行",
  "replicate":"seed","x":"epoch","group":"model","display":"band"
}}
```

- name 为 1–120 字符，提交保存时拒绝路径/控制字符。schema_version 固定 1，mode=aggregate/sort。groupBy 最多 4 列、metrics 最多 5 个数值字段，均不得重复。aggregate 要求 metrics 非空且 observationUnit 非空（最多 120 字符）；未分组时生成 __summary=全部，汇总全体符合过滤的观测。
- filters 最多 8 条，格式 `{field,operator,value}`；operator=eq/gte/lte/missing，均按 AND 组合。数值列 eq 按十进制数值比较；文本 eq 区分大小写、精确匹配。gte/lte 仅数值字段，边界为十进制字符串；missing 仅匹配 null，value 保留但不用。过滤先作用于源行，完全无结果返回 400，不生成空数据集。
- sort 最多 4 条 `{field,direction:asc|desc}`，字段不得重复，作用于结果列，优先级按数组顺序。数值排序、UTF-16 文本字典序、缺失始终最后，同值稳定；空数组不自动排序。界面汇总模式目前提供分组列排序，API 也可排序返回的统计列。
- missingGroup=include/exclude。include 按类型和实际值分组，null 与文本“null”不同；exclude 排除任一分组字段缺失的行。replicate 为可选源字段，选择后同组标识必须非缺失且唯一，否则 400；不自动去重。
- error=sd/sem/none；display=bars/band，为新建图的误差显示提示。x/group 为空或源分组字段，二者不能相同；band 要求 x 是数值分组字段。n/mean/SD/SEM 均计算，不受 error 切换影响；lower/upper=mean±所选误差，none 时缺失。这不是置信区间。
- 每指标输出 total/n/missing/mean/sd/sem/lower/upper 八列；列名通常为 `<metric>__<stat>`，过长或冲突时确定性分配，客户端以返回的 statistics 数组 `{metric,columns:{...}}` 为准。n=0 时 mean=null，n<2 时 sd/sem/lower/upper=null，常量重复 SD=0。SD 分母 n−1，SEM=SD/√n。十进制中心化两遍计算；不可表示的有限数结果返回 400，提示调整单位。输出上限 20,000 行、200,000 个单元格、保存 CSV 最多 10 MB。
- preview 不写库，返回 `{fields,rows,row_count,warnings,statistics,counts,rules,source}`；rows 只取前 20 行，row_count/counts 来自完整结果。counts 包含 source_rows/filtered_rows/excluded_rows/output_rows/groups/missing_group_rows；excluded_rows 包含过滤排除和明确排除的缺失分组行，sort 模式 groups=0。
- commit 使用同一计算器重新计算并在事务中创建独立 dataset 和 v1，返回完整 Dataset；结果 CSV 通过现有 original 接口下载。结果不会覆盖源数据或已有派生版本；可对任意派生版本继续执行处理，来源引用直接上游版本。
- source_meta 联合新增 `{schema_version:1,kind:data_processing,algorithm:group-summary-v1,numeric_encoding:decimal-strings-v1,created_at,source,rules,statistics,counts}`。source 为 `{datasetVersionId,datasetId,version,filename,sha256}`。为避免 MySQL JSON 二进制浮点转换改变末位，派生数值在 rows_json 内按精确数值文本存储，读取按字段类型恢复 JSON number；外部 rows 协议未改变。
- datasets 列表新增 source_meta，与 detail 同一联合类型。旧上传和 experiment_comparison 兼容；source_meta.kind 必须区分读取，不再把所有来源当作实验对比。处理来源仅在创建结果时写入，新上传的版本不继承旧处理规则。
- 汇总新图从 statistics 映射每指标的均值与所选误差列，数值 X 用折线、类别 X 用柱状图；一个额外变化条件自动设置分面。普通折线/柱状/散点若仍有未映射的变化分组字段，画布停止绘制并提示过滤或排版，避免跨条件连线；不自动合并或丢弃条件。

## 第五批增量协议：模型评估与实际区间（2026-10-19）

新增 `type=roc|pr`，继续使用同一图表快照和 revision 协议，schema_version=1。如下为增量片段；对象出现时内部字段必须完整。旧配置不添加字段也可重新打开，切换普通图时保留评估与区间配置。

```json
{
  "evaluation": {
    "algorithm":"binary-ranking-v1", "missing":"exclude",
    "label":"label", "positive":"1", "threshold":0.5, "baseline":true,
    "rocXTitle":"", "rocYTitle":"", "prXTitle":"", "prYTitle":""
  }
}
```

- `roc/pr` 必须包含 evaluation；label 为当前数据版本字段（不超过 120 字符），positive 为明确选择的标签值（最多 500 字符），threshold 为有限 JSON number，分数 ≥ threshold 判为正类。`series.y` 仍是唯一的分数列映射，必须为当前数据版本数值字段，不另设重复字段。分数越大越倾向正类，可为任意有限数值，不自动要求概率。
- algorithm 只接受 binary-ranking-v1；missing 只接受 exclude；baseline 布尔，轴名称各最多 500 字符，留空采用 ROC/PR 语义默认值。评估图固定线性 [0,1]，普通图的 axes 范围、对数和标题原样保留。`x` 不参与评估计算，不要求有效；group、facet、transforms 仍检查字段归属。
- 过滤后非缺失标签须恰有两种，positive 必须为其中之一，否则预览告警、保存返回 400。数字标签按数值的字符串形式匹配（例 0/1），建议文本标签使用明确且稳定的类别名称。
- 每个序列/分组独立排除缺失标签或分数；显示有效 n、正负例与排除数。不自动将多模型限制到共同有效行。有效样本少于两类的组不绘评估曲线，AUC/AP 为 null，混淆计数仍报告实际值。分数并列按同一阈值处理，ROC AUC 梯形积分，AP=Σ(召回增量 × 当前精确率)，PR 阶梯 shape=vh。无预测阳性 precision=null；无实际阳性 recall/F1=null，空样本 accuracy=null。
- ROC 参考线为随机排序对角线；PR 参考线为当前组有效样本正类比例。最多 100 个序列分组，不截断样本。指标为前端确定性派生值，图表数据库保存原数据版本与完整计算配置，不接受替换原始实验结果。
- 底部评估 JSON 包含数据版本、算法与阈值、分数列、分组、分面、过滤、逐序列指标，不包含原始样本；用于追溯派生指标。

Series 可选新增：

```json
{"band":{"enabled":true,"lower":"lower","upper":"upper","opacity":0.18,"label":"实际区间"}}
```

- band 仅在 line 下启用，X/lower/upper 须为同数据版本数值字段。opacity 为 0.05–0.6，label 最多 120 字符。上下界不会由系统推算或自动解释为置信区间；若原数据存在下界大于上界，保存拒绝，不产生快照。
- 按分组和原始行顺序绘制，X 必须严格递增，不满足时保留中央曲线、停止区间绘制并告警，不自动排序。缺失中心/X/上下界、非正对数坐标处截断多边形；单点片段不填充，不跨缺口插值。
- 启用带时 error 映射保留但不同时显示误差棒；图层选择、分面、样式、撤销恢复和 SVG/PNG 走相同渲染路径。

## 第四批增量协议：论文尺寸与经验分布（2026-10-19）

type 新增 histogram/ecdf。继续使用现有图表保存、版本和重新打开接口，schema_version:1；以下为可选扩展片段，缺省时保持旧图行为。对象一旦出现，需完整提交内部字段。

```json
{
  "publication": {"enabled":false,"widthMm":183,"fontPt":8,"dpi":300},
  "empirical": {"bins":20,"start":"","end":"","normalization":"count","valueTitle":"","resultTitle":""},
  "heatmap": {"palette":"series","min":"","max":"","center":"","labels":false}
}
```

- publication.widthMm 为 50–300 mm，fontPt 为 4–24 pt，dpi 为 72–1200；enabled 为布尔值。高度按逻辑画布宽高比推导，不维护重复的高度真值。style.width/height/fontSize 保留编辑器逻辑尺寸与原始字号；开启时渲染器换算成品字号并为变大的文字扩展边距，关闭后恢复原样式。
- SVG 导出保留原 viewBox，根宽高写为 mm；文字仍为可编辑文本，不嵌入字体。PNG 像素宽度=round(widthMm/25.4×dpi)，高度按同一比例取整，写入 pHYs 密度数据块。四舍五入可使有效 DPI 与目标存在轻微差异，界面报告实际换算值。PNG 超过 4000 万像素或单边 12000 px 会被拒绝。
- empirical.bins 为整数 1–200；start/end 为可选有限数字字符串，均指定时 start<end。normalization 为 count/probability/density，两个轴标题均最多 120 字符。留空标题时自动选择观测名称与纵轴语义。
- histogram/ecdf 使用每条 series.y 的数值观测；配置 x 仅保留供其他图表使用，保存时不要求其仍是有效列。group 与所有过滤步骤仍检查归属并生效。
- 同一子图内，直方图各序列/类别共享自动起止范围；跨子图建议显式设置相同范围。最后一箱含右端点，其余左闭右开；范围外及非正对数观测明确计入排除。概率和密度按范围内有效 n 计算，密度=count/(n×箱宽)。
- ECDF 合并重复值，阶梯右连续，不平滑；零概率起点在对数 Y 轴下不显示并告警。经验分布最多 200 条轨迹；样本检查统计 n、缺失、排除、极值。
- heatmap.palette 为 series/viridis/cividis/blueRed。min/max/center 为可选有限数字字符串；显式 min<max，显式 center 必须在范围内。自动范围会包含中心值；颜色超范围截到端点并告警，原数值不变。色块和色标采用同一映射（连续色阶使用五个锚点线性插值）。
- heatmap.labels 为布尔值，超过 400 单元格时整批关闭数字标注并提示，仍绘制全部色块；标注前景根据背景选择黑/白。计数矩阵样式仅设置色阶和标注，不计算混淆矩阵、不归一化数据。
- style.preset 可选新增 Okabe–Ito。显式“应用色彩＋线型区分”会写入每条 series 的颜色、线型和点形，旧图不自动重配。

## 第三批增量协议：分布图与分面（2026-10-19）

图表 type 新增 `box|violin`。原保存、打开、版本恢复接口与 schema_version:1 不变，JSON 增加两个可选对象；缺省时前端采用以下默认值，打开旧图不会隐式重写配置。

```json
{
  "distribution": {
    "points": "all",
    "quartileMethod": "linear",
    "mean": false,
    "innerBox": true,
    "bandwidth": "",
    "span": "hard"
  },
  "facet": {
    "mode": "none",
    "field": "",
    "columns": 2,
    "gapX": 90,
    "gapY": 100,
    "shareX": true,
    "shareY": false,
    "labels": true,
    "titles": {}
  }
}
```

这是现有 config 的增量片段，不是独立的完整图表配置。若对象出现，服务器要求内部字段完整并校验类型与范围。

- points：all/outliers/none；quartileMethod：linear/exclusive/inclusive；span：hard/soft；mean 与 innerBox 为布尔值。
- bandwidth：空字符串表示 Plotly 自动带宽；否则必须是有限正数字符串（最多 120 字符）。无效预览回退自动并告警，服务器拒绝保存无效值。
- facet.mode：none/series/field。series 为每条可见序列一个子图；field 为过滤后的字段类别分面（包含缺失类别）。field 模式保存时检查字段属于当前数据版本。
- columns 为整数 1–3，gapX 为 24–200 px，gapY 为 40–200 px。shareX/shareY/labels 为布尔值。
- titles 为子图稳定键到标题的对象，最多 100 项；键最长 500 字符、标题最长 300 字符。序列键 `series:{seriesId}`；类别键 `field:{fieldName}:{JSON.stringify(value)}`，数值与文本类别保留类型。
- 最多显示 8 个子图。超限或可用空间不足时清空绘图并提示，保留配置供用户调整，服务器可保存待调整的布局。热力图暂只显示单图，并告知分面设置已保留。
- 分布图 X 使用类别轴，Y 仅取有限数值；小提琴组内有效 n<3 或常量时仅画真实点。样本检查分别统计有效数、缺失、对数排除及极值。原始数据字节不变。
- 箱线/小提琴采用 SVG traces；导出复用实时图形，无新增网络绘图服务。Plotly 当前版本由 package-lock.json 固定，自动带宽未冻结为计算后的数字；升级绘图依赖后需重新核对统计与导出回归。

## 第二批增量协议：实验关联与对比

实验创建和更新仍使用原有路径，新增字段示例：

```json
{"name":"run-001","parameters":{"lr":0.001},"metrics":{"accuracy":92.8,"loss":null},"notes":"合成示例","status":"completed","tags":["baseline"],"dataset_version_ids":[1],"revision":1}
```

- status 为 planned/running/completed/failed；新记录默认 planned，revision 从 1 开始。
- tags 最多 20 个，每个 1–40 字符；dataset_version_ids 最多 50 个唯一的同项目版本 ID。
- 返回对象增加 status、tags、revision、dataset_version_ids 与 datasets。datasets 每项含 experiment_id、dataset_version_id、filename、version、sha256。
- PUT 带 revision 时检查乐观锁，冲突返回 409。为兼容旧客户端，省略 revision 时仍接受更新；省略 status/tags/dataset_version_ids 时保留原值。新版前端始终携带 revision。
- parameters/metrics 各最多 100 个顶层字段、序列化后 100000 字符；顶层键 1–120 字符、嵌套最多 30 层，拒绝超出有限数值范围的数字。文本和 null 原样保留，不隐式转换成数值。

`POST /projects/{p}/comparisons`：

```json
{"experiments":[{"id":1,"revision":2},{"id":2,"revision":1}],"baseline_id":1,"metric":"accuracy","direction":"higher","chart_type":"bar"}
```

选择 2–8 个唯一实验，基线必须在所选实验内。direction 为 higher/lower，chart_type 为 bar/scatter；至少两个实验的指定指标为有限数值。服务器按 ID 排序加锁并核对修订，过期返回 409；跨项目版本或实验返回 404，事务失败不产生数据版本。

成功返回完整 Dataset（含 rows），CSV 两列为 experiment、metric_value；缺失指标保留 null。新版本的 source_meta 包含 schema_version:1、kind:experiment_comparison、created_at、metric、direction、baseline_id、chart_type、missing_count、experiments（完整记录及关联版本元数据）。快照创建与来源写入在同一事务内完成；后续编辑实验不改变快照。

source_meta 仅在 `GET /projects/{p}/data/{versionId}` 详情中返回，普通上传版本为 null；列表不加载完整来源。图表继续用 schema_version:1 和 datasetVersionId 引用快照，创建/保存/恢复协议不变。生成快照不等于保存图表，用户在编辑器点击保存完成图表持久化。

## 项目与实验

`GET /projects` 返回数组，包括 `experiment_count/chart_count/dataset_count`。

`POST /projects`：
```json
{"name":"视觉模型研究","description":"泛化能力评估"}
```

`GET /projects/{p}/experiments`；`POST /projects/{p}/experiments`；`PUT /projects/{p}/experiments/{id}`：
```json
{"name":"run-001","parameters":{"seed":42,"lr":0.001},"metrics":{"accuracy":92.8},"notes":"合成示例"}
```
名称 1–120 字符，描述至多 10000 字符，备注至多 30000 字符。参数和指标必须为对象。

## 数据与版本

`POST /projects/{p}/datasets` 上传新数据集；`POST /projects/{p}/datasets/{datasetId}/versions` 追加版本，原版本不变。

`GET /projects/{p}/datasets` 返回所有版本（最新在前），字段：`id`（版本 ID）、`dataset_id`、`version`、`filename`、`sha256`、`row_count`、`fields`、`warnings`、`created_at`。

`GET /projects/{p}/data/{versionId}` 在上述元数据之外返回 `rows` 对象数组。字段描述示例：`{"name":"accuracy","type":"number","missing":2}`。`type` 为 `number|string`；缺失值为 null。

`GET /projects/{p}/data/{versionId}/original` 返回原始字节，`Content-Disposition: attachment`；SHA-256 可与上传前比对。

`GET /projects/{p}/data/{versionId}/profile` 返回该版本的字段画像与前 10 行（供结构类工具与后续模型读取）：`{dataset_version_id,dataset_id,filename,version,sha256,row_count,fields,head,truncated}`。`fields` 沿用导入时写入的 `fields_json`（`name/type/inferred_type/missing/unique/constant/role/suggested_role/samples`，数值列另有 `min/max`），不重算、不重读原文件、不写库；最多 80 列，超出只置 `truncated.columns`。

## 图表快照

`GET /projects/{p}/charts` 列出图表；`POST /projects/{p}/charts` 创建：
```json
{"name":"Figure 1","config":{"schema_version":1,"datasetVersionId":1,"type":"line","...":"参见完整 config-v1.example.json"}}
```
上面的省略示例不作为有效配置提交，完整结构见 [config-v1.example.json](config-v1.example.json)。服务端验证 schema、类型、字段归属、数值类型、颜色、尺寸、序列、轴、图例和注释。未知 schema 拒绝；schema 1 的未知新增字段保留，便于向前兼容。

`GET /projects/{p}/charts/{id}` 返回 `id,project_id,name,revision,created_at,updated_at,dataset_version_id,config`。

`PUT /projects/{p}/charts/{id}` 请求 `{name,revision,config}`，revision 必须等于当前值；成功后 +1。检查和新快照插入在一个事务内完成，冲突返回 409，不覆盖任何版本。

`GET /projects/{p}/charts/{id}/versions` 返回降序 `{version,config,created_at}` 数组。恢复历史使用该 config 再 PUT 当前 revision，产生新版本。

转换步骤：`{"op":"filter","field":"epoch","operator":"gte","value":"10"}`。操作符 `eq|gte|lte`；eq 按文本比较，其余按数值比较。过滤不落回原始行。

## 绘图工具协议

`GET /figure-tools/catalog` 提供 protocol_version=1、config_schema_version=1 的十个参数白名单与 JSON Schema，并用 `categories`（`[{id:"presentation",label:"外观"},{id:"structure",label:"结构"}]`）与每个工具的 `category` 区分“只改呈现”与“改取数列”；`POST /projects/{p}/figure-tools/preview` 接收 `{protocol_version,chart_id,base_revision,config,operations}`，只校验并返回结果，不写图表、数据或版本。

操作格式 `{tool,arguments}`；外观类为 set_style / set_axis / set_legend / set_series / set_canvas，结构类为 set_chart / set_mapping / map_series / add_series / remove_series，一次 1–30 项。返回 `{protocol_version,config,changes,operation_count,base_revision,source}`，source 包含不可变数据版本 ID 与 SHA-256，changes 为 JSON Pointer 路径的 before/after（结构类的 /series 为粗粒度路径）。旧保存版本返回 409，跨项目资源 404，未知属性、无效参数、不适用于当前图表的操作、缺少专业配置的类型切换、悬空列/序列引用一律 400。完整范围与专业图表说明见 [绘图工具协议](FIGURE-TOOLS.md)。

## 样式模板接口

`GET /style-templates` 返回本机全部模板，包含 `id,project_id,name,project_name,profile`（及原有时间字段）。前端默认按当前项目筛选，允许切换全部项目；`profile` 是带 `schema_version=1` 的外观白名单，与图表的数据映射、统计语义分离。

`POST /projects/{p}/style-templates` 请求 `{name,config}`，从合法图表配置提取外观；返回 `{id,name,profile}`。`PATCH /style-templates/{id}` 请求 `{name}`，仅修改模板名称，返回 `{id,name}`。名称非空、最多 120 字符，写入时去除首尾空白；不存在的模板返回 404。重命名不修改样式、所属项目或既有图表。

`DELETE /style-templates/{id}` 删除该模板，返回 `{deleted:id}`；不修改已经应用该样式的图表。前端删除前需明确确认。接口仅用于本地单用户模式，无用户权限隔离。

## 错误响应

```json
{"code":"REQUEST_409","message":"图表已被更新，请重新打开最新版本后再保存"}
```

400 输入/配置/解析错误；403 非本地浏览器来源写入；404 不存在或不属于当前项目；409 并发版本冲突；413 超过上传大小；500 内部错误（不给客户端泄露 SQL 或栈）。

本地模式只限制来源与网络监听，不提供身份认证。不要通过反向代理直接公开此 API。

## 第一批增量协议（2026-10-18）

`PUT /projects/{p}` 接收 `{name, description, archived}`，更新名称、简介和归档状态。`GET /projects` 仍返回全部项目，新增布尔字段 `archived`；前端工作区隐藏归档项目，管理弹窗可恢复。归档不删除资源。

`POST /projects/{p}/datasets/preview` 接收 multipart `file` 和可选文本字段 `rules`（JSON 字符串）。原有创建数据集、追加版本接口也接受同一 `rules`。省略时采用默认解析规则，兼容旧客户端。

```json
{
  "schema_version": 1,
  "delimiter": ",",
  "sheet": 0,
  "missingValues": ["NA"],
  "types": {"score":"number"},
  "roles": {"epoch":"x","score":"y","std":"error"}
}
```

- delimiter 允许逗号、分号、制表符；sheet 为从 0 开始的工作表索引。
- types 值为 `number|string`；没有覆盖的字段仍自动推断。
- roles 值为 `none|x|y|group|error`。x/group/error 各最多一个，y 可多个；y/error 必须为数值字段。无角色不代表删除列。
- missingValues 为区分大小写的显式标记，最多 30 个；原始文件完整保留。不自动解释 `<0.01` 或 `-999`。
- 预览返回 `filename,row_count,fields,rows,warnings,sheets,issues,parse_rules`。rows 最多 20 行，row_count 是完整解析行数；不写入数据表。结构不可解析时通常返回 400；可读 XLSX 即使当前工作表不可解析，仍返回 sheets 与 issues 供切换。
- issues 含 `{row,field,value,message}`，数值转换问题最多返回 100 条。row 是包含表头的逻辑记录序号，CSV 多行引号内容不按物理行计数。有任何 issue 时服务端拒绝正式提交。
- fields 保留原有 `name,type,missing`，增加 `inferredType,role,suggestedRole,unique,samples,constant`；数值列有有效值时包含 min/max。建议仅供参考，前端不自动选中。
- 提交时仍上传原文件与规则，由服务器重新解析，拒绝客户端提供替换后的数据行。
- 数据版本新增 `parse_rules`（MySQL `parse_rules_json`）；旧版本为 null。原有 chart schema_version 仍为 1，不修改历史图表。新图表默认读取字段角色，单个 Y 时预填误差列；多个 Y 时用户逐序列指定误差来源。
- 图表复制复用现有 `POST /charts`，不增加重复接口；409 冲突仍通过现有 revision 检测，界面支持另存副本。

前端草稿仅保存配置、名称、原 revision 和时间，不保存原数据。localStorage 键按项目/图表区分；正式保存成功后清理对应草稿。恢复旧 revision 的草稿不会绕过服务器并发校验。
