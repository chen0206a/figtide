## 2026-10-24 · FigTide v0.1.0 发布准备

当前仓库地址为 https://github.com/chen0206a/figtide ，所有者已选 MIT，根目录 LICENSE 已添加。展示页使用新品牌与 og:image / Twitter 大卡片；README 安装入口指向新仓库。旧发布记录保留在下面，代表当时状态。远端尚为空，需所有者推送 main 后使 README 与 raw 媒体可用；本轮不推送、不合并、不执行远端部署。

---

# 独立静态展示页

`site/index.html` 是与 React 工作台分开的单文件页面，不需要后端或构建。直接用浏览器打开；工作台本身仍按 README 在本机启动。页面没有在线 Demo，也不会发起模型请求。真实编辑器截图位于 `site/assets/editor.png`；图型小图和助手流程是示意图，页面有明确标注。

浏览器验收：安装前端依赖后，在仓库根目录运行 `node scripts/test-site.cjs`。复用系统 Chrome，直接打开 file URL，检查 390/768/1280/1440px 下页面不横向溢出、图片与 token 正常、锚点有效，且外部请求仅为 Google Fonts。截图和证据输出到 `docs/screenshots/refactor-07-site-*.png` 和 `docs/test-evidence/refactor07-site.json`。离线时允许字体回退；不允许本地图片或其他请求失败。

事实来源：

- 11 类图：`frontend/src/editor/model.ts` 的 Config.type；支持的导入格式见 `docs/DATA-TO-FIGURE.md`。
- 3 个只读 / 10 个可预览工具：`docs/FIGURE-TOOLS.md` 与 Java 工具目录；接受提案只改草稿，不自动保存。
- PDF 嵌入内置 Noto Sans SC，SVG 保留文本；不是所有字体都支持 PDF。PNG 的 DPI 与矢量 PDF 的尺寸分别表述。
- 页面仅列本轮实际通过的 192 项前端单测及 12 项助手/连接/首页浏览器专项，未冒用此前 Java 或模型评测数字。
- 首次启动要求 Node 22.12+、Maven 3.6.3+、MySQL 8 二进制；脚本准备私有 JDK 21，命令与 README 相同。

## 发布前待所有者决定

所有者已指定仓库：[chen0206a/labflow-agent](https://github.com/chen0206a/labflow-agent)。展示页导航、首屏及启动区的 GitHub 入口已指向该地址；启动指南仍为页内文档。核对时 GitHub 仓库为空，因此没有添加尚不存在的远端 README 文档入口。当前本地 checkout 的 Git remote 未修改，代码未推送。根目录没有 LICENSE，许可证保留 `[许可证]`，等待所有者选定；部署成功之前不在 README 添加项目主页 URL。

已准备 `.github/workflows/pages.yml`：仅 main 上 site 文件或该 workflow 变化时触发，也可手动触发；上传静态 site，不打包或托管 React 工作台。所有者需要在仓库 Settings → Pages 将 Source 设置为 GitHub Actions。之后由所有者推送/触发并核实部署 URL；本轮没有推送、执行 Actions 或公开发布。

本地单用户模式不适合直接对公网开放后端。可选绘图助手经用户同意才向所配置模型发送图表配置和字段摘要，模型服务可能计费；页面不宣称接入模型时数据绝不离开本机。
