# 任务 08：清理与文档

**目标**：删除过渡期留下的东西，让文档和代码一致。

## 步骤

1. **旧变量别名**：删除 `tokens.css` 末尾的 legacy aliases 块。先 `grep -rn "var(--paper\|var(--ink\|var(--card\|var(--line\|var(--clay\|var(--sage\|var(--sky\|var(--amber\|var(--r-\|var(--shadow-card\|var(--shadow-paper\|var(--font-serif\|var(--ease)" frontend/src`，把所有引用改成对应的 `--lf-*`（映射关系见别名块本身），确认没有引用后再删除。
2. **`.refined-shell` 覆盖层**：`navigation.css`、`refinements.css` 里以 `.refined-shell` 开头的规则，内容已经由 tokens 或 `shell.css` 提供的直接删除；还在起作用的规则去掉 `.refined-shell` 前缀，合并到对应组件的 CSS 中。最后从 `App.tsx` 根节点移除 `refined-shell` 类。
3. **重复规则**：`navigation.css` 中 `.workspace-nav`、`.workspace-nav-link`、`.page-heading h1`、`.page-eyebrow` 各有两处定义，`shell.css` 接管之后全部删除。`.page-eyebrow`、`.page-heading` 在任务 03 之后已经没有使用者，确认后从 `styles.css` 删除。
4. **未使用的 CSS**：对 `styles.css` 中的每个顶层类名，用 `grep -rn "<类名>" frontend/src --include=*.tsx` 检查是否还有使用者，没有就删除。重点检查旧首页留下的部分：hero、plates、capabilities、colophon、home-guide。删除前后各截一次图对比。
5. **统计**：重新运行任务 00 的 CSS 统计命令，把前后对比写进 `docs/TEST-RESULTS.md`。目标：硬编码颜色少于 120 种（图表相关文件除外），`!important` 少于 5 处，衬线引用为 0。
6. **DESIGN.md**：把「视觉方向（第三版 · 编辑 / 杂志风格）」整段（第 110–117 行）替换为当前规范：冷灰底、墨黑主按钮、蓝色链接与选中态、朱红只用于关键数字、Inter + JetBrains Mono、token 文件位置、首页 A 的信息结构。`首页：Hero（衬线大标题…）` 那一行一并更新。
7. **HOME-* 文档**：在 `docs/HOME-REDESIGN.md`、`HOME-WORKSPACE.md`、`HOME-AND-ROUTING.md` 顶部各加一行：「2026-10 前端重构后首页已替换，本文仅作历史记录，当前设计见 DESIGN.md。」
8. **截图**：重新生成 README 引用的截图（`docs/screenshots/home-centered.png` 等）。README 中指向已删除截图的链接要更新。
9. **TEST-RESULTS.md**：写一段本轮重构的总结，包括每个任务实际运行的测试和结果、未执行项，以及已知的视觉变化（分组图表颜色、图例文字）。

## 验收

- `npm test`、`npm run build`、全量 `npx playwright test` 通过（或者如实列出未执行项）。
- `grep -rn "refined-shell\|font-serif\|Newsreader\|launch-" frontend/src` 结果为空。
- 1440px 下首页、实验页、数据页、编辑器各截一张图，和任务 02 之后的截图对比，没有意外的样式丢失。
