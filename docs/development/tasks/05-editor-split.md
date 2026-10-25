# 任务 05：拆分编辑器（行为不变）

**目标**：把 `Editor.tsx` 里约 2150 行的 `Workbench` 拆成 hooks 和面板组件（问题 C1、C5）。**这是风险最高的一步**：只移动代码，不改行为、不改 DOM 结构、不改 CSS 类名和 `aria-*`。E2E 是主要的安全网。

## 原则

- **一次移动一块，每移动一块就跑一次测试并提交。** 不要一次性重写。
- 移动时保持 JSX 原样。props 用明确的类型，不传整个 `p` 对象，也不用 `any`。
- 状态的归属不变：所有 `useState` / `useReducer` 先留在 `Workbench` 里，通过 props 传给子组件。等全部拆完以后，再考虑把只被单个面板使用的 state 下放到那个面板里。
- 现有 `data-testid`、`aria-label`、按钮文字一律不改（E2E 依赖它们），只有第 7 步明确要求改的除外。

## 目标结构

```
editor/
  Editor.tsx                 # 只保留数据加载外壳 + <Workbench>（约 70 行）
  workbench/
    Workbench.tsx            # 组合 hooks 和面板，持有 state（目标不超过 400 行）
    useEditorDraft.ts        # 第 255–483 行：initialDraft / recovery / seed / DraftWriter / 离开保护
    usePlotRenderer.ts       # 第 499–583 行：deferred config、buildPlot、Plotly 渲染队列、点击选中序列
    useChartSave.ts          # 第 584–630 行：save(asCopy)
    useFigureExport.ts       # 第 672–720 行：download()
    useEditorShortcuts.ts    # 第 631–671 行：Ctrl+K / Ctrl+S / Ctrl+Z
    usePanelLayout.ts        # 第 186–254 行和第 315–333 行：面板宽度、拖拽、显示/隐藏、localStorage
    EditorToolbar.tsx        # 第 726–880 行
    DataLayersPanel.tsx      # 第 892–1115 行（左栏）
    FigureCanvas.tsx         # 第 1117–1245 行
    BottomDrawer.tsx         # 第 1247–1383 行
    Inspector.tsx            # 第 1385–2123 行的外框和标签切换
    inspector/
      ChartTab.tsx           # panel === "chart"（第 1413 行和第 1608 行，共两段）
      AppearanceTab.tsx      # panel === "appearance"（第 1475 行）
      SeriesTab.tsx          # panel === "series"（第 1686 行）
      AxesTab.tsx            # panel === "axes"（第 1839 行）
      AnnotationsTab.tsx     # panel === "annotations"（第 1990 行）
      （"professional" 已经是 ProfessionalPanel，保持不动）
    EditorStatusBar.tsx      # 第 2124–2134 行
    dialogs/
      RecoveryDialog.tsx     # 第 2136 行
      ConflictDialog.tsx     # 第 2170 行
      ExportDialog.tsx       # 第 2226 行
      VersionHistoryDialog.tsx # 第 2303 行
    controls.tsx             # 第 2339 行之后的 Section / Text / NumberInput / Select / Toggle
```

行号以打包时的快照为准。任务 01、04 改过这个文件，开工前先用 `grep -n` 重新定位。

## 步骤（每一步单独提交）

1. **controls.tsx**：把 `Section`、`Text`、`NumberInput`、`Select`、`Toggle` 移出去并导出。这一步最安全，用来熟悉这个文件。
2. **对话框**：四个 Dialog 分别移出。每个接收自己需要的值和回调，例如：
   ```ts
   type ExportDialogProps = {
     open: boolean; onOpenChange(v: boolean): void;
     format: "svg" | "png" | "pdf"; onFormat(v: …): void;
     scale: number; onScale(v: number): void;
     config: Config; exporting: boolean; onDownload(): void;
   };
   ```
