# 首页图廊与独立工作台（2026-10-20）

## 页面与导航

- 首页 `/`：产品介绍 → 横向图表示例 → 功能入口 → 本机工作区。
- 实验工作台 `/projects/:projectId/experiments`。
- 数据工作台 `/projects/:projectId/data?dataset=:versionId`。
- 新图表 `/projects/:projectId/figures/new?dataset=:versionId`。
- 已保存图表 `/projects/:projectId/figures/:chartId`。
- 尚未创建项目时 `/workspace/data`、`/workspace/experiments`、`/workspace/figures/new` 显示创建项目入口。

使用 React Router 7 数据路由。URL 是项目、图表及所选数据版本的入口；刷新留在原工作台，前进/后退恢复对应页面。保存新图表后 replace 当前地址，避免历史记录中残留一个已保存草稿。切换项目保留原先返回首页的行为。

深链接不存在或项目已归档时显示明确的错误页，不将链接悄悄指向其他项目。使用 useBlocker 保留未正式保存图表的离开提示；取消后留在当前图表，确认后草稿可恢复。确认函数保持稳定引用，避免取消后因重复 effect 再次打开提示。窗口刷新仍保留编辑器原有的 beforeunload 和草稿写入。

导航改为可复制地址的链接，包含 aria-current；240 ms 滑动底色、悬停文字上移、按下反馈，键盘焦点具有相同反馈。减少动画偏好关闭位移与页面进入动画。页面切换更新标题、焦点与滚动位置。工作台移除首页双层页头，顶部统一为 68 px，将空间留给画布。

## 视觉与图廊

参考 [Mobbin](https://mobbin.com/) 收录的真实产品界面，采用暖白、浅石墨和低饱和蓝色，图廊用浅蓝、薄荷绿、淡紫与米色区分图版。Mobbin 是参考库，本项目没有复制其品牌素材或付费截图。

图廊为本地 PNG 参考图片，65 秒无缝循环；悬停、键盘焦点、手动暂停和移出视口会暂停。开启减少动画时展示静态横向图库。复制轨道对辅助技术隐藏且 inert。图片总计约 79 KB，同一地址的复制图片可复用浏览器缓存。

首页按用户要求统一使用“图表示例”，不加“合成数据”标签。图片来自 Matplotlib 官方图库，素材说明明确为外部参考图，并非 LabFlow 导出截图；没有改动既有 CSV、实验记录或科研结果。

四张图片及对应许可保存在 `frontend/public/showcase/`；`sources.json` 记录每张图片的原始页面、图片地址、作者、许可与 SHA-256。素材说明弹窗提供各原始页面链接及完整本地许可。图片原样保存，仅通过 CSS 等比缩放与排版。

- [区间示例](https://matplotlib.org/stable/gallery/lines_bars_and_markers/fill_between_demo.html)
- [带标注热力图](https://matplotlib.org/stable/gallery/images_contours_and_fields/image_annotated_heatmap.html)
- [彩色箱线图](https://matplotlib.org/stable/gallery/statistics/boxplot_color.html)
- [分组柱状图](https://matplotlib.org/stable/gallery/lines_bars_and_markers/barchart.html)
- [Matplotlib 许可](https://matplotlib.org/stable/project/license.html)

Copyright (c) 2012- Matplotlib Development Team; All Rights Reserved.

## 运行与部署

本地启动命令不变：仓库根目录执行 `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1 -SkipBuild`（已安装依赖和已有 Java 包时），浏览器打开 `http://127.0.0.1:5176/`。

单独检查：在 `frontend` 目录执行 `npm run test`、`npm run e2e`、`npm run build`。

Vite 开发服务器支持 history fallback；将来使用其他静态服务器发布 `dist` 时，需要把非文件、非 `/api` 的前端路由回退到 `index.html`，同时保留 `/api` 到 Java 的代理。这轮没有公开部署。

## 验收

新增路由解析与恢复单元测试、图廊暂停与许可交互测试；浏览器覆盖独立地址、刷新、浏览器前进/后退、取消离开不丢设置、确认离开后恢复草稿、键盘导航、减少动画、无外部图片请求，以及首页 900/1280/1920 宽度。

截图：`screenshots/home-showcase.png`、`screenshots/routed-workbench.png`、`screenshots/routed-home.png`。

最终验证：Vitest 90/90；完整 Chrome E2E 29/29（2.1 分钟）；TypeScript / Vite 生产构建通过，保留已有大分包提示。没有改动 Java 或重跑 Java 单测。过程中曾因前端服务退出而出现 ECONNREFUSED；恢复服务后重新完整执行，最终运行没有失败或跳过。
