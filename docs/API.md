# API v1

本地基址 `http://127.0.0.1:8086/api`。UTF-8 JSON。当前返回创建资源 HTTP 200。上传为 `multipart/form-data`，字段名 `file`。数据库 ID 为整数。

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
