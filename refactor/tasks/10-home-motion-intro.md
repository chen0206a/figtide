# 任务 10：网站首页、工作区首页 v2、动效与绘图助手

**目标**：
1. 第一次打开 LabFlow 时，先看到一个有高级感的产品介绍页（网站首页），点「开始创作」后带转场进入工作区；
2. 工作区首页换成 v2：深色展台只占一部分，有入场动画，点「继续编辑」时图纸过渡进编辑器；
3. 编辑器里的绘图助手更显眼，并且能在画布上直接预览修改。

**视觉目标**：`refactor/design/09-10/png/ProductIntro.png`、`HomeMotion.png`、`AssistantFlow-idle.png`、`AssistantFlow-proposal.png`。动画的精确参数见 `static/*.html` 里的 `<style>`。

**范围**：前端。不新增依赖（不引入 framer-motion 之类的库，只用 CSS 和少量 hook）。助手的状态机、预算、幂等和恢复逻辑**不改**，10-4 只增加入口和展示。

建议按 10-0 → 10-5 的顺序做，每个小节单独提交。

---

## 10-0 动效规范（先做，后面都依赖它）

1. 在 `AGENTS.md` 的「视觉规则」后追加：
   > **动效规则**：只对 `transform`、`opacity`、`clip-path`、`stroke-dashoffset` 做动画，不对布局属性做动画。时长：微交互 150–250ms，元素入场 500–900ms；工作区页面的整段入场不超过 1.2s，产品介绍页可以更长。缓动统一使用 `--lf-ease-out`（`cubic-bezier(.22,1,.36,1)`）和 `--lf-ease-in-out`（`cubic-bezier(.65,0,.35,1)`）。`prefers-reduced-motion: reduce` 时关闭所有入场和循环动画，内容直接显示最终状态。动画不能阻塞操作，入场过程中按钮也必须可以点击。
2. 新建 `frontend/src/styles/motion.css`，内容包括：
   - 时长和缓动 token：`--lf-ease-out`、`--lf-ease-in-out`、`--lf-dur-fast: 180ms`、`--lf-dur-enter: 750ms`；
   - 关键帧 `lf-up`（下方 16px 处透明 → 原位不透明）、`lf-fade`、`lf-draw`（`stroke-dashoffset → 0`）、`lf-pop`（`scale(.4)` → 1，使用回弹缓动）；
   - 工具类：`.lf-enter` 搭配 `--d`（延迟）使用，只在父级带有 `.lf-motion-on` 时才生效。这样 JS 没准备好、或者在测试截图时，内容默认就是可见的。
3. 新建 `lib/useMotion.ts`：
   ```ts
   export function useReducedMotion(): boolean // 监听 matchMedia('(prefers-reduced-motion: reduce)')
   /** 每个会话、每个页面只完整播放一次入场；之后的访问使用 180ms 淡入 */
   export function useEntrance(key: string): "full" | "quick" | "none"
   ```
   `useEntrance` 读写 `sessionStorage` 中的 `labflow-entrance:{key}`，读写要包在 try/catch 里。开启「减少动态效果」时返回 `"none"`。
4. **E2E 稳定性**：在 `playwright.config.ts` 的 `use` 里加上 `reducedMotion: "reduce"`，让现有用例不受动画影响。动效相关的用例在 10-6 里单独用 `test.use({ reducedMotion: "no-preference" })`。

## 10-1 首次打开显示网站首页

**行为**：
- 浏览器里第一次访问 `/` 时，`localStorage` 中没有 `labflow-intro-seen`，此时显示产品介绍页。
- 点「开始创作」后写入 `labflow-intro-seen = "1"`，然后带转场进入工作区首页（地址仍然是 `/`）。
- 之后再访问 `/`，直接进入工作区首页。
- 产品介绍页同时挂在 `/welcome`，随时可以访问。工作区页脚加一个「关于 LabFlow」链接指向它，项目管理菜单里也可以放一个。
- 深链接（`/projects/...`）**永远不会被拦截**，只有根路径 `/` 才做这个判断。
- `localStorage` 不可用时（例如隐私模式报错），**不要**每次都显示介绍页，直接进入工作区。

