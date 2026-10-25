# 任务 04：替换首页（设计 A）

**目标**：打开 LabFlow 第一眼看到的是「上次做到哪」，而不是营销页。视觉目标见 `docs/development/design/home-A.png`（设计稿）和 `docs/development/design/home-A-reference-render.png`（参考实现的实际渲染：用桩数据渲染，图表区是占位 SVG，因为沙箱里没有 Plotly）。

> 设计图里的部分内容是示意，实现时**以真实数据为准**：项目表没有「更新时间」列（`Project` 类型没有这个字段）；没有「上次备份」时间；最近图表列表用图标，不画迷你缩略图（图表列表接口不返回配置，现有文档也明确要求不虚构缩略图）。只有「继续编辑」卡片里的大图是用真实配置和数据渲染的。

## 参考实现

| 参考文件 | 放到 |
|---|---|
| `reference/frontend/src/components/home/HomePage.tsx` | `frontend/src/components/home/HomePage.tsx` |
| `reference/frontend/src/components/home/home.css` | `frontend/src/components/home/home.css` |
| `reference/frontend/src/components/home/homeData.ts` + `.test.ts` | 同目录 |
| `reference/frontend/src/components/home/HomePage.test.tsx` | 同目录 |
| `reference/frontend/src/editor/FigurePreview.tsx` | `frontend/src/editor/FigurePreview.tsx` |

## 步骤

### 1. 放入新首页

1. 复制上表文件。
2. `App.tsx`：`import { HomePage } from "./components/home/HomePage";`。现有 props 全部保留，另外新增两个：
   ```tsx
   onModelConnection={() => setConnectionOpen(true)}
   onAssistant={(chartId, prompt) =>
     routerGo(workspaceUrl("editor", project, chartId), {
       state: { assistantPrompt: prompt },
     })
   }
   ```
   （`go()` 包装函数只透传 `replace`，这里直接用 `routerGo`；也可以给 `go` 增加 `state` 参数。）
3. 删除旧文件：`components/HomePage.tsx`、`components/HomePage.test.tsx`、`components/home.css`、`components/FigureShowcase.tsx`、`components/FigureShowcase.test.tsx`、`components/showcase.css`。从 `main.tsx` 移除 `showcase.css` 的 import。
4. `components/home-workspace.css` 和 `components/experience.css` 中以 `.launch-`、`.workspace-`（首页工作区）、`.tool-`、`.showcase-` 开头的规则已经没有对应元素。确认无人引用后删除（`grep -rn "launch-\|tool-shortcut\|showcase-" frontend/src --include=*.tsx`）。
5. `public/showcase/`（Matplotlib 示例图和许可证）不再被引用，删除；`scripts/render-showcase.py` 一并删除。在汇报里说明：首页不再展示第三方示例图，因此也不需要附带 Matplotlib 许可证说明。

### 2. 共享预览组件

`FigurePreview` 是从 `editor/StylePreview.tsx` 泛化出来的。为避免两份几乎一样的代码，把 `StylePreview` 改为：
```tsx
import FigurePreview from "./FigurePreview";
export function StylePreview({ config, data }: { config: Config; data: Dataset }) {
  const [warnings, setWarnings] = useState<string[]>([]);
  return (
    <>
      <FigurePreview config={config} data={data} maxHeight={220} label="当前数据样式预览" onWarnings={setWarnings} />
      <PreviewWarnings warnings={warnings} />
    </>
  );
}
```
外层用 `<div className="style-preview">…</div>` 包住 `FigurePreview`，保留旧类名：`e2e/styles-library.spec.ts` 第 435 行通过 `.style-preview` 查找元素，`styles-library.css` 第 183–201 行的样式也依赖这个类名（其中 `.style-preview-stage` 改成 `.style-preview .figure-preview-stage`，`.style-preview p` 照常生效）。**注意** `onWarnings` 会在每次重新计算时调用，传进去的 setter 必须是稳定引用（`useState` 的 setter 就是稳定的）。`styles-library.test.tsx` 和 `e2e/styles-library.spec.ts` 必须继续通过。

