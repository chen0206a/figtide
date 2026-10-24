# 任务 09 / 10 补充包

把这个压缩包解压到仓库根目录，会和已有的 `refactor/` 目录合并（不会覆盖任务 00–08 的文件）：

```
refactor/
  README-09-10.md          ← 本文件
  tasks/09-visual-polish.md
  tasks/10-home-motion-intro.md
  design/09-10/            ← 设计稿：png（视觉目标）、static（精确样式和动画）、source（交互逻辑）
```

## 执行顺序

一次只做一个小节，做完提交、汇报，再做下一个：

1. 09-1 → 09-2 → 09-3 → 09-4 → 09-5，然后做任务 09 的「总验收」
2. 10-0 → 10-1 → 10-2 → 10-3 → 10-4 → 10-5，然后做 10-6 验收

给 Codex 的指令示例：

> 阅读 AGENTS.md 和 refactor/README-09-10.md，执行 refactor/tasks/09-visual-polish.md 中的 09-1。完成后提交，并按 AGENTS.md 的格式汇报。

## 约束提醒

AGENTS.md 的所有规则继续有效：不改后端、不改 API 和 schema v1、不伪造数据、不删断言、不调用收费模型、测试没跑就写「未执行」。任务 10-0 会在 AGENTS.md 里追加一节「动效规则」，之后的小节都要遵守。

## 两个已确定的产品决定

- 网站首页（产品介绍）只在**第一次打开**时显示，之后直接进入工作区；随时可以从 `/welcome` 或页脚的「关于 LabFlow」再次打开。
- GitHub Pages 的公开展示页（`site/index.html`）也换成这个产品介绍页。因为 Pages 上没有后端，那里的按钮改成「本地运行」，指向仓库 README。
