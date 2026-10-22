# 任务 07：公开展示页（设计 B）

**目标**：一个不依赖后端的静态页面，部署到 GitHub Pages，作为开源项目主页和简历链接。视觉目标见 `refactor/design/landing-B.png`。

## 步骤

1. 复制 `refactor/reference/site/` 整个目录到仓库根目录 `site/`（包含 `index.html`、`favicon.svg`）。页面是单文件，内联样式来自设计稿，没有构建步骤。
2. **替换占位符**（`grep -n "\[你的" site/index.html`）：
   - `[你的用户名]`：GitHub 用户名，共 8 处。
   - `[许可证]`：项目所有者选定许可证之后再填写。**在所有者决定之前不要擅自填写**，保留占位符，并在汇报的「需要人决定的事」里提出来。
3. **核对页面上的事实**，每一项都要和仓库现状一致，不一致就改页面，而不是改代码去迎合页面：
   - 「11 类科研图」「13 个受校验的工具：3 个只读、10 个可预览修改」「嵌入字体的矢量 PDF」「CSV / XLSX」等功能描述，对照 README 和 `docs/FIGURE-TOOLS.md`。
   - 底部四个数字（161 / 156 / 51 / 30）来自 `docs/TEST-RESULTS.md` 2026-10-22 那一轮的记录。重构完成后，换成**最后一次真实运行**的数字；如果某一项没有重新运行，就删掉这一项，不要保留旧数字。
   - 启动命令与 README「启动（本机 Windows）」一节保持一致。
4. 编辑器示意图是手绘的 HTML/SVG，不是截图，所以不受图表 bug 影响。如果想换成真实截图：等任务 01 合并后再截，图片放在 `site/assets/editor.png`，用 `<img>` 替换整个 mock 区块，并写好 `alt`。
5. 新增 `.github/workflows/pages.yml`：
   ```yaml
   name: Deploy site
   on:
     push:
       branches: [main]
       paths: ["site/**", ".github/workflows/pages.yml"]
     workflow_dispatch:
   permissions:
     contents: read
     pages: write
     id-token: write
   concurrency: { group: pages, cancel-in-progress: true }
   jobs:
     deploy:
       runs-on: ubuntu-latest
       environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
       steps:
         - uses: actions/checkout@v4
         - uses: actions/configure-pages@v5
         - uses: actions/upload-pages-artifact@v3
           with: { path: site }
         - id: deployment
           uses: actions/deploy-pages@v4
   ```
   需要在仓库 Settings → Pages 中把 Source 设为「GitHub Actions」，这一步要由所有者操作，写进汇报。
6. 在 README 顶部加一行项目主页链接（部署成功后再加）。

## 验收

- 本地直接用浏览器打开 `site/index.html`，在 390、768、1280、1440px 宽度下都没有横向滚动条（可以用 Playwright 截图检查 `scrollWidth === clientWidth`）。
- 所有 `href` 都指向真实地址，或者页内锚点（`#features`、`#charts`、`#assistant`、`#start`）。不能有 `href="#"`：`grep -n 'href="#"' site/index.html` 结果为空。
- 页面上没有指向不存在功能的按钮。例如目前没有在线 Demo，就**不能**出现「在线体验」。
- 页面只从 Google Fonts 加载字体，没有其他外部请求。

## 不要做

- 不要把 React 应用打包后放到 Pages 上冒充在线 Demo，没有后端它跑不起来。
