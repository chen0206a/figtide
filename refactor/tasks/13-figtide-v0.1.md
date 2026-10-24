# 任务 13：改名 FigTide（图汐）并准备 v0.1.0 发布

**目标**：产品对外名称从 LabFlow 改为 **FigTide**，中文名 **图汐**；换上新图标；整理 README 和展示页，准备发布 v0.1.0。
**品牌资产**：`refactor/brand/`（说明见同目录 `README.md`）。图标方案是设计画布里的「方向 B · 波浪 F」。
**范围**：只改用户看得到的名字、图标和文档。规则同 AGENTS.md：不改后端逻辑、API、schema v1，不删断言。在 `refactor/frontend` 的基础上新建分支 `release/v0.1.0`，每节单独提交，**不推送、不合并 main**（这两步由仓库主人在 GitHub 上操作）。

---

## 13-0 改名边界（先读）

**要改**：界面文字、document.title、介绍页、公开展示页、README 和 docs 的产品名称、图标和 favicon、导出文件里写给人看的「创建工具」元信息（如果有）、AGENTS.md 中的产品名。

**不改**（改了要做数据迁移，用户也看不到）：
- Java 包名 `dev.labflow`、Maven artifactId、数据库名 `labflow` / `labflow_e2e`；
- 本地存储键 `labflow-*`（包括 `labflow-draft-v1:*`、`labflow-intro-seen`）；
- 环境变量 `LABFLOW_*`、API 路径、`data-testid`；
- `docs/TEST-RESULTS.md` 等历史记录里的旧名字（历史记录保持原样）。

本地目录名和仓库名由仓库主人决定，代码里不要硬编码新的本地路径。

## 13-1 图标与品牌组件

1. 复制资产：
   - `refactor/brand/favicon.svg`、`favicon.ico` → `frontend/public/`；
   - `png/figtide-icon-180.png` → `frontend/public/apple-touch-icon.png`；
   - `png/figtide-icon-192.png`、`png/figtide-icon-512.png` → `frontend/public/`；
   - `figtide-icon.svg`、`figtide-icon-small.svg`、`figtide-icon-reverse.svg` → `frontend/src/assets/brand/`。
2. `index.html` 更新 favicon、apple-touch-icon 和 `<title>`；如果有 web manifest，更新 name 和 icons，没有就不新建。
3. 新建 `components/BrandMark.tsx`：
   - 属性 `size`（图标边长）和 `tone`（`"dark"` 用于浅色背景，`"light"` 用于深色背景）；
   - 显示尺寸 ≤ 24 px 时用 `figtide-icon-small.svg`，大于 24 px 时用 `figtide-icon.svg`；深色背景用 reverse 版；
   - 字标：**Fig** 字重 800 + **Tide** 字重 400，字距 -0.03em；可选 `showCn`，在字标后显示一条竖线和「图汐」；
   - 图标 `alt=""`，整体 `aria-label="FigTide"`。
4. 顶栏、介绍页导航、介绍页页脚、编辑器底部状态栏、离线页、关于弹窗，统一改用 `BrandMark`，删除旧的字母 logo 和折线 logo。介绍页首屏不需要放大号 logo，保持现在的标题设计。
5. 单测：两种尺寸选用的 SVG 正确；`aria-label` 正确。

## 13-2 文案替换

1. 盘点：`grep -rn "LabFlow" frontend/src frontend/index.html site scripts README.md docs/*.md AGENTS.md`，把结果按「用户可见 / 内部标识 / 历史记录」分三类，写进汇报。只替换「用户可见」类。
2. 规则：
   - 句子里的产品名用 FigTide；
   - 介绍页首屏下方、关于弹窗、README 标题和展示页页脚，可以写「FigTide 图汐」；
   - document.title 后缀统一为 `· FigTide`；
   - 隐私说明 `lib/privacy.ts` 里的产品名同步改，其余文字不动。
3. 公开展示页 `site/index.html`：换名字和图标；GitHub 链接改为 `https://github.com/chen0206a/figtide`（仓库主人会把仓库改成这个名字，GitHub 会把旧地址自动跳转过来）；补上 `og:title`、`og:description`、`og:image`（使用 `docs/media/social-preview.png` 的 raw 地址）和 `twitter:card=summary_large_image`。`scripts/test-site.cjs` 的断言同步更新。
4. 相关测试断言改成新名字，在汇报中逐条列出；不删断言。

## 13-3 README 与媒体文件

1. 任务包已经把 `social-preview.png`、`FigTide-assistant.gif`、`FigTide-plot.gif` 放在 `docs/media/` 里，直接引用即可（GIF 里的数据是示意数据，README 中图片下方注明）。宣传片 MP4 不进仓库。
2. 按以下结构重写 README：
   1. 标题「FigTide 图汐」+ 一句话介绍 + social-preview 图；
   2. 两张 GIF：绘图助手、绘图；
   3. **功能**：每条一行，只写已经实现的功能；
   4. **数据与隐私**：直接使用 `lib/privacy.ts` 里的三段文字；
   5. **快速开始**：按现在真实的启动方式写（脚本启动、需要 JDK 和 MySQL），并注明「双击运行的桌面版正在开发中」；
   6. **技术栈**、**测试**（如何跑单测和 E2E）、**项目结构**；
   7. **许可证**：如果仓库里已有 LICENSE，照实写；**没有就不要自己添加**，在汇报里提醒仓库主人选择。
3. 内容必须与代码一致（例如工具数量、图表类型数量），不确定的数字不要写。

## 13-4 版本与发布准备

1. `frontend/package.json` 的 version 改为 `0.1.0`；后端 `pom.xml` 的 version 如果是 SNAPSHOT，改为 `0.1.0`，后端代码不动。关于弹窗显示版本号（从 package.json 构建时注入，不要手写）。
2. 新建 `CHANGELOG.md`，写 `## 0.1.0 — {日期}`，按「数据与版本 / 科研绘图 / 绘图助手 / 界面」分组列出主要功能，只写已实现的。
3. 把 `.runtime/` 里验收真正用到的测试脚本（例如 `test-refactor09.ps1`）整理到 `scripts/`，去掉本机绝对路径，在 README 的「测试」一节说明用法。`.runtime/` 本身仍然被 git 忽略。
4. 本地打标签 `git tag v0.1.0`（不推送）。

## 总验收

- `npm test`、`npm run build` 通过；`./scripts/test-agent.ps1 -All -FixturePort 18770` 全部通过（报告 passed / failed / skipped 和总数）；`node scripts/test-site.cjs` 通过。
- 运行 `grep -rn "LabFlow" frontend/src frontend/index.html site README.md`，剩下的每一处都要能说明属于内部标识或历史记录。
- 截图：首页、编辑器顶栏、介绍页（1440 / 390）、浏览器标签页 favicon、公开展示页，保存为 `docs/screenshots/release-0.1-*.png`。
- 按 AGENTS.md 格式汇报，最后单独列出「需要仓库主人在 GitHub 上完成的事」：
  1. 仓库改名为 `figtide`（Settings → General → Repository name）；
  2. 推送 `release/v0.1.0` 分支和 `v0.1.0` 标签，开 PR 合并进 main；
  3. Settings → General → Social preview，上传 `docs/media/social-preview.png`；
  4. Settings → Pages，开启并选择发布来源；
  5. 选择并添加 LICENSE；
  6. 在 Releases 里用 CHANGELOG 的内容发布 v0.1.0。
