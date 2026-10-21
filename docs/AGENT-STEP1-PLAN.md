# Agent 接入 Step 1 改造清单：补全工具面（不接模型）

日期：2026-10-21 · 状态：**已落地（工具面与画像）**，新建向导与 profile 驱动下拉留到 Step 1.5
前置：`8ea2039`（5 个展示类工具 + 批量快捷操作，Java 67 / Vitest 117 / E2E 39 全绿）

## 0. 范围与不变量

本步只做“给未来 Agent 备好可调用的确定性工具”，**不引入模型、聊天框、API Key、自动应用**。

必须保持的不变量（与 `FIGURE-TOOLS.md` 一致，新增工具不得破坏）：

1. 工具只接受**参数**；`config / chart_id / base_revision / source` 永远由可信编辑器绑定，模型不允许透传整份 config。
2. 预览只读：任何工具调用都不写 `charts / chart_versions / dataset_versions`。
3. 整批原子：任一操作失败 → 400，不返回半成品，不修改入参。
4. 校验单一来源：结构合法性复用 `WorkspaceService.validateAndReport`，不新写一套字段规则。
5. 差异可解释：所有变更经 `FigureOperations.changes()` 产出 `{path, before, after}`。
6. 应用必须经用户确认，进撤销栈，可一步撤销。

## 1. 工具面：现状 → 目标

现状 5 个，全部只改“呈现”（appearance）：

`set_style` · `set_axis` · `set_legend` · `set_series` · `set_canvas`

目标 10 个，新增 5 个“结构”（structure）；并把目录区分为两类，供 UI 分组与 Step 2 适配器分别授权。

| # | 工具 | 类别 | 作用 | 后端 |
|---|---|---|---|---|
| 1–5 | 现有五个 | presentation | 外观 | 已有 |
| 6 | `set_chart` | structure | 切换图表类型 | 新增 |
| 7 | `set_mapping` | structure | 改 X / 分组 / 热力行 / 热力值 | 新增 |
| 8 | `map_series` | structure | 改某条序列的 Y / 误差列 | 新增 |
| 9 | `add_series` | structure | 追加一条序列 | 新增 |
| 10 | `remove_series` | structure | 删除一条序列 | 新增 |

配套两件只读/纯函数能力：

| 能力 | 形态 | 作用 |
|---|---|---|
| `dataset_profile` | `GET /api/projects/{p}/data/{v}/profile` | 让 Agent/UI 看到“有哪些列、什么类型、缺多少、取值范围”，压缩成画像而非原始 CSV |
| `describe_figure` | 前端纯函数 `figureTools.ts` | 把当前 config 压缩成“类型 + 映射 + 序列 + 版本”，作为后续提示词上下文 |

暂不做：服务端出图（`render_figure`）、统计计算、从零生成配置的 Java 实现。理由见 §10。

## 2. `dataset_profile` 契约

```
GET /api/projects/{p}/data/{v}/profile
```

（`v` 是 `dataset_versions.id`，与现有 `GET /projects/{p}/data/{id}` 同一标识；归属校验复用同一条 `JOIN datasets d ON d.id=v.dataset_id WHERE d.project_id=?`。）

响应（只读，不落库、不缓存进 MySQL）。**最终实现直接复用导入时算好的 `fields_json`，字段名沿用其现有结构，不另起 `non_null/distinct/top/mean`**：

```json
{
  "dataset_version_id": 42,
  "dataset_id": 17,
  "filename": "demo-learning-curves.csv",
  "version": 1,
  "sha256": "9f2c…",
  "row_count": 1200,
  "fields": [
    {"name":"epoch","type":"number","inferred_type":"number","missing":0,"unique":30,
     "role":"x","suggested_role":"x","samples":["1","2"],"min":1,"max":30,"constant":false}
  ],
  "head": [["epoch","baseline"]],
  "truncated": {"columns": false, "rows": false}
}
```

规则（实际实现）：

- 版本必须属于该项目，否则 404（复用 `data(p, id)` 的归属校验）。
- `fields` 上限 80 列、`head` 前 10 行；超出只置 `truncated` 标记，不报错。
- `samples` 每项截断 40 字符；数值列附 `min/max`。
- 不允许传入任意 SQL / 列表达式 / 文件路径；无过滤参数。