3. **usePanelLayout**：返回 `{ widths, panels, togglePanel, resizer }`。`resizer(side)` 仍然返回 JSX，也可以改成 `<PanelResizer side … />` 组件，二选一。
4. **useEditorShortcuts**：参数是 `{ saving, quickOpen, canQuick, save, undo, redo, openQuick }`。保持现在「每次渲染重新注册」的写法，或者改用 ref 保存最新的回调，避免闭包过期，二选一，但行为必须一致：
   - 焦点在 `.agent-dock` 内时，Ctrl+S 只阻止默认行为，不保存；
   - 焦点在 INPUT / TEXTAREA 时，Ctrl+Z 走浏览器原生撤销。
5. **useChartSave**、**useFigureExport**：直接移动函数体。`setLogs`、`notify` 等通过参数传入。
6. **usePlotRenderer**：返回 `{ plot, plotPending, plotError, graphRef, plotReady }`。点击和图例点击时调用的 `setSeriesId` / `setPanel` 作为回调参数传入。**特别注意** `drawn.current` 和 `plotReady.current` 的串行队列语义不能变（它保证导出时拿到的是最新画面）。
7. **EditorToolbar**（这一步允许改 UI，问题 C5）：
   - 面板开关「数据栏」「属性栏」改成图标切换按钮：用 `PanelLeft` / `PanelRight` 图标，**保留**原来的 `aria-pressed`，加上 `aria-label="数据栏"` / `aria-label="属性栏"`，`title` 写同样的文字。E2E 用 `getByRole("button", { name: "数据栏" })` 查找时仍然能找到。
   - 「快捷操作」「绘图助手」保留文字按钮，它们是主要功能。
   - 「复用」保留为文字按钮（7 处 E2E 用 `getByRole("button", { name: "复用" })` 点击它，而且这是常用操作）。
   - 「另存副本」移到「保存」按钮旁边的小菜单里：`<button aria-label="更多保存选项" aria-haspopup="menu" aria-expanded>` 加上 `role="menu"` 的列表，菜单项为 `role="menuitem"`，文字仍是「另存副本」。菜单支持 Esc 关闭、点击外部关闭、方向键在菜单项之间移动。只有 `e2e/refinements.spec.ts` 用到它，改成先打开菜单，再 `getByRole("menuitem", { name: "另存副本" })`。
   - 图表名称输入框加宽，避免在 1440px 下被截断：`.figure-info input { min-width: 0; flex: 1; }`，并让 `.figure-info` 使用 `flex: 1 1 320px`。
8. **DataLayersPanel**、**FigureCanvas**、**BottomDrawer**：依次移出。
9. **Inspector + 各标签页**：先移外框和标签切换，再一个标签一个标签地移。「chart」标签有两段（第 1413 行和第 1608 行），合并到同一个 `ChartTab` 里，保持两段的先后顺序不变。
10. **useEditorDraft**：最后做，它和保存、离开保护耦合最深。返回 `{ draftKey, initialDraft, recovery, setRecovery, seed, draftStatus, preserveNow }`。`useLayoutEffect` 里注册 `onLeaveGuard` 的逻辑原样保留。

## 验收（每一步都要）

- `npm test` 通过：`AgentAssistant.test.tsx`、`styles-library.test.tsx`、`professional.test.tsx`、`figureTools.test.tsx`、`publication.test.tsx` 都会渲染编辑器部件。
- `npm run build` 通过。
- E2E（第 7 步之后和最后一步之后必须跑全量）：
  `npx playwright test e2e/editor.spec.ts e2e/workflow.spec.ts e2e/refinements.spec.ts e2e/seamless.spec.ts e2e/figure-tools.spec.ts e2e/styles-library.spec.ts e2e/publication.spec.ts e2e/delivery.spec.ts e2e/agent.spec.ts`
- 最终：`Workbench.tsx` 不超过 400 行；`Editor.tsx` 不超过 120 行；没有任何文件超过 600 行。在汇报里列出每个新文件的行数。
- 手动检查：撤销/重做、刷新后草稿恢复、两个标签页同时保存触发冲突对话框、导出 SVG/PNG/PDF、点击曲线选中序列、拖拽调整面板宽度，全部和拆分前一致。

## 不要做

- 不改 `historyReducer`、`DraftWriter`、`layoutPatch`、`buildPlot`。
- 不引入新的状态管理库（zustand、redux 等）。
- 不在这一步修改样式（第 7 步顶栏的小改动除外）。
