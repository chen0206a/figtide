# 任务 00：建立基线

**目标**：在开始改代码前，记录「现在能通过什么」。之后每个任务都和这份基线对比，区分是新问题还是原本就有的问题。

## 步骤

1. 确认工作区干净。当前快照里有未提交的改动（见 `HANDOFF/工作区状态.txt`），先提交成一个基线提交：
   ```bash
   git add -A
   git commit -m "chore: snapshot before frontend refactor"
   git switch -c refactor/frontend
   ```
2. 前端（在 `frontend` 目录）：
   ```bash
   npm ci
   npm test 2>&1 | tee ../refactor/baseline-vitest.txt
   npm run build 2>&1 | tee ../refactor/baseline-build.txt
   ```
3. 如果本机有后端和测试库，跑一遍完整 E2E，把结果保存到 `refactor/baseline-e2e.txt`。跑不了就在文件里写「未执行：原因」。
   ```bash
   npx playwright test 2>&1 | tee ../refactor/baseline-e2e.txt
   ```
4. 记录 CSS 现状（在 `frontend/src` 目录），结果保存到 `refactor/baseline-css.txt`：
   ```bash
   find . -name "*.css" | xargs wc -l | tail -1
   grep -ohE '#[0-9a-fA-F]{6}\b' $(find . -name "*.css") | tr A-F a-f | sort -u | wc -l
   grep -c '!important' $(find . -name "*.css") | awk -F: '{s+=$2} END {print s}'
   grep -rn "font-serif\|Newsreader" --include=*.css --include=*.tsx . | wc -l
   ```
   参考值（打包时统计）：CSS 7820 行、417 种颜色、26 处 `!important`、22 处衬线引用。

## 验收

- `refactor/baseline-*.txt` 四个文件都存在。
- 汇报里列出基线中**已经失败**的测试（如果有）。这些失败之后不算作本次重构引入的问题。

## 不要做

- 不修任何东西。发现的问题记在汇报里，留给对应任务处理。