**实现要点**：
1. `lib/routes.ts` 增加页面类型 `welcome`。`readWorkspaceRoute("/welcome")` 返回 `{ page: "welcome", valid: true }`。补上对应的路由单测。
2. `App.tsx`：当 `page === "home"` 且没有看过介绍页时，渲染 `<ProductIntro />`，不显示应用顶栏（介绍页有自己的导航）。介绍页需要懒加载：`lazy(() => import("./welcome/ProductIntro"))`，避免增加工作区的首屏体积。
3. **转场（「开始创作」）**：使用浏览器的 View Transitions API，从点击位置展开一个圆形遮罩：
   ```ts
   function enterWorkspace(e: React.MouseEvent) {
     markIntroSeen();
     const root = document.documentElement;
     root.style.setProperty("--lf-vt-x", `${e.clientX}px`);
     root.style.setProperty("--lf-vt-y", `${e.clientY}px`);
     root.dataset.vt = "reveal";
     navigate("/", { viewTransition: true, state: { fromIntro: true } });
     // 转场结束后清理：document.startViewTransition 返回的 finished；React Router 不直接暴露它，
     // 可以在工作区首页 mount 后的 setTimeout(… , 900) 中删除 root.dataset.vt
   }
   ```
   ```css
   :root[data-vt="reveal"]::view-transition-old(root) { animation: none; }
   :root[data-vt="reveal"]::view-transition-new(root) {
     animation: lf-reveal .8s var(--lf-ease-in-out) both;
   }
   @keyframes lf-reveal {
     from { clip-path: circle(0 at var(--lf-vt-x) var(--lf-vt-y)); }
     to   { clip-path: circle(150vmax at var(--lf-vt-x) var(--lf-vt-y)); }
   }
   ```
   浏览器不支持 View Transitions（`!document.startViewTransition`）或开启了「减少动态效果」时，直接导航，不做转场。由于「是否看过介绍页」保存在 state 和 localStorage 里，地址都是 `/`，切换时需要触发一次重新渲染：可以用一个 state 加上 `flushSync` 来切换，或者让「开始创作」直接导航到 `/?start=1` 再 replace 回 `/`，二选一，选更简单的方案。

## 10-2 网站首页（产品介绍）

参考 `png/ProductIntro.png`、`static/ProductIntro.html`。

1. 新建 `frontend/src/welcome/ProductIntro.tsx` 和 `welcome.css`，从静态稿移植结构和样式，颜色和尺寸都换成 token。导航中的 GitHub 链接使用 `https://github.com/chen0206a/labflow-agent`。
2. **首屏动画顺序**（数值照搬静态稿）：
   1. 标题两行从遮罩里升起；
   2. 「论文图」下方画出朱红色下划线；
   3. 说明文字和按钮淡入上浮；
   4. CSV 卡片倾斜着落位，一条高亮扫过每一行；
   5. 流动虚线连到图纸；
   6. 图纸升起，坐标轴出现，三条曲线依次画出，区间带淡入，终点标记弹出；
   7. 四个标签依次弹出，然后轻轻上下浮动。

   「开始创作」按钮上每 4.5 秒扫过一道光，悬停时箭头右移。
3. **诚实性**：首屏的图和 CSV 卡片是示意图，在图纸右下角加一个很小的「示意数据」标注（`--lf-text-3`，11px）。助手一节的循环演示也加上同样的标注。页面上出现的事实描述（13 个工具：3 个只读 + 10 个可预览修改、11 类图、PDF 嵌入字体）要和任务 07 已经核对过的内容一致。
4. **滚动浮现**：用 IntersectionObserver 实现，做成 `useReveal()` hook，元素进入视口后加上 `data-in` 属性。**不要用** CSS `animation-timeline: view()`：Firefox 不支持，而且在截图时会让视口外的内容一直隐藏。不支持 IntersectionObserver 或开启「减少动态效果」时，内容直接显示。「可复现」一节的四个步骤之间，连接线随进入视口画出来。
5. **助手一节的 7 秒循环演示**：直接移植静态稿里的 `lg1/lg2/lg3/thick/row*/applied` 关键帧。这一块离开视口时暂停：用 IntersectionObserver 切换 `animation-play-state`。
6. **六张图表展示**沿用静态稿里的 SVG。
7. 底部收尾的「开始创作」和首屏的按钮使用同一个转场。
8. **手机宽度（390px）**：隐藏首屏的 CSV 卡片、流动虚线和浮动标签，只保留图纸；标题缩小到 40px 左右；不能出现横向滚动条。

## 10-3 工作区首页 v2

参考 `png/HomeMotion.png`、`static/HomeMotion.html`。在任务 04 的首页基础上调整，组件边界尽量沿用（`HomePage`、`ContinueCard`、`HomeSide`、`HomeTables`）。

1. **布局**（从上到下）：
   1. 问候语行 + 「导入数据」「新建图表」按钮；
   2. **助手命令栏**；
   3. 一行，左边是深色展台（约占 2/3），右边是「最近图表」卡片和 2×2 的快速入口；
   4. 一行，左右分别是「最近实验」表和「研究项目」表（两张表都使用 09-2 的 `.lf-table`）；
   5. 页脚，带「关于 LabFlow」链接。
