# 任务 01c：图表默认观感修正（任务 01 验收后追加）

**背景**：任务 01 的修复本身是对的：组色不同、整数刻度、副标题不被压住、色条整数刻度都已生效。但验收截图里有几处观感问题，一部分来自任务 01 的设计（行内图例标题），一部分是原来就有的默认样式（viridis 黄绿色、矩阵格子不是正方形、标题和矩阵之间空了一大块）。本任务只改这些默认样式，不改任何统计计算。

## 步骤

### 1. 打补丁

```bash
git apply --3way docs/development/patches/01c-chart-polish.patch
```

补丁基于「原始快照 + 01 + 01b」生成。你在任务 01 里额外改过 `facets.ts`、`plot-core.ts`，如果有冲突，按下表手动实现：

| 文件 | 改动 |
|---|---|
| `plot-core.ts` | **去掉行内图例标题**。它和图例条目排在同一行，看起来像多出一个图例项。单序列分组时图例只列组名，序列名本来就在 Y 轴标题上。<br>新增 `legendShown = c.legend.show && traces.some(t => t.showlegend !== false)`，用它代替 `c.legend.show` 计算顶部边距和 `layout.showlegend`。热力图和混淆矩阵没有图例条目，不再在顶部预留一条空白，标题和矩阵之间的大空隙因此消失。 |
| `encoding.ts` | 删除 `groupLegendTitle`。 |
| `confusion.ts` | 默认配色从 viridis 改为单色蓝阶 `MATRIX_BLUES = ["#f7fbff","#c6dbef","#6baed6","#2171b5","#08306b"]`，作用于格子填充、色条和格内文字颜色的计算（文字颜色仍由 `labelColor` 按对比度自动选黑或白）。<br>`yaxis.scaleanchor = "x"`、`scaleratio = 1`、两轴 `constrain = "domain"`，让格子保持正方形。<br>格子之间加 2px 背景色细线。<br>没有设置分组时，副标题不再显示「全部」：`Model A · n=7`。 |
| `encoding.test.ts` | 图例标题断言改为「不存在」；新增 3 项：正方形单色格子、副标题不含「全部」、无图例时不预留顶部空间。 |

`facets.ts` 里如果引用了 `groupLegendTitle` 或 `legend.title`，一并删除。

### 2. 你新增的 E2E 和测试要同步改

`e2e/chart-corrections.spec.ts` 和任务 01 中新增的单元测试里，凡是断言了图例标题（`legend.title`）、viridis 颜色或「全部」的地方，改成新的预期。**不要删断言**，改成等价的新断言即可，例如「图例标题不存在」「第一个色阶是 #f7fbff」。

### 3. 查清 SEM 图区间带断开的原因

验收截图里，Method A 的区间带只画到 epoch 2，epoch 3 处断开。请确认原因：
- 如果是因为演示数据中 Method A 在 epoch 3 只有一次运行（n=1，算不出 SEM），那么断开是**正确行为**，不能补画。请确认编辑器底部告警里有对应提示（例如「…行区间数据缺失…区间带在此断开」）。然后把 `chart-corrections` 演示数据改成每个点至少 2 次运行，让验收截图反映常见情况。断开的情况保留在单独的测试里。
- 如果数据其实完整，那就是 bug，请定位并修复，补上回归测试。

在汇报里写明是哪一种。

### 4. 新图的默认坐标轴标题（可选，小改动）

`model.ts` 的 `defaults()` 目前直接用字段名作轴标题（`epoch`、`accuracy`）。改为首字母大写、下划线换成空格（`Epoch`、`Accuracy`、`Macro f1`）。只影响**新建**的图，已保存的图不变。

## 验收

- `npm test`、`npm run build` 通过。
- E2E：`npx playwright test e2e/chart-corrections.spec.ts e2e/classification.spec.ts e2e/processing.spec.ts e2e/professional.spec.ts`（热力图也受「不预留图例空间」影响，professional 中有热力图用例）。
- 重新导出 SEM、混淆矩阵、ROC 三张图的截图和 PDF，替换任务 01 的验收截图。检查以下几点：
  - SEM：图例只有 `Baseline`、`Method A`；
  - 混淆矩阵：格子是正方形、蓝色色阶，标题和矩阵之间没有大块空白，副标题是 `Model A · n=…`；
  - 热力图：顶部没有多出的空白。