### 3. 从首页带着一句话打开助手

首页的助手输入框**不会发送**任何请求，只是把文字带到编辑器里。用户仍然需要在编辑器里勾选同意、点击发送，原有流程不变。

1. `editor/AgentAssistant.tsx`：新增可选 prop `initialPrompt?: string`，并把第 171 行改为 `useState(p.initialPrompt ?? "")`。不改其他任何逻辑。
2. `editor/Editor.tsx`：
   ```tsx
   const location = useLocation();
   const navigate = useNavigate();
   const [assistantPrompt] = useState(
     () => (location.state as { assistantPrompt?: string } | null)?.assistantPrompt || "",
   );
   // 在 Workbench 里：
   const [agentOpen, setAgentOpen] = useState(!!assistantPrompt);
   useEffect(() => {
     // 消费一次后清掉 history state，刷新页面时不会再次自动打开
     if (assistantPrompt)
       navigate(location.pathname + location.search, { replace: true, state: null });
   }, []);
   ```
   把 `initialPrompt={assistantPrompt}` 传给 `<AgentAssistant>`（第 2100 行）。`Editor` 和 `Workbench` 是两个组件，state 放在哪一层由你决定，只要满足：只在首次挂载时读取一次，刷新后不再打开。
3. 新增单元测试：`AgentAssistant` 收到 `initialPrompt` 时，输入框有预填内容，并且**没有**调用 `fetch` 发起运行。

### 4. 首页需要的数据（都已有接口，不用改后端）

| 区块 | 来源 | Query key（和编辑器共用缓存） |
|---|---|---|
| 继续编辑：图表配置 | `GET /projects/{p}/charts/{id}` | `["chart", p, id]` |
| 继续编辑：数据 | `GET /projects/{p}/data/{versionId}` | `["data", p, versionId]` |
| 本机草稿标记 | `localStorage` 的 `labflow-draft-v1:{p}:{id}` | — |
| 最近实验 | `GET /projects/{p}/experiments` | `["experiments", p]` |
| 助手状态 | `GET /agent/provider` | `["agent-provider"]` |

`FigurePreview` 通过 `lazy()` 加载，所以 Plotly 仍然只在编辑器分包里。验证方法：`npm run build` 以后，检查首页入口 chunk 的体积没有增加约 1.6 MB。

## 验收

- `npm test` 通过，包括新的 `HomePage.test.tsx`（7 项）和 `homeData.test.ts`（7 项）。
- `npm run build` 通过，首页入口 chunk 中不包含 plotly。
- E2E 需要重写的 spec：`e2e/home.spec.ts`、`e2e/home-workspace.spec.ts`、`e2e/showcase.spec.ts`（整份删除）、`e2e/navigation.spec.ts` 中与首页相关的部分。新的 E2E 至少覆盖：
  1. 有图表的项目：首页显示继续编辑卡片，预览渲染完成（`[data-testid=figure-preview-plot] .main-svg` 出现），点「继续编辑」进入对应图表。
  2. 在编辑器修改但不保存，回到首页，出现「本机草稿 · 有未保存修改」。
  3. 搜索项目、切换项目后，最近图表和最近实验随之更新。
  4. 没有项目时，各入口都打开「新建研究项目」对话框。
  5. 助手已配置时（使用 `e2e/fixtures/compatible-provider.cjs`）：首页输入一句话 → 编辑器打开、助手面板展开、输入框已预填，**没有**产生 `POST /agent/runs` 请求。
  6. 390、1280、1440、1920px 下没有横向滚动条。
- 截图保存为 `docs/screenshots/home.png`（1440px），替换旧图。

## 不要做

- 不要在首页伪造数据（例如没有备份记录时显示「上次备份」，或者给没有方向的指标标「最佳」）。`homeData.ts` 里的 `metricDirection` 只对名称明确的指标做高亮。
- 不要恢复入场动画。新首页不需要 `labflow-intro-v2`，删除相关代码和测试。