前端消费：新建图表向导与结构类操作的列下拉都读它（**不读整张表**）。

## 3. 新增操作契约

通用规则（5 个工具都适用）：

- 请求仍走 `POST /api/projects/{p}/figure-tools/preview`，`protocol_version` 保持 **1**（纯增量，老客户端不受影响）。
- 参数对象 `additionalProperties:false`，空对象 400 `需要至少一个参数`。
- 每个工具带 `category` 字段，`catalog` 里新增 `categories:{presentation:[…],structure:[…]}`。
- 失败文案统一中文、400；版本冲突仍 409；跨项目 404。

### 3.1 `set_chart`

```json
{"type":"object","additionalProperties":false,"minProperties":1,
 "properties":{"type":{"type":"string","enum":["line","bar","scatter","heatmap","box","violin","histogram","ecdf","roc","pr","confusion"]}},
 "required":["type"]}
```

规则：

- 目标类型所需角色必须已就位：`heatmap` 需 `x + heatY + heatZ`；`box/violin` 需 `x + series[y]`；`scatter/line/bar` 需 `x + series[y]`。
- 需要专业配置的类型（`histogram/ecdf` 需 `empirical`，`roc/pr` 需 `evaluation`，`confusion` 需 `classification`）若当前 config 缺该块 → 400 `切换到该类型需要先设置专业属性`（沿用现有回退策略，不代造配置）。
- 不清空 `series/axes/style/publication`；不改变数据来源。

### 3.2 `set_mapping`

```json
{"type":"object","additionalProperties":false,"minProperties":1,
 "properties":{"x":{"type":"string","maxLength":200},
               "group":{"type":"string","maxLength":200},
               "heatY":{"type":"string","maxLength":200},
               "heatZ":{"type":"string","maxLength":200}}}
```

规则：

- 列名必须存在于当前 `dataset_version` 的 `fields`，否则 400 `字段不属于当前数据版本`。
- `group:""` 表示清除分组；`heatY/heatZ` 仅当 `type=heatmap` 时接受，否则 400 `当前图表类型不支持该字段角色`。
- `x` 对 `histogram/ecdf/roc/pr/confusion` 不可设（沿用现有“分布/评估类型固定 X”的规则）。

### 3.3 `map_series`

```json
{"type":"object","additionalProperties":false,
 "properties":{"seriesId":{"type":"string","maxLength":200},
               "y":{"type":"string","maxLength":200},
               "error":{"type":"string","maxLength":200}},
 "required":["seriesId"]}
```

规则：

- `seriesId` 必须存在，否则 400 `序列不存在`。
- `y` 必须是数值列（`confusion` + `input=labels` 时例外，跟随现有校验）。
- `error` 必须数值列或 `""`（清除）。
- 只改映射，不改外观；不新增序列。

### 3.4 `add_series`

```json
{"type":"object","additionalProperties":false,
 "properties":{"id":{"type":"string","minLength":8,"maxLength":64},
               "y":{"type":"string","maxLength":200},
               "name":{"type":"string","maxLength":200},
               "error":{"type":"string","maxLength":200}},
 "required":["id","y"]}
```

规则：`id` 由调用方给出，服务端只校验格式与唯一性（重复 → 400 `序列 ID 已存在`），**不代生成**——否则同一操作清单两次预览会得到不同配置，破坏可复现性。**实现取 `maxLength:80`、前端自增 `sN`**（不是 UUID：短 id 便于在差异路径与日志里阅读）；新序列外观**深拷贝既有首条序列**再改 `id/y/name/error`，因此不需要把颜色/线型一起提交，也不会引入第二套配色。数值列校验同上；结果序列数 >20 → 400 `最多 20 条序列`。

### 3.5 `remove_series`

```json
{"type":"object","additionalProperties":false,"properties":{"seriesId":{"type":"string"}},"required":["seriesId"]}
```

规则：结果序列数 <1 → 400 `至少保留 1 条序列`；`confusion` 与 `evaluation` 引用该 `seriesId` 时一并拒绝（400 `该序列正在被评估配置使用`）。

