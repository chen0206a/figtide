# API v1

本地基址 `http://127.0.0.1:8086/api`。UTF-8 JSON。当前返回创建资源 HTTP 200。上传为 `multipart/form-data`，字段名 `file`。数据库 ID 为整数。

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

## 错误

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