2. **助手命令栏**（替换原来的助手卡片）：一个输入框。上方的小字是「让绘图助手修改最近的图，先在编辑器中预览」。占位文字每 3.2 秒轮换一次，共三个示例，切换时带淡入上浮效果；输入框获得焦点后、或者开启「减少动态效果」时停止轮换。按回车，或点右侧按钮，会执行任务 04 已有的 `onAssistant(latestChartId, text)`。没有图表或没有配置模型时，输入框禁用，并在下方说明原因，同时提供「配置模型连接」按钮。只在首页挂载期间注册 ⌘K / Ctrl+K 用来聚焦这个输入框，离开首页时注销，避免和编辑器里的 Ctrl+K 冲突。
3. **深色展台**：
   - 左侧（约 250px）：`FIGURE 04 · LINE`、图表名、项目和数据版本；
   - **版本时间线**：数据来自 `GET /projects/{p}/charts/{id}/versions`（已有接口）的最近两条记录，加上本机草稿（如果存在），最多显示 3 行。草稿那一点用 `--lf-warning-dot` 色并轻微闪动；
   - 按钮：「继续编辑」（白色）和「导出 PDF」；
   - 右侧是一张白色图纸，宽度不超过 540px，用 `FigurePreview` 渲染真实图表；
   - 展台背景叠一层 32px 的淡网格。
4. **FigurePreview 新增 `fit` 模式**：首页使用 `mode="fit"`，按容器宽度直接渲染：Plotly 的 `layout.width` 设为容器宽度，`height` 按图表原比例换算，不再用 CSS 缩放，这样字号保持正常、文字清楚。样式库预览继续使用原来的 `exact` 模式。
5. **入场动画**（`useEntrance("home")` 返回 `full` 时）：问候语 0ms → 标题 70ms → 按钮 140ms → 命令栏 180ms → 展台放大落位 180ms → 展台内的文字 320–520ms → 右侧卡片 420–500ms → 下方两张表 580–640ms。**图纸上的曲线逐条画出**：`FigurePreview` 增加 `animateLines` 属性，Plotly 渲染完成后，找到 `.scatterlayer .js-line` 路径，用 `getTotalLength()` 设置 `stroke-dasharray` 和 `stroke-dashoffset`，再加上动画类。每条线依次延迟 120ms；动画结束后清除这些样式，保证之后导出不受影响（首页本来也不负责导出）。
6. **「继续编辑」转场**：展台里的图纸设置 `view-transition-name: lf-figure-paper`，编辑器画布上的纸面（`FigureCanvas` 中的 `.paper`）也设置同一个名字，然后用 `navigate(url, { viewTransition: true, state: { fromHome: true } })` 导航。浏览器会自动把图纸从首页的位置平滑过渡到编辑器画布的位置。为了避免转场时拍到的是骨架屏：
   - 鼠标悬停或聚焦「继续编辑」时，预加载编辑器代码（已有 `loadEditor()`）；
   - 点击后先 `await Promise.all([loadEditor(), queryClient.ensureQueryData(chart), queryClient.ensureQueryData(data)])`，再导航。这两个查询使用和 `ContinueCard` 相同的 key，通常已经在缓存里了。
   - 编辑器收到 `state.fromHome` 时，给工作台根节点加上 `ed-enter` 类：顶栏从上方、左右面板从两侧滑入，参数照搬静态稿的 `edTop/edLeft/edRight`。
   - 浏览器不支持时直接跳转。
7. **悬停效果**：卡片上移 2px，加阴影，边框加深；图纸上移 4px 并轻微旋转 −0.3°。

## 10-4 编辑器：绘图助手更显眼

参考 `png/AssistantFlow-idle.png`、`png/AssistantFlow-proposal.png`、`source/AssistantFlow.dc.html`。

1. **顶栏按钮**：「绘图助手」改成深色胶囊按钮，带星形图标（每 6 秒轻轻转一下，开启「减少动态效果」时不转）和快捷键提示。快捷键用 ⌘J / Ctrl+J：先在 Chrome 和 Edge 中确认 `preventDefault` 能拦截浏览器默认行为（Ctrl+J 默认打开下载页）；拦截不了就改用 Alt+A，并相应修改按钮上的提示文字。按钮保留 `aria-expanded`、`aria-controls`。
2. **画布底部的输入条**（助手面板关闭时显示）：
   - 上方三个建议按钮，使用现有的三条建议文字；
   - 输入框；
   - 同意勾选框，文字和现有的同意说明完全一致，**默认不勾选**；
   - 发送按钮，没勾选同意或输入为空时禁用。

   点发送后，打开助手面板，并把文字和同意状态传进去：`AgentAssistant` 新增 `initialConsent?: boolean` 和 `autoStart?: boolean`。在 mount 后的 effect 里，如果模型可用、`initialConsent` 为 true、`initialPrompt` 不为空，就**调用一次现有的 `start()`**，用 ref 保证只调用一次。不改 `start()` 本身。没有配置模型时，面板正常打开，并显示现有的「配置模型」提示。