## 4. 前端交互

- `QuickActions.tsx` 由平铺 5 个标签改成两组：**外观**（1–5）/ **结构**（6–10），组内标签不变；结构类操作的列下拉来自 `dataset_profile`，并按角色过滤（Y/误差只列 `type=number`）。
- 新增 `create_figure` 向导入向导：数据版本 → 类型卡（11 种，不可用的灰掉并说明原因）→ 角色映射 → 预览（`operations: []`，只做校验）→ 以草稿打开编辑器。
- 生成配置用前端新函数 `createConfigFromSpec(profile, spec)`，**复用 `model.ts` 的默认值**，不复制到 Java（避免两套默认值漂移）。
- `describe_figure(config)` 纯函数，返回 ≤1 KB 摘要，供 Step 2 拼提示词。

实现顺序上的坑：`QuickActions.tsx:39-62` 是**按 catalog 自动列出工具**的，`operationValues()` 则是 `switch(tool)` 硬编码。因此新增工具若先加到 catalog、后补 `figureTools.ts` 分支，界面会先出现一个空白参数面板。**catalog 与 `operationValues`/`makeToolOperation` 必须在同一次提交里改**。

## 5. 后端改动清单

| 文件 | 改动 | 估算 |
|---|---|---|
| `service/FigureOperations.java` | 5 个 `Spec`；`apply()` 分支；`catalog()` 增加 `category/categories` | +230 行 |
| `service/FigureToolService.java` | 结构类操作的前置条件检查（类型/角色/序列数），仍 `readOnly` | +60 行 |
| `service/WorkspaceService.java` | 新增 `profile(project, version)`（复用现有 `data()` 与字段统计）；不改既有方法 | +90 行 |
| `api/WorkspaceController.java` | `GET /datasets/{v}/profile` | +8 行 |
| `api/FigureToolController.java` | 无改动 | 0 |
| 迁移 | 无（不新增表、不加列） | 0 |

## 6. 前端改动清单

| 文件 | 改动 | 估算 |
|---|---|---|
| `editor/figureTools.ts` | 5 个工具的默认值/编解码；`describeFigure()`；`createConfigFromSpec()` | +180 行 |
| `editor/QuickActions.tsx` | 两组标签；列下拉走 profile | +90 行 |
| `editor/quick-actions.css` | 分组样式 | +25 行 |
| `components/FigureCreateWizard.tsx`（新） | 类型卡 → 映射 → 预览 → 打开 | +210 行 |
| `lib/api.ts` | `profile()` 查询 | +12 行 |

## 7. 测试清单

Java（`FigureOperationsTest` / `FigureToolsIntegrationTest`）

1. `set_chart` 切换 `line→scatter` 成功；`→heatmap` 缺 `heatZ` 报 400 且配置不变。
2. `set_chart →roc` 无 `evaluation` 报 400 `需要先设置专业属性`。
3. `set_mapping` 传不存在列 → 400；`heatY` 用在 line → 400。
4. `map_series` 把文本列设为 Y → 400；`confusion+labels` 例外放行。
5. `add_series` 到 20 条后再加 → 400；`remove_series` 到 1 条再删 → 400。
6. 批量 `[set_chart, add_series, set_style]` → 一次成功，`changes` 路径正确，`chart_versions` 计数不变。

Vitest（`figureTools.test.tsx` / `QuickActions.test.tsx`）

7. 分组渲染；结构标签仅在数据版本匹配时可点。
8. 列下拉过滤：Y 只列 `type=number`。
9. `createConfigFromSpec` 产出 `schema_version=1` 且通过 `ConfigValidator` 等价的既有校验（用 `preview` mock）。

E2E（`figure-tools.spec.ts` 追加 3 条）

10. `Ctrl+K → 结构 → 添加序列 → 预览 → 应用 → 撤销` 一步还原。
11. 新建散点：选 CSV → 映射 X/Y → 预览无改动 → 保存 → 刷新一致。
12. 错误路径：把文本列设为 Y → 顶部错误提示，且不产生预览、画布不变。

## 8. 验收清单

