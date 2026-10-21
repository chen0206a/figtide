# 绘图工具协议与快捷操作（2026-10-21）

本轮承接“编辑器稳定 → 工具接口 → 模型接入”的顺序，实现可被未来 Agent 调用的确定性工具层，并用真实快捷操作界面验收。没有接入模型、聊天界面、API Key、自动执行循环、任意 Python 或第三方 Skill；不是完整 Agent/Harness。

## 执行流程

用户在编辑器点“快捷操作”，或按 Ctrl/Cmd+K。选操作、勾选属性、加入清单；一次最多 30 项。前端将当前草稿快照与操作清单交给 Java，Java 校验并返回配置与逐字段差异，浏览器使用同一 Plotly 渲染器预览。确认应用后统一进入现有撤销栈，可一步撤销/重做。正式 MySQL 版本仍由原“保存”创建。

界面从 Java 返回的目录读取参数类型、选项和范围，不另造一套前后端字段命名。结构仍使用 schema_version=1，新的工具协议独立使用 protocol_version=1。保留原数据、映射、过滤、误差列、统计阈值、类别和输出设置；允许的展示文字除外。

后端分层：`FigureToolController → FigureToolService → FigureOperations / WorkspaceService → WorkspaceRepository`。`FigureOperations` 是无 I/O 的批量变换与差异计算；服务使用现有项目归属、配置/字段校验和数据库读取。预览事务标记只读，没有增加数据库表。

## 协议

`GET /api/figure-tools/catalog`：返回协议版本、配置版本、`execution: "preview-only"` 与五个工具的名称、中文标签及 `input_schema`。所有参数对象拒绝额外属性。

| 工具 | 接收的属性 |
| --- | --- |
| `set_style` | title / font / fontSize / fontPt / bold |
| `set_axis` | axis（x/y，必填） / title / min / max / dtick / log / grid |
| `set_legend` | show / position / orientation |
| `set_series` | seriesId（必填） / name / color / opacity / width / dash / symbol / size / visible |
| `set_canvas` | width / height / top / bottom / left / right / background |

`POST /api/projects/{p}/figure-tools/preview`：

```typescript
{
  protocol_version: 1,
  chart_id: number | null,       // 新图表为 null，也可省略
  base_revision: number,         // 已保存图表的当前 revision；新图为 0
  config: Config,                // 编辑器的完整当前草稿，含 schema_version
  operations: Array<{ tool: string, arguments: Record<string, unknown> }>
}
```

示例操作清单：

```json
[
  {"tool":"set_style","arguments":{"fontSize":18,"title":"Model comparison"}},
  {"tool":"set_legend","arguments":{"position":"bottom","orientation":"h"}},
  {"tool":"set_axis","arguments":{"axis":"y","min":0.5,"max":1,"grid":false}}
]
```

坐标范围接收 JSON 数值，`null` 明确恢复自动；服务端转换为现有 Config 的字符串范围。空参数、纯目标标识、未知工具、路径/字段、非有限数值、错误类型、非法选项、颠倒范围、非正对数范围及覆盖整张画布的边距都返回 400。整批在深拷贝上完成，任一失败不返回半成品、不修改输入或数据库。最终配置继续通过现有服务的字段/数据归属和科研配置校验。

成功响应包含 `protocol_version, config, changes, operation_count, base_revision, source`。`changes` 是按 JSON Pointer 路径排列的 `{path,before,after}`，仅用于差异展示，不是接收任意路径写入的入口。`source` 含 `dataset_version_id,sha256`；不返回上传文件内容。保存版本已更新时返回 409，跨项目来源或图表返回 404。

## 生效范围与专业图表

- 论文尺寸启用时用 `fontPt` 调整成品字号；`fontSize` 会被拒绝，避免只改了被物理排版覆盖的值。未开启时不接受 fontPt。
- ROC/PR 标题写入各自的 evaluation 轴标题，矩阵标题写入 classification，直方图/ECDF 写入 empirical 的展示标题；不改变标签列、正类、阈值、分箱或统计方法。旧分布图缺少 empirical 配置时，需先在专业属性中设置。
- ROC/PR 和矩阵的固定范围、刻度、对数设置不作为快捷操作暴露；分布图的类别 X 轴、分面自动轴也限制范围/对数操作。矩阵网格由单元格决定，色阶在原专业属性中调整。
- 矩阵不提供序列/图例工具；柱图与直方图不提供点大小/点形/序列线宽，散点不提供线宽，虚实线只在实际使用该属性的类型中提供。后端同样拒绝无效组合，不能靠绕过前端获得一个无效成功响应。
- 工具仅改现有序列外观，不增加序列、不换字段、不生成误差、显著性或曲线。

## 草稿与冲突保护

前端预览不直接调用 reducer。用户确认时核对图表 ID、revision、名称与草稿的本地快照标识；期间发生编辑或保存就要求重新预览。收到结果还要核对数据版本、内容指纹，以及除展示白名单之外的所有配置字段均未改变。

跨窗口在预览前保存新版本时，Java 拒绝旧 revision。预览之后另一窗口才保存的情况继续由正式保存 API 的 revision 检查处理，不能覆盖新的服务端版本。工具应用后的修改沿用本机草稿机制，退出模块不自动写 MySQL。

后续 Agent 适配器只接受模型给出的 `operations`。`config/chart_id/base_revision/source` 必须由可信编辑器或 Harness 绑定，不能把模型自带的完整配置透传成当前草稿。未来可在这个协议之上增加模型适配、任务状态、取消/超时、预算和持久化审计；当前操作日志仍是编辑器会话内日志。

接口仍属于原本地单用户模式，未增加认证、用户授权或公开部署隔离。所有工具均不执行 shell、代码、任意文件路径或模型输出的 SQL。

## 验证与运行

Java 测试覆盖严格参数、整批失败不变、自动范围、目标序列、物理字号、专业图标题、固定轴拒绝、未来字段保留、真实 MySQL/MockMvc 只读预览、跨项目与旧版本拒绝。

浏览器覆盖五种操作合并、预览未应用时原图/数据库不变、一步撤销/重做、保存重开、原文件逐字节一致、SVG、错误范围、并发版本冲突、成品 pt、ROC 真实轴标题及窗口布局。最终计数见 [验收记录](TEST-RESULTS.md)。

```powershell
# 仓库根目录，使用便携 Java 21
$env:JAVA_HOME=(Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn.cmd -f backend/pom.xml test

# frontend 目录
npm.cmd test
npm.cmd run build
npm.cmd run e2e
```

![五类工具批量预览](screenshots/quick-actions.png)
