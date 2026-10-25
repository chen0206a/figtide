# 任务 03：统一外壳，整理数据页与实验页

**目标**：所有页面使用同一个顶栏，工具页面去掉大标语，并把 `DataPage` 从 `App.tsx` 中拆出来（问题 B5–B7、C2、C6）。

## 步骤

### 1. 外壳

1. 复制 `docs/development/reference/frontend/src/styles/shell.css` 到 `frontend/src/styles/shell.css`。
2. 在 `main.tsx` 中把它作为**最后一个** CSS import（放在所有 `components/*.css` 之后）。
3. `App.tsx` 顶栏结构保持不变，只调整内容：
   - 「管理项目」「模型连接」「+」三个按钮保留。「模型连接」在窄屏下只显示图标，`aria-label` 已经有了。
   - 项目下拉框保留 `aria-label="当前项目"`，E2E 依赖它。
4. 在 1280px 和 1920px 宽度下分别从首页切换到实验页，顶栏的 logo 和导航位置**完全不动**。

### 2. PageHeader

1. 复制 `docs/development/reference/frontend/src/components/PageHeader.tsx`。
2. **数据页**：把 `page-eyebrow` + `page-heading`（「每一份数据，都有来源。」）替换为：
   ```tsx
   <PageHeader
     title="数据管理"
     description="原始文件只读保存，每次更新追加为新版本。"
     actions={<Button …>上传数据文件</Button>}
   />
   ```
3. **实验页**（`experiments/Experiments.tsx` 第 106–125 行）：替换为
   ```tsx
   <PageHeader
     title="实验记录"
     description="参数、指标和数据版本关联在一起，可以选择 2–8 个实验进行对比。"
     actions={<>…原有的两个按钮…</>}
   />
   ```
4. 编辑器的空状态（`Editor.tsx` 第 148–163 行，「从数据，走向发现。」）保留，它属于空状态，不是工具页标题。

### 3. 拆出 DataPage

1. 把 `App.tsx` 第 554–771 行的 `DataPage` 移到新文件 `frontend/src/data/DataPage.tsx`，props 不变，原样导出。
2. 把内联样式的 `planner-entry`（第 684–705 行）改成 CSS 类，写进新建的 `frontend/src/data/data-page.css`，只用 token：
   ```css
   .planner-entry {
     display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
     gap: var(--lf-space-4); padding: var(--lf-space-4) var(--lf-space-5);
     margin: var(--lf-space-5) 0; border-radius: var(--lf-radius-md);
     background: var(--lf-surface-2); border: 1px solid var(--lf-border);
   }
   .planner-entry p { margin: 6px 0 0; color: var(--lf-text-3); font-size: var(--lf-text-sm); }
   ```
3. 数据页左侧版本列表的文件名改用 `.lf-mono`（之前显示成衬线体）。任务 02 之后应该已经不是衬线体，这里只是统一成等宽字体。
4. 数据表格占不满宽度时，列不要被拉得过开：给 `DataTable` 外层设置 `width: auto; min-width: 100%`，列宽改为按内容决定（只改 CSS）。

### 4. 实验页小修

1. 底栏文案：`已选 {selected.length} / 8 个实验` 改为 `已选 {selected.length} 个实验（最多 8 个）`。
2. 筛选栏右侧的「3 / 3 条记录」不换行：加 `white-space: nowrap`。
3. 底部的选择栏会盖住最后一张卡片：给列表容器加 `padding-bottom`，数值等于选择栏高度加 16px。
4. 状态标签改用 `<span className="lf-chip" data-tone=…>`：planned → neutral，running → info，completed → success，failed → danger。
5. 卡片内边距从现在的值收紧到 `var(--lf-space-5)`，让 1440×900 的屏幕上能多显示一到两张卡片。**不改**卡片包含的信息和操作。

## 验收

- `npm test`、`npm run build` 通过。
- E2E：`npx playwright test e2e/navigation.spec.ts e2e/experiments.spec.ts e2e/seamless.spec.ts e2e/home.spec.ts`
  - 这些测试按旧标题查找：`把探索，沉淀为记录。` → `实验记录`，`每一份数据，都有来源。` → `数据管理`。用 `grep -rn "沉淀为记录\|都有来源" frontend/e2e frontend/src` 找全，一并更新。
- `grep -n "style={{" frontend/src/data/DataPage.tsx` 结果为空。
- `App.tsx` 行数减少 200 行以上。
- 截图：实验页、数据页 1440px 和 390px 各一张，没有横向滚动条。

## 不要做

- 不改实验对比、数据处理、上传对话框的逻辑。