- [ ] `GET /figure-tools/catalog` 返回 10 个工具，均含 `input_schema` 与 `category`；`protocol_version` 仍为 1。
- [ ] `GET /projects/{p}/datasets/{v}/profile` 返回 §2 结构，跨项目 404，80 列以上 400。
- [ ] 5 个结构工具在 UI 可用，后端独立校验（绕过前端也拒绝）。
- [ ] 所有调用 preview-only：调用前后 `charts/chart_versions/dataset_versions` 行数与 `sha256` 不变。
- [ ] 任一批次含非法操作时不返回部分结果。
- [ ] 确认应用后一步撤销、再重做。
- [ ] `tsc -b`、`vite build`、`vitest run`、`playwright test` 全绿；Java `mvn test` 全绿。
- [ ] `FIGURE-TOOLS.md`、`API.md`、`DESIGN.md`、`TEST-RESULTS.md` 同步（工具数 5→10、边界从“仅呈现”扩为“呈现+结构”）。

## 9. 顺序与工作量

1. 后端 profile + 5 个 Spec（0.5 天，先落测试）
2. 前端 figureTools 编解码 + 分组 UI（0.4 天）
3. 新建向导（0.3 天）
4. E2E 3 条 + 文档（0.2 天）

合计约 **1.4 人日**；做完后工具面才够 Step 2（模型适配）使用。

## 10. 非目标与风险

**非目标**：模型调用/提示词/Key 管理；服务端渲染图片（需要无头浏览器，放到 Step 2 由 harness 侧负责）；统计与显著性工具；跨项目复用；认证与多用户。

**风险**：

- 结构类工具把“可写面”从外观扩到映射，靠 preview-only + 确认应用 + 一步撤销兜底；**不得**为了省一次点击改成自动应用。
- `add_series` 的颜色/id 生成必须复用现有 `seriesEncoding`，否则会出现第二套配色规则。
- 默认配置只在 TS 维护；若 Java 侧将来也要造配置，必须抽成共享 JSON 契约，不能各写一份。

## 11. 实际落地与差异（2026-10-21）

已实现：

- 目录 10 个工具，`categories` 是数组 `[{id,label}]`（不是对象），每个工具带 `category`；`protocol_version` 仍为 1。
- 目录的 `minProperties` 改为“目标标识不算调整”的统一规则：`set_axis`/`set_series` 为 `required+1`，其余为 `max(1, required.size())`；服务端守卫直接复用同一个 `minProperties(Spec)`，客户端 `makeToolOperation` 用目录给的值，两边不会再分叉。**这是第一版 6 条 E2E 里挂掉 2 条的直接原因**：`set_chart`/`add_series` 曾被要求“必填之外再加一项”，界面因此连清单都加不进去。
- 列参数分两种 schema：`COLUMN`（`minLength:1`，用于 x/y/heatY/heatZ）与 `OPTIONAL_COLUMN`（允许空串，用于 `group` 清除分组、`error` 取消误差列）。
- `map_series` 的 `y` 改为必填（只给 `seriesId` 的取数操作没有意义）；`set_chart` 的 `type` 必填。
- `WorkspaceService.profile()` + `GET /projects/{p}/data/{id}/profile`，直接返回导入时算好的字段画像与前 10 行。
- 前端：`describeFigure()`、`createConfigFromSpec()`、`structuralAllowance()`、`sameProtectedFigure(before, after, allowed?)`；`QuickActions` 按 `categories` 渲染 `optgroup`，列下拉按角色过滤，图表类型下拉按可用性过滤。
- `playwright.config.ts` 增加 `webServer`（`reuseExistingServer: true`）：dev server 没起时自动拉起，避免“6 条全挂在 ECONNREFUSED”这种与代码无关的失败。

尚未落地（Step 1.5）：

- `FigureCreateWizard`（类型卡 → 映射 → `operations: []` 校验预览 → 打开草稿）没有做；`createConfigFromSpec` 已备好但还没有入口。
- 结构类下拉目前直接复用编辑器已加载的 `data.fields`，没有请求 `/profile`；`/profile` 是给后续模型/向导用的只读接口。
- 列数超过 80 时按标记降级（`truncated.columns = true`），不是 400。