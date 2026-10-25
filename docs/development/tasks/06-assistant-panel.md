# 任务 06：绘图助手面板布局

**目标**：输入框和发送按钮始终可见；建议按钮不再被底栏遮住；预算信息不再占据主要位置（问题 C3）。**只改布局和 CSS，不改任何状态、请求、预算、恢复逻辑。**

## 现状

- 停靠模式下，`.quick-actions-body` 是唯一的滚动区域，对话记录、预算、输入框、同意勾选和发送按钮都在里面。下方的 `.quick-result-footer`（「应用这组调整」）固定在面板底部。屏幕不够高时，发送按钮被挤出可视区域，建议按钮被底栏切掉一半（见用户截图 09-agent.jpg）。
- 预算 `<details className="agent-budget">` 位于输入框上方，摘要行写着「会话预算 · 180,000」。

## 步骤

1. **三段式布局**：停靠面板改为 `flex` 纵向三段：
   - 顶部（不滚动）：模型行（`.agent-provider`）+ 预算摘要行；
   - 中间（`flex: 1; overflow-y: auto`）：对话记录 `.agent-thread`、各种提示、提案详情；
   - 底部（不滚动）：`.agent-composer`（输入框、建议按钮、同意勾选、发送按钮），再往下是 `.quick-result-footer`。
   做法：在 `AgentAssistant.tsx` 中把 `.agent-composer` 从滚动区里移出来，放在 `.quick-actions-body` 之后、`proposalActions` 之前（仅限停靠模式 `p.docked`；非停靠模式保持原样）。这是**纯 JSX 位置移动**，组件内的 state 和回调都不变。
2. **底栏紧凑化**：没有提案（`!result`）时，`.quick-result-footer` 加一个 `is-idle` 类，只显示一行：「应用这组调整」按钮（保持渲染且为禁用状态，多个单元测试会检查它的禁用状态，**不能**隐藏或移除），隐藏说明文字 `<p>`。有提案时恢复完整样式。
3. **预算摘要**：
   - 摘要行改成「本次会话 · 已用 x / 上限 y」，下面加一条 3px 的进度条（`<progress>` 或 `div` 宽度百分比，要有 `aria-label="会话预算使用情况"`）。数值来自现有的 `session.used_budget + session.reserved_budget` 和 `session.max_budget`；没有 session 时显示「本次会话上限 180,000」。
   - `<details>` 默认收起（现在就是），展开后的内容（额度选择 `aria-label="本次对话额度"`、「跨轮累计的保守预算单位……」说明、已用/预留/剩余明细）**保持不变**。
4. **欢迎区**：「从一个具体的调整开始。」下面直接放三个建议按钮（把现在 composer 里的 `.agent-suggestions` 移上来，**只在没有对话时显示**）。有对话以后，建议按钮不再显示，节省底部空间。按钮文字不变。
5. **模型地址**：`.agent-provider` 第二行现在显示完整 endpoint URL。改为只显示主机名（`new URL(endpoint).host`，解析失败时显示原文），完整 URL 放到 `title` 里，避免截图时暴露完整地址。
6. `agent-assistant.css` 里的硬编码颜色换成 token（`#fff` → `--lf-surface`，`#e5e7eb` / `#e8ebef` → `--lf-border` / `--lf-divider`，`#24262c` → `--lf-text`，`#7d828b` → `--lf-text-3`，`#fafafa` → `--lf-surface-2`）。

## 验收

- `npm test`：`AgentAssistant.test.tsx`、`AgentHistory.test.tsx`、`agentConversation.test.ts`、`agentRecovery.test.ts` 全部通过，且**不修改**这些测试的断言（第 4 步移动建议按钮时，如果某个测试按顺序查找元素，只允许调整查找方式）。
- E2E：`npx playwright test e2e/agent.spec.ts e2e/model-connection.spec.ts`
- 手动：1440×900 和 1280×720 窗口下打开助手：
  - 不滚动面板就能看到输入框和「生成调整提案」按钮；
  - 建议按钮完整可见；
  - 有提案时「应用这组调整」和「继续修改」都可见；
  - 对话很长时，只有中间区域滚动。
- 截图更新：`docs/screenshots/agent-conversation.png`、`agent-session-budget.png`。

## 不要做

- 不改 `start()`、`reconnect()`、apply 和 decision 的请求逻辑，不改 `remember()`、sessionStorage 的键和内容。
- 不改同意勾选的默认值（必须保持默认不勾选）。