3. **在画布上预览提案**（10-4 中最关键的一项）：
   - 有一份可信的待确认提案时（即面板里「应用这组调整」按钮可用的那个条件），在 `Workbench` 里维护一个 `previewConfig` 状态，**画布暂时用提案的配置渲染**。它不进入 history，不触发草稿写入，不影响 dirty 判断。助手面板关闭、提案被应用 / 拒绝 / 撤回、画布配置发生变化时，`previewConfig` 都要清空。
   - 画布顶部显示一个深色胶囊「预览中 · 尚未应用」，旁边是「查看原图 / 预览修改」切换按钮。切换时两个画面用 200ms 交叉淡入淡出，不需要做形变动画。
   - **编号标记**：按提案的 `changes`（JSON Pointer 路径）推断改动的位置：`/legend/*` → 图例的外框（从 Plotly DOM 的 `.legend` 取边界框）；`/series/{i}/*` → 对应序列的曲线（通过 customdata 匹配 trace，叠加一层半透明的加粗描边）；`/axes/x|y/*` → 对应坐标轴的刻度区域（`.xtick` / `.ytick` 的并集边界框）。编号和面板里提案列表的顺序一致。推断不出位置的改动不画标记。标记层设置 `pointer-events: none`，导出时绝不能包含它（它只存在于 DOM 覆盖层，不在 Plotly 图里）。
   - 应用后，显示现有的成功提示（「已应用 … 可撤销」）。可以改成画布顶部的绿色胶囊样式，带「撤销」按钮，撤销调用现有的 undo。
4. **面板样式**：标题带星形图标；预算行使用任务 06 已有的进度条；用户消息是深色气泡；提案卡片中每条改动前面加编号圆点；底部按钮依次为「应用这组调整」（主按钮）、「查看原图 / 预览修改」、「不采用这份提案」（文字链接）。面板打开时从右侧滑入（500ms），消息淡入上浮。等待模型时显示 3 条骨架闪烁条。

**单测**：
- 输入条：未勾选同意时不能发送；点击发送后只发起 1 次 POST；
- 预览：`previewConfig` 不进入 history、不写草稿；关闭面板后清空；
- 改动路径到标记类型的映射函数（纯函数，单独测试）。

**E2E**：更新 `e2e/agent.spec.ts`，使用本地协议夹具：通过输入条发送 → 出现预览 → 切换原图和预览 → 应用 → 撤销。全程不调用真实的收费模型。

## 10-5 公开展示页改用网站首页

把 `site/index.html` 换成 10-2 的静态版本：可以直接复用 `refactor/design/09-10/static/ProductIntro.html`，替换 token 和链接。因为 GitHub Pages 上没有后端，所有「开始创作」按钮都改为指向 GitHub 仓库 README 的安装说明（`https://github.com/chen0206a/labflow-agent#readme`），文字改成「本地运行」。滚动浮现用一小段原生 JS 实现 IntersectionObserver。更新 `scripts/test-site.cjs` 的断言：四种宽度下都没有溢出、没有 `href="#"`、只请求 Google Fonts。

## 10-6 验收

- `npm test`、`npm run build` 通过。确认工作区首页的入口 chunk 中**不包含**产品介绍页的代码（它是懒加载的）。
- E2E（全量默认使用 `reducedMotion: "reduce"`）新增：
  1. 清空 localStorage 后访问 `/`，显示介绍页；点「开始创作」后进入工作区；刷新后仍在工作区；访问 `/welcome` 能看到介绍页；
  2. 深链接 `/projects/:id/figures/:chart` 在没看过介绍页时也直接打开编辑器；
  3. 现有的所有 spec 在 fixture 里预先设置 `labflow-intro-seen`，用 `page.addInitScript`，写在统一的测试辅助文件里，不要每个文件各写一份；
  4. 单独的 `motion.spec.ts`（`reducedMotion: "no-preference"`）：首页入场结束后元素的 opacity 为 1；「继续编辑」能进入编辑器，并且没有控制台报错；开启「减少动态效果」时首页 300ms 内即可完整显示。
- 截图：网站首页（1440 和 390 两个宽度）、工作区首页、编辑器的助手预览状态，保存为 `docs/screenshots/refactor-10-*.png`，在汇报里和设计稿逐项对比。
- 性能：录一段 Chrome Performance，从首页加载到入场动画结束，期间没有超过 50ms 的长任务；如果有，在汇报里写明原因。
- 浏览器兼容：Chrome / Edge 有完整转场；Firefox 没有 View Transitions，退化为直接跳转、功能正常。如果本机有 Firefox，用它跑一遍首页和编辑器的冒烟测试。
