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

借鉴用户提供的 [Mobbin](https://mobbin.com/) 截图的居中内容与黑白卡片层级。首页页头限定 1200 px 并居中，工作台保留完整工具栏宽度；功能入口以白底黑字为主、绘图入口黑底白字，增加明确的操作文字、键盘焦点与轻微悬停反馈。没有复制品牌素材或商业截图。

图廊包含 10 张统一字体与留白、蓝/青/暖橙配色的本地 PNG，150 秒匀速无缝循环，移除播放/暂停按钮，悬停与聚焦时持续滚动。移出视口时暂停计算；系统开启减少动画时展示静态横向图库。复制轨道对辅助技术隐藏且 inert，图片没有外部运行时请求。图廊采用浅灰圆角外框、宽窄交错的画幅与图表类型角标，其中一张密度图使用深色画布形成明暗节奏；功能入口保持黑白，图表保留科研配色。

原先紫绿热力图改为蓝白相关性矩阵；分组柱图、箱线图、等高线、密度图和堆积图等统一线条、字体、留白与配色。通过 `scripts/render-showcase.py` 使用 Matplotlib 示例的数据、固定随机种子与计算公式重新渲染，保留来源及改编记录，不将参考图版宣称为 LabFlow 导出截图。示例误差是上游教学数据的固定误差，不代表真实实验统计结果。没有改变用户的原始文件、图表配置或统计计算。

运行 `python scripts/render-showcase.py` 可重建这些静态图版（可选开发依赖：Matplotlib 3.10.0、NumPy 2.1.3；应用运行不需要 Python）。`frontend/public/showcase/sources.json` 记录上游页面/原始图片地址、作者、许可、改编说明、输出 SHA-256 与渲染器版本。首页不显示“合成数据”标签，素材说明保留真实来源；原有科研数据元信息不变。

- [曲线与区间](https://matplotlib.org/stable/gallery/lines_bars_and_markers/fill_between_demo.html)
- [相关性矩阵](https://matplotlib.org/stable/gallery/images_contours_and_fields/image_annotated_heatmap.html)
- [箱线图](https://matplotlib.org/stable/gallery/statistics/boxplot_color.html)
- [分组柱状图](https://matplotlib.org/stable/gallery/lines_bars_and_markers/barchart.html)
- [散点及边际分布](https://matplotlib.org/stable/gallery/lines_bars_and_markers/scatter_hist.html)
- [直方图](https://matplotlib.org/stable/gallery/statistics/hist.html)
- [等高线](https://matplotlib.org/stable/gallery/images_contours_and_fields/contour_demo.html)
- [密度图](https://matplotlib.org/stable/gallery/statistics/hexbin_demo.html)
- [误差棒示例](https://matplotlib.org/stable/gallery/statistics/errorbar.html)
- [流图](https://matplotlib.org/stable/gallery/lines_bars_and_markers/stackplot_demo.html)（使用固定种子的 Gaussian mixture 示例，不使用联合国人口数据）
- [Matplotlib 许可](https://matplotlib.org/stable/project/license.html)

Copyright (c) 2012- Matplotlib Development Team; All Rights Reserved.

## 运行与部署

本地启动命令不变：仓库根目录执行 `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1 -SkipBuild`（已安装依赖和已有 Java 包时），浏览器打开 `http://127.0.0.1:5176/`。

单独检查：在 `frontend` 目录执行 `npm run test`、`npm run e2e`、`npm run build`。

Vite 开发服务器支持 history fallback；将来使用其他静态服务器发布 `dist` 时，需要把非文件、非 `/api` 的前端路由回退到 `index.html`，同时保留 `/api` 到 Java 的代理。这轮没有公开部署。

## 验收

图廊单元测试验证没有播放控件、复制轨道可访问性、许可说明和减少动画。浏览器覆盖 390/900/1280/1920/2560 宽度、2560 px 屏幕下页头居中、悬停与聚焦持续滚动、黑白卡片的实际计算颜色、十张图片全部加载、无外部图片请求，以及各模块跳转、前进/后退、未保存离开确认和草稿恢复。

截图：`screenshots/home-centered.png`、`screenshots/home-wide.png`、`screenshots/home-actions.png`、`screenshots/home-gallery-actions.png`。验证结果见 `TEST-RESULTS.md` 顶部最新增量。
