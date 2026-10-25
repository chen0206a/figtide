# 任务 02：设计 token，去掉暖纸层

**目标**：让全站只有一套视觉变量（问题 B1–B3）。这一步完成后，界面看起来应该**和现在基本一样**（现在的冷灰风格是靠覆盖层实现的），区别是这套风格改由 token 直接定义，不再靠覆盖。

## 背景

- `styles.css` 第 11–60 行定义的是暖纸杂志风格（`--paper:#f7f4ee`、`--clay:#b65c3a`、Newsreader 衬线字体）。
- `components/refinements.css` 第 1–10 行用 `.refined-shell { --paper:#fafbfc; … --clay:#3f71c9 }` 把它覆盖成冷灰风格。`App.tsx` 根节点始终带 `refined-shell` 类。
- `navigation.css` 里有大量 `.refined-shell .xxx` 和 `.refined-shell.workbench-shell .xxx` 规则，其中有重复定义（例如 `.workspace-nav` 在第 1 行和第 195 行各定义了一次，`.page-heading h1` 在第 115 行和第 228 行各定义了一次）。

## 步骤

1. 复制 `docs/development/reference/frontend/src/styles/tokens.css` 到 `frontend/src/styles/tokens.css`。
2. `main.tsx`：
   - 删除 `import "@fontsource-variable/newsreader";`，并从 `package.json` 移除这个依赖（`npm uninstall @fontsource-variable/newsreader`）。
   - 在 `import "./styles.css"` **之前**加 `import "./styles/tokens.css";`。
3. `styles.css`：
   - 保留第一行 `@import "tailwindcss";`。
   - 把第 11–16 行的 `@theme` 块替换为下面的内容（Tailwind 的 `@theme` 只能写在导入 tailwindcss 的文件里，所以不放进 tokens.css）：
     ```css
     @theme {
       --color-primary: #0e1116;
       --font-sans: "Inter Variable", Inter, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
       --font-mono: "JetBrains Mono Variable", ui-monospace, monospace;
     }
     ```
   - 删除紧随其后的 `:root { --paper … }` 整块（约第 18–60 行）。这些变量已经由 `tokens.css` 提供，旧名字以别名形式保留。
   - 检查 `html, body` 等基础规则仍然引用 `var(--paper)` 这类旧名字也没关系，别名会生效。
   - 把 `font-family: var(--font-serif)` 全部删除（共 22 处，会自动继承无衬线字体），或者改为 `var(--lf-font-sans)`。衬线字体常配的 `font-style: italic` 和特殊字距一起去掉。
   - 删除顶部注释里的「Editorial design system · Warm paper…」字样。
   - 加载顺序：`main.tsx` 中 `tokens.css` 在 `styles.css` 之前导入。Tailwind preflight 不会覆盖 `:root` 上的自定义属性，但如果发现 `html` 的字体被 preflight 改掉，就在 `styles.css` 的 `html, body` 规则里显式写 `font-family: var(--lf-font-sans)`。
4. `components/refinements.css`：删除第 1–10 行的 `.refined-shell { --paper… }` 变量覆盖块。其余规则保留，留到任务 08 再清理。
5. 全局搜索硬编码颜色，把**和 token 值相同或非常接近**的替换成变量（只做机械替换，不改布局）：
   - `#fff` / `#ffffff` / `white` → `var(--lf-surface)`
   - `#fafbfc`、`#f8f9fb`、`#f6f6f7`、`#f5f7fa` → `var(--lf-surface-2)` 或 `var(--lf-bg)`（页面底色用 bg，控件填充用 surface-2）
   - `#e4e8ee`、`#e4e7ec`、`#e5e7eb` → `var(--lf-border)`
   - `#24262c`、`#1c1a17`、`#111827` → `var(--lf-text)`
   - `#59616e`、`#4b453c` → `var(--lf-text-2)`
   - `#707988`、`#8a8276` → `var(--lf-text-3)`
   - `#3f71c9`、`#2563eb`（UI 选中态，不是图表色） → `var(--lf-link)`
   优先处理 `styles.css`、`navigation.css`、`refinements.css`、`experience.css`。编辑器专用的 CSS（`agent-assistant.css`、`styles-library.css` 等）留到对应任务再处理。
6. 不要修改 `editor/stylePresets.ts`、`plot-core.ts` 里的图表颜色。图表颜色属于数据，不是 UI。

## 验收

- `grep -rn "Newsreader\|font-serif" frontend/src` 结果为空，`tokens.css` 里的别名行除外。
- `grep -rn "refined-shell {" frontend/src/components/refinements.css` 不再出现变量覆盖块。
- 重新统计颜色种类（命令见任务 00），应**明显少于** 417。把数字写进汇报。
- `npm test`、`npm run build` 通过。
- E2E：`npx playwright test e2e/navigation.spec.ts e2e/editor.spec.ts e2e/experience.spec.ts`。有测试断言具体颜色值（`toHaveCSS("color", …)`）时，改成新 token 的值，并在汇报里列出改了哪些。
- **截图对比**：首页、实验页、数据页、编辑器各截一张 1440px 的图，和改动前对比。除了文件名不再是衬线体，以及少量颜色微调以外，不应有布局变化。

## 不要做

- 不改组件结构，不改页面布局。这一步只替换变量和字体。
