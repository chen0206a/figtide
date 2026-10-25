# 任务 01：图表正确性修复

**目标**：修复论文图里看得见的错误（问题清单 A1–A7）。这是收益最高、风险最低的一步。

## 步骤

### 1. 打入现成补丁

```bash
git apply --3way docs/development/patches/01-chart-fixes.patch
git apply --3way docs/development/patches/01b-legend-metric-validation.patch
```

补丁内容：

| 文件 | 改动 |
|---|---|
| `editor/encoding.ts`（新增） | `groupEncoding`：按组分配颜色（单序列时第 0 组保留序列自己的颜色，后续组沿用预设色板；多序列时颜色区分组、线型区分序列）。`groupTraceName` / `groupLegendTitle`：单序列分组时图例条目只写组名，序列名作为图例标题。`integerAxisStep`：整数数据且跨度不超过 10 时步长取 1 |
| `plot-core.ts` | 折线 / 柱状 / 散点使用上面的函数；X 轴自动整数步长（用户设置了 dtick、对数轴、热力图、分布图、评估图时不生效）；顶部边距加上 `heat.marginTop` |
| `evaluation.ts` | ROC/PR 按组配色；`evaluation.legendMetric` 为 true 时图例追加 `(AUC = 0.xxx)` 或 `(AP = 0.xxx)` |
| `distribution.ts`、`empirical.ts` | 按组配色和命名 |
| `confusion.ts` | 副标题改为 `yanchor: "bottom"`，并预留 `fontSize + 14` 的顶部边距；色条在计数模式用整数刻度（`tickformat: "d"`），比例模式显示百分比；色条标题改成英文并放在右侧 |
| `heatmap.ts` | `VectorPlot` 新增可选的 `marginTop` |
| `model.ts` | `evaluation.legendMetric?: boolean`；`defaultEvaluation.legendMetric = true` |
| `EvaluationPanel.tsx` | 新增开关「图例显示 AUC/AP」 |
| `encoding.test.ts`（新增） | 11 个回归测试 |
| `ConfigValidator.java` + 测试、`docs/API.md` | 可选字段校验（只接受布尔值）以及文档。这是本轮**唯一**的后端改动，遵循 CONTRIBUTING.md 中「配置扩展需同时更新 TS、Java 校验、API 文档和测试」的规则 |

如果 `git apply` 失败（说明源码在打包后又改过），就按上表手动实现。`docs/development/patches/*.patch` 里有完整的 diff 可以对照。

### 2. 统一配色来源（A7，补丁里没有）

`model.ts` 的 `palettes` 和 `stylePresets.ts` 的 `colors` 是两套不一致的色板。

- 让 `stylePresets.ts` 成为唯一来源：`model.ts` 里的 `palettes` 改为从 `stylePresets` 派生：
  ```ts
  export const palettes: Record<string, readonly string[]> = Object.fromEntries(
    stylePresets.map((p) => [p.key, p.colors]),
  );
  ```
  注意循环依赖：`stylePresets.ts` 只能 `import type` from `./model`（现在就是这样），不能引入运行时依赖。
- `makeSeries` 的默认色板保持 `"Clean Academic"`。结果是新图的第一条线从紫色 `#6758ce` 变为蓝色 `#3568b5`，与选择「清晰学术」样式后的效果一致。
- 已保存图表的颜色存在配置里，**不受影响**。
- 搜索所有引用 `palettes[` 的地方（`seriesEncoding`、`encoding.ts`、可能还有 reuse 和 QuickActions），确认类型改为 `readonly string[]` 后仍然能编译。

### 3. 新建 ROC 图时的默认值（可选，小改动）

把图表类型切换为 `roc` 时，如果画布还是默认的 760×500，改为 560×560（正方形，两轴等比例）。切换逻辑在 `Editor.tsx` 第 1870 行附近（`evaluation: {...(c.evaluation || defaultEvaluation)`）。只影响**新切换**的图表，不改已保存的图表。

## 验收

- `npm test` 全部通过，其中包括 `editor/encoding.test.ts` 的 11 项。
- `mvn -B -f backend/pom.xml -Dtest=ConfigValidatorTest test` 通过。
- `npm run build` 通过。
- E2E：`npx playwright test e2e/processing.spec.ts e2e/evaluation.spec.ts e2e/classification.spec.ts e2e/editor.spec.ts`
- **手动看图**（演示数据，运行 `node scripts/seed-processing-demo.mjs` 等脚本生成）：
  - 「均值与 SEM」：两条线颜色不同；图例标题是 `Accuracy · mean ± SEM`，条目是 `Baseline` 和 `Method A`；X 轴刻度只有 1、2、3。
  - 混淆矩阵：副标题完整显示在矩阵上方；色条刻度是整数 0、1、2、3；标题为 Count。
  - ROC：新建的 ROC 图图例显示 AUC；打开**旧的** ROC 图，图例不变，开关处于关闭状态。
- 导出一次 SVG 和 PDF，确认以上修复在导出文件里同样生效。

## 已知影响（写进提交说明）

已保存的**分组**图表重新打开后颜色会变化（以前所有组同色，属于 bug）；单序列分组图的图例文字会从「序列 · 组」变成「组」，并加上图例标题。
