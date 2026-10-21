# 第一阶段验收记录

## 最新增量：持久审计与决策历史（2026-10-21，Step 2c）

Java **105/105**（0失败/0错误，新增10项审计/MySQL集成测试、4项脱敏单测）；Vitest **137/137、22个文件**；TypeScript + Vite生产构建通过。完整Chrome回归 **45/45，3.6分钟**；随后关联回归 **9/9，35.6秒**，以及独立测试Java进程强制结束→新JVM启动的真实重启验收通过。没有调用真实收费模型。既有编辑器约1.59MB分包提示保留。

Flyway V5新增 `agent_runs`：初始排队标记用于崩溃识别，终态保存模型/提示词/目录版本、源版本指纹、每次工具调用与返回摘要、用量、耗时和提案摘要。接受/拒绝单独使用事务与行锁，重复同一决策幂等；相反决策、伪造指纹、旧保存revision、跨项目访问均拒绝。接受记录不等于图表保存，没有新增chart_versions；浏览器在确认写入期间画布变化时也不会覆盖新草稿。

集成测试实证：数据库内无原始提示词、图表标题、模型回复或原始call_id；字段/标题等自由文本记录长度和指纹，API Key与常见凭据格式被脱敏。初始审计写失败时不调用模型，终态写失败时不返回可应用提案，恢复后重试同一行；竞争接受/拒绝只有一个结果，取消后迟到响应无法覆盖终态。失败和预算耗尽分别保留正确outcome及用量完整标记。

浏览器验收：生成提案 → 接受 → 一步撤销/重做 → MySQL保存刷新 → SVG向量文字；刷新后通过「运行历史」查看已接受记录和脱敏参数。另一条明确拒绝并提交含凭据的原因，刷新后保留可读原因、凭据不可见，已拒绝不能改成接受。所有原有导入、科研图、模板、导航草稿和交付回归通过。

真实进程重启验收：本机HTTP fixture创建一条完整已拒绝审计和一个慢速在途运行；强制终止专用8087 Java进程，新进程从同一MySQL读取，已完成审计逐字段一致，未完成项为 `interrupted/usage_complete:false` 且没有可应用proposal；随后清理专用测试项目。首轮重启脚本的原生fetch调用错误已修正，最终重启验收独立通过，未把失败试跑计为成功。

已目视检查 [审计历史](screenshots/agent-audit.png) 与 [新版提案面板](screenshots/agent-proposal.png)。真实工作区仍为 projects52/charts120/dataset_versions100/experiments5/agent_runs0；测试库清理后projects1/agent_runs0。普通本地工作区不写测试数据；测试使用独立 `labflow_e2e`。当前备份ZIP不携带审计、历史不能直接重新应用，以及接受后浏览器失败的语义均见 [AGENT-AUDIT.md](AGENT-AUDIT.md)。2d的30条双模式评测尚未开发。

## 最新增量：模型适配与 Java 绘图提案循环（2026-10-21，Step 2b）

最终 Java **91/91**（0失败/0错误，包含11项 Agent/MySQL 集成测试、6项本机 HTTP 适配器测试与测试库清理边界测试）；Vitest **131/131，21个文件**；TypeScript + Vite生产构建通过。完整 Chrome回归 **44/44，3.7分钟**，最终代码关联回归 **8/8，30.4秒**。保留既有500kB分包提示，未把它描述为已解决。

新增可选绘图助手：消息/工具定义输入的 provider 接口、Chat Completions HTTP 适配器、带 run_id/步数/token保守预算/总超时/取消/有界队列的 Java循环。模型操作走既有 preview + lint；非法混合批次整轮撤回、错误回灌，最终用户在共用的预览与diff面板确认。用户确认前不改画布和MySQL，确认后一步撤销，保存仍走原有API。图表原始版本、内容指纹、字段与保存revision按现有规则绑定；最后网络校验期间草稿变化也不能覆盖新编辑。

测试实际使用本机 `compatible-provider.cjs` 协议fixture，浏览器 → Java → 真实HTTP请求 → 工具与MySQL读取 → 预览 → 确认 → 撤销/重做 → 保存刷新 → SVG文字/向量检查全部跑通；不使用前端假API冒充后端。另验取消等待响应、超时、队列容量与取消释放、预算耗尽、截断响应、非法列/工具/config注入、跨项目读取与旧revision、超大响应/缺少usage/密钥不出现在配置响应及错误信息中。**未调用真实DeepSeek或其他收费模型，线上兼容性尚未验收**。

核查2a时修复清理边界（独立提交 `0646cd1`）：普通启动不再默认开启按ID水位删除；即使误开启，正式 `labflow` 库仍在任何SQL前被403拒绝。补充修复不存在路由/不支持方法被统一包装500的问题，实际返回404/405，并以关闭测试开关时的DELETE404固化边界。新测试脚本用独占 `labflow_e2e` 库、独立构建目录和8087/5178/18769端口，完整回归清理39个本轮项目，最终关联回归清理8个；库里保留1个测试基准项目。真实工作区仍为 **projects52 / charts120 / dataset_versions100 / experiments5**，与DS交接计数一致。

已目视检查 [助手提案截图](screenshots/agent-proposal.png)；1280×800下确认按钮仍在视口内。运行命令、模型环境变量、数据发送范围、API与尚未完成的2c/2d见 [AGENT-PROVIDER.md](AGENT-PROVIDER.md)。本轮运行摘要只存内存，完整持久审计、接受/拒绝记录以及30条双模式评测均未宣称完成。

## 最新增量：只读规范/校验与测试隔离（2026-10-21 晚，Step 2a）

以下为DS交接的历史记录；其中“普通启动默认开启清理、按水位即可安全清理”的策略已在上方2b核查中修正，不能作为当前运行指引。

Java **73/73**、Vitest **124/124（20 个文件）**、完整 Chrome E2E **42/42（3.2 分钟）**、`tsc -b --force` 通过；本次新增 3 项 Java，前端未新增单测（改动集中在测试基建）。仍未接模型、未使用付费 API。

新增两个只读能力：`GET /figure-tools/spec`（`get_figure_spec`，十一类图的必填/可选角色、所需专业配置块、固定 X 类型与硬规则，纯静态）与 `POST /projects/{p}/figure-tools/lint`（`lint_figure`，直接包现有 `validateAndReport`）。lint 把校验失败变成数据：配置不合法返回 `200 {ok:false, issues:[{code:"invalid_figure", message}]}`，消息与保存时报错一致；协议、信封、跨项目、旧 revision 仍按 400/404/409 拒绝；两种情况下都不写图表、版本或数据。目录里新增 `read_tools`，把 `get_figure_spec`、`lint_figure`、`get_dataset_profile` 标成 `category: "read"`，与十个可预览工具分开。

原子性这次被显式守住：一次 `operations` 在深拷贝上全部应用后只校验一次，任一失败返回 400、不返回半成品；已保存图表的失败批次不 bump `revision`、不新增 `chart_versions`。集成测试 `aMixedBatchIsAllOrNothingAndLeavesNoPartialPreview` 用「混合批次 400 → 单独提交其中合法项仍成功 → 图表 revision 与版本数不变」三段断言固化这条语义。

测试污染已根治：E2E 增加 `globalSetup`（读 `/api/projects` 记录当前最大项目 id 作为水位）与 `globalTeardown`（调 `DELETE /api/test/projects?after=<水位>` 删除本次新建项目）。该接口只在后端以 `--labflow.test-support=true` 启动时注册（`scripts/start.ps1` 已默认传入），并要求 `X-LabFlow-Test-Run: 1` 且 `after >= 1`；未启用时整个控制器不注册、路由 404，teardown 只打印提示不报错。本轮实跑清理了 **37 个**测试项目，运行前后 `projects 52 / charts 120 / dataset_versions 100 / experiments 5` 完全一致，6 个演示项目（id 5/95/108/134/167/194）保留。需要保留现场时用 `LABFLOW_E2E_KEEP=1`。

边界：`lint_figure` 一次只报第一条问题（`validateAndReport` 遇错即抛，未改造成收集式校验）；`get_figure_spec` 不返回默认值，默认值只在前端 `model.ts`，避免两套默认值漂移；新建向导仍未做。下一步（模型适配、审计、评测）见 [Agent 路线图](AGENT-ROADMAP.md)。

## 最新增量：结构工具与数据画像（2026-10-21 晚，Asia/Tokyo）

Java **70/70**、Vitest **124/124（20 个文件）**、完整 Chrome E2E **42/42（3.2 分钟）**、TypeScript（`tsc -b --force`）与 Vite 生产构建通过；保留既有大分包提示（编辑器分包 1.58 MB）。本次新增 3 项 Java、9 项前端与 3 条真实浏览器用例；仍未接模型、未使用付费 API。

工具面从 5 个外观工具扩到 10 个，目录用 `categories` + 每个工具的 `category` 分出「外观 / 结构」。新增 `set_chart`、`set_mapping`、`map_series`、`add_series`、`remove_series`：只改“图读哪几列、有几条序列”，不代造专业配置——切热力图缺 `heatY/heatZ`、切 ROC/PR 缺评估、切混淆矩阵缺分类配置都直接 400；`add_series` 的 `id` 由调用方给、服务端只查重，新序列深拷贝既有首条序列的外观再改 `id/y/name/error`，因此不会引入第二套配色；`remove_series` 拒绝删到 0 条，也拒绝删被分类评估引用的序列。新增只读 `GET /projects/{p}/data/{id}/profile`，直接返回导入时算好的字段画像与前 10 行，不重算、不重读原文件、不写库。

修复一处真问题：目录的 `minProperties` 原先对 `set_chart`/`add_series` 要求“必填之外再加一项”，界面因此连清单都加不进去（首轮 E2E 6 条挂 2 条即此因）。现改为“目标标识不算调整”的统一规则（`set_axis`/`set_series` 为 `required+1`，其余 `max(1, required.size())`），服务端守卫复用同一函数；列参数也分成 `COLUMN`（`minLength:1`）与 `OPTIONAL_COLUMN`（`group` 清空分组、`error` 取消误差列可传空串）。

真实浏览器覆盖：结构类新增序列 → 预览 → 应用 → 一步撤销（图例 3→2）、切换图表类型后保存重载仍生效、删除最后一条序列被拒且不产生预览、ROC 类型不出现在不可用选项里。既有 39 条全部继续通过（含导入修订、统计评估、样式库、导航草稿、PNG/PDF、备份恢复）。

测试期写入的 476 个带时间戳的 `…验收 <epoch>` 项目已按外键顺序清理（chart_versions → charts → experiment_datasets → dataset_versions → datasets → experiments → style_templates → projects），保留 6 个演示项目与 46 个早期「第一批验收/成果恢复验收」项目未动。另把 `playwright.config.ts` 的 dev server 改成 `webServer`（`reuseExistingServer: true`），避免服务器未启动时整批报 `ECONNREFUSED`。

边界：新建图表向导（类型卡 → 映射 → `operations: []` 校验）未做；结构类下拉复用编辑器已加载的字段，`/profile` 目前只服务后续模型适配。协议细节见 [工具协议](FIGURE-TOOLS.md)，接入顺序与未落地项见 [Step 1 清单](AGENT-STEP1-PLAN.md)。

## 最新增量：确定性绘图工具与批量快捷操作（2026-10-21，Asia/Tokyo）

Java **67/67**、Vitest **117/117（20 个文件）**、完整 Chrome E2E **39/39（3.5 分钟）**、TypeScript/Vite 生产构建通过。后端已重新打包启动，浏览器请求真实 Java/MySQL；保留已有大分包提示。新增 10 项 Java、7 项前端与 3 条真实浏览器用例；未接模型、未使用付费 API。

新增五种展示操作的 JSON Schema 目录与只读预览 API，拒绝未知参数、代码/任意路径、无效数值、错误范围、失效序列、跨项目数据和旧 revision。批处理在配置深拷贝上校验，保留未修改字段与未来扩展字段；前端再次校验源数据指纹及展示白名单之外的配置不变。论文模式使用 pt，专业图表按实际标题字段写入，固定坐标和无效属性组合同时在前后端限制。

真实浏览器：文字/标题、图例、坐标轴、序列颜色、画布宽度组成五项操作，校验预览时原画布与数据库版本不变，确认后一次应用、一步撤销/重做；保存刷新后配置与响应一致，CSV 原始字节一致，SVG 保留文字/颜色且无整图位图。另验错误批次不能应用、外部保存后旧版本拒绝、成品字号、ROC 实际横轴标题生效和固定范围控件不展示。全量既有导入、统计、样式库、导航草稿、PNG/PDF、备份恢复继续通过。

已目视检查 [批量操作面板](screenshots/quick-actions.png)，浏览器保留当前项目的快捷操作入口供手动检查。架构、字段、边界及运行命令见 [工具协议](FIGURE-TOOLS.md)。本轮是 Agent 的工具准备层，尚无模型适配、自动执行循环或持久化 Agent 审计。

## 最新增量：预设区分与预览诊断收敛（2026-10-21，Asia/Tokyo）

Vitest **110/110（19 个文件）**、样式库与成果交付 Chrome 定向回归 **7/7（38.3 秒）**、TypeScript/Vite 生产构建通过；保留原有大分包提示。本轮前端修改，没有重跑 Java 或完整 36 条浏览器测试，不将上轮的 57/57、35/35 写成此次结果。

内置示意固定三组序列，四套实际样式同时区分配色、线宽、点形/大小、虚实线、网格、图例和热力图色板，附简短特征标签。单条真实序列也能通过示意比较多序列外观，右侧仍使用当前真实数据。

将直接拼接全部 warnings 的文字墙改为默认折叠诊断；详细信息独立滚动，每次追加 30 条。新增合成 CSV 的真实 Java/MySQL 浏览器流程：60 个 X 类别 × 3 条小提琴序列产生 180 条样本不足提示，验证默认不生成列表、可展开 30/60 条、诊断高度上限、预览高度及 1280/1560 窗口中滚动内容与固定应用区域无重叠。关闭后原配置和 revision 均未变化。没有修改分布估计算法或补造密度。

继续验证四种基础图预览、SVG、撤销/重做、保存重开、模板管理、显式映射、PDF/PNG、项目备份恢复。截图目视检查 [区分后的样式](screenshots/styles-builtin.png) 和 [180 条诊断摘要](screenshots/styles-warning-summary.png)，详情见 [样式库记录](STYLE-LIBRARY.md)。

## 最新增量：样式预览与个人模板管理（2026-10-21，Asia/Tokyo）

Java **57/57**（含独立 MySQL 集成和新 PATCH 接口验证）、Vitest **106/106（18 个文件）**、完整 Chrome E2E **35/35（2.4 分钟）**通过，TypeScript/Vite 生产构建通过；保留既有大分包提示。没有使用外部 AI 或付费 API。

新增四种内置样式的图形示意和当前真实数据预览，预览不修改编辑器，应用才进入撤销栈。个人模板默认当前项目，可搜索、切换全部项目、分批展示、保存、预览、重命名、确认删除。新接口校验名称、404、同名重试及 profile/项目归属不变。未来浏览器测试仅清理本轮创建项目中的模板，历史数据未批量删除。

真实浏览器覆盖折线、分组柱、散点、矢量热力图；验证关闭预览保留原图、应用/撤销/重做、MySQL 保存重开、SVG 文字/矢量与颜色、跨项目套用、删除取消与确认、键盘页签、1280/1920 适配和搜索框图标间距。原有 CSV/XLSX、统计与评估、SVG/PNG/PDF、备份恢复全部继续回归。

开发检查发现数据列表不含行数据、预览面板被 flex 压缩裁切及搜索输入样式优先级问题，修复并补充真实数据与几何检查后完成上述全量通过。中途一次定向运行发生 Windows worker 退出（3221226505）；最终完整运行无失败，没有跳过用例。Java 测试在 `labflow_test` 执行，本地运行服务已重新构建启动。

详情见 [样式库记录](STYLE-LIBRARY.md)，截图：[内置样式](screenshots/styles-builtin.png)、[个人模板](screenshots/styles-personal.png)、[热力图预览](screenshots/styles-heatmap.png)。

## 最新增量：模块续接与无打断导航（2026-10-21，Asia/Tokyo）

Vitest **101/101（17 个测试文件）**、完整 Chrome E2E **32/32**、TypeScript/Vite 生产构建通过。最终完整浏览器运行全部通过，`test-results/.last-run.json` 状态为 `passed`，无失败用例。保留已有大分包提示；Java/SQL 源码未修改，本轮未重跑 Java 单测，浏览器流程使用真实 Java/MySQL。

验证普通模块切换不弹保存确认、最后输入同步保留、同版本草稿自动恢复、新数据集草稿隔离、模块/项目/属性页签/实验筛选续接。通过注入本机存储失败检验取消离开与重试；通过真实 API 更新图表检验旧草稿冲突选择。保存仍显式创建数据库版本，浏览器验证普通导航不会偷偷增加 revision。保存期间锁定编辑区，保存返回后保持所选属性页签。

原有 CSV/XLSX、科研计算、评估、SVG/PNG/PDF、备份恢复流程均纳入此次完整回归。新增导航错误监听，快速切换无未处理页面异常。截图目视检查 [编辑器](screenshots/seamless-editor.png) 与 [数据工作区](screenshots/seamless-data.png)；设计与边界见 [模块续接记录](WORKSPACE-CONTINUITY.md)。没有进行独立帧率基准测量。

## 最新增量：首页入口与研究工作区（2026-10-21，Asia/Tokyo）

Vitest **92/92**、首页/工作区/图廊/导航 Chrome 回归 **7/7（25.9 秒）**、TypeScript/Vite 生产构建通过（保留已有大分包提示）。新增 2 项组件交互测试与 1 条真实 API 浏览器流程。

入口改为一个绘图主入口和三个紧凑快捷入口；项目区首屏 4 个、按需展开，移除嵌套滚动；最近图表改为真实元信息文档卡片。验证搜索、切换项目、显示更多、无项目创建引导、导入忙碌状态、键盘与减少动画，覆盖 390–2560 px 首页适配。截图检查中发现搜索图标与文字重叠，修正样式优先级后加入几何检查并重跑通过。

接口和图表配置未改动。Java 测试与全量科研绘图 E2E 本轮未重跑。详见 [工作区记录](HOME-WORKSPACE.md) 和 [实际截图](screenshots/home-workspace-refined.png)。

## 最新增量：居中首页与科研图廊视觉（2026-10-20，Asia/Tokyo）

本轮 Vitest **90/90**、首页/导航/图廊 Chrome 回归 **6/6（28.4 秒）**、TypeScript/Vite 生产构建通过；最后调整图版网格并补充组合截图后，图廊用例再次 **1/1（3.9 秒）** 通过。保留既有大分包提示。没有修改 Java、SQL 或图表计算，本轮没有重跑 Java 测试和 29 条全量 E2E。

验证 10 张参考图本地加载、无外部运行时请求、无播放控件、悬停与聚焦时仍持续滚动、减少动画偏好、390/900/1280/1920/2560 宽度无横向溢出、宽屏页头居中、功能卡片的黑白背景/标题颜色，以及真实模块跳转、前进/后退、取消离开与草稿恢复。首次窄屏检查发现光晕横向超界，修复后通过。

图廊采用蓝/青/暖橙配色和一张深色图版，替换原先杂乱的紫绿热力图等参考图片；功能入口保持黑白。重新渲染的每张参考图保留上游示例数据/计算方式、固定随机种子与改编说明，10/10 输出 SHA-256 核对通过。没有生成 AI 曲线，没有修改真实实验数据，也不将参考图版宣称为 LabFlow 导出截图。

已目视检查 [图廊与入口](screenshots/home-gallery-actions.png)、[完整首页上半部](screenshots/home-centered.png)、[2560 px 宽屏](screenshots/home-wide.png)。运行和素材重建命令见 [首页与路由记录](HOME-AND-ROUTING.md)。

## 最新增量：首页图廊与独立工作台（2026-10-20，Asia/Tokyo）

Vitest **90/90**、完整 Chrome E2E **29/29（2.1 分钟）**、TypeScript/Vite 生产构建通过，保留大分包提示。新增 13 项路由解析/恢复测试、3 项图廊交互测试、3 条浏览器流程。原有用例改用真实导航链接，并验证刷新直接恢复当前图表；首页入场测试只等待有限动画，避免被循环图廊阻塞。

覆盖 hover 指示器移动、键盘导航、独立 URL、前进/后退、取消离开、确认后草稿恢复、深链接错误态、画廊播放/暂停、减少动画、900/1280/1920 首页适配及图片本地加载。素材 SHA-256 逐一核对，保留 Matplotlib 许可；图片仅作图库参考，不冒充 LabFlow 导出。详情与截图见 [首页与路由记录](HOME-AND-ROUTING.md)。

开发中修复了取消离开后确认框可能再次触发的问题；中途本地前端服务退出导致的连接失败已在恢复后完整重跑，最终 29 项无失败。Java 无修改，本轮未重跑 Java 单测。

## 最新增量：绘图编辑器信息层级（2026-10-20，Asia/Tokyo）

Vitest 74/74、TypeScript/Vite 生产构建通过（保留既有包体积警告）；Chrome E2E 共 26 项均验证通过：最后完整运行 23 通过、3 失败，3 项失败来自测试在编辑器懒加载完成前判断图表选项的可见性，随后错误地收起了新图表默认展开的选择器。补上明确的面板加载等待后，`playwright test --last-failed` 3/3 通过（8.8 秒）。未删除或跳过测试，未将重跑写成一次无失败的完整运行。开发过程中也修复了属性导航保留旧固定高度导致第二行被遮挡的问题。

新增分区互斥、键盘折叠、无脏配置、三种桌面宽度的 E2E；原有真实数据导入、保存/恢复、11 类图、模板、备份和 SVG/PNG/PDF 流程继续验证。设计与截图见 [布局记录](EDITOR-LAYOUT.md)。仅修改前端，没有重跑 Java 测试。

## 最新增量：第九批前端体验（2026-10-20，Asia/Tokyo）

Vitest **74/74**、TypeScript/Vite 生产构建通过；Chrome E2E **25 项用例均验证通过**。最后完整执行为 23 通过、2 失败：一项 Windows worker 以 3221226505 退出，另一项 PDF 模块请求在网络 trace 中明确报告 `net::ERR_NO_BUFFER_SPACE`。停止并行构建负载后，用 `playwright test --last-failed` 定向重跑，两项均通过（22.6 秒）；没有删除或跳过失败用例。此前同一批功能曾完整 25/25 通过。没有将资源错误记成一次无失败的完整运行。

新增 10 项单元/组件测试覆盖草稿写入合并、刷新冲刷、正式保存取消草稿、存储失败重试、布局属性删除、首页搜索和分批显示；新增 2 条 E2E 覆盖 1280/1920 窗口、2400 px 大画布、手动缩放、对数轴/自动范围恢复、最后配置 SVG、真实 MySQL 重开与刷新恢复草稿。现有导入、11 类图、统计、实验关联、撤销/历史、模板、备份及 SVG/PNG/PDF 流程均继续检验。

已目视检查首页、数据页、复用弹窗和 1280/1440/1920 编辑器截图。三轮生产测量与构建大小、条件和原始数据见 [机器可读记录](test-evidence/frontend-experience.json)，修改和运行命令见 [第九批记录](BATCH-9.md)。较大数据的重新计算仍在主线程，保留 Vite 包体积警告；未修改 Java 或重跑 Java 测试，上一批 56/56 仅作为历史记录。未推送远端。

## 第八批成果复用与交付（2026-10-19，Asia/Tokyo）

Java **56/56**、Vitest **64/64**、完整 Chrome E2E **23/23（1.7 分钟）** 与 TypeScript/Vite 生产构建通过。新增 5 项真实 MySQL 集成、5 项前端函数/交互及 3 条 Chrome 流程；最后补强模板白名单后重跑 Java 与新增浏览器验收。npm audit 0 项漏洞。远端 CI 未执行。

验证模板白名单、统计/绑定不变与撤销、显式字段映射及数值类型、原图不覆盖、PDF/SVG/PNG 下载、完整项目备份预览不写库、恢复新项目的图表与原始文件一致、ID 与来源引用重建、参数数字不误改、历史/时间保留、归档项目及空项目、损坏校验/路径/引用/不完整历史拒绝、语义校验失败全部回滚。恢复后可继续保存新图版本，原项目 revision 不变。

PDF 实测 89 × 58.553 mm、单页、中文/α 字形可提取、嵌入字体、26 个矢量对象和 0 个栅格 image，标题中心偏差约 0.001 pt。另验粗体热力图、转换器多行 tspan/±；编辑器仍按纯文本处理。检查实际页面渲染并修复文字定位偏移。SVG 与 PNG 保持原流程，不生成统计值。实际证据与操作命令见 [第八批记录](BATCH-8.md)。

独立创建“成果复用与交付 · 合成演示”（两份数据、两条实验、两张图/三快照、一个样式），供手动检查。运行仍仅用本地 Java/MySQL/浏览器，不用收费 API。PDF 字体限定内置 Noto Sans SC 常规/粗体；其他字体继续用 SVG/PNG。Plotly 约 4.96 MB 的按需包体积提示保留，性能/页面美化未作专项改造。

## 最新增量：第七批混淆矩阵与共同样本（2026-10-19，Asia/Tokyo）

Java **51/51**、Vitest **59/59**、完整 Chrome E2E **20/20（约 2.3 分钟）** 通过，TypeScript / Vite 生产构建通过。Java 新增 6 项纯计算与 2 项真实 MySQL 集成测试；前端新增 10 项计算/交互测试，浏览器新增两条完整流程。

手算三类矩阵 `[[1,1,0],[0,1,1],[0,0,2]]` 核对逐类 precision/recall/F1、support、macro/micro/weighted 与 accuracy；验证按行、按列、全部归一化仍保留相同计数和指标。零分母保持 null；未知类别、重复/缺失样本 ID、错误字段与跨项目请求被拒绝，不自动去重或补零。

真实 Chrome：逐样本标签 → 两模型映射 → 明确类别顺序 → 计数 → 归一化与共同样本 → MySQL v1/v2 → 刷新重开 → SVG/PNG/Java JSON。下载的 Java reports 与前端纯函数逐项深比较，包括原始计数、显示矩阵、每类与平均指标、排除诊断及源行号。额外测试共同样本 ROC 在按模型分面后仍保持交集，非唯一 ID 无法覆盖已保存版本。原始 CSV 下载字节不变。

SVG 保留文本、色块矢量路径与百分比，不含 image；PNG 实测宽 1520 px。矩阵标注所选模型/组与有效 n。已目视检查 [三分类工作台](screenshots/multiclass-matrix.png)、[演示工作台](screenshots/classification-demo.png)；实际 [SVG](exports/multiclass-matrix.svg)、[PNG](exports/multiclass-matrix.png)、[Java JSON](exports/multiclass-report.json)。

独立创建“分类评估与共同样本 · 合成演示”，两份合成数据、三张保存图。三类预测共 12 行，共同样本为两模型相同的 8 行，来源始终为合成演示；没有修改用户现有项目。

边界：共同样本只按同一不可变数据版本对齐，不跨文件 join；最多 20 类、100 个模型分组。分类指标为完整单标签分类，不提供多标签、多分类 ROC/AP、显著性或置信区间。矩阵单图选择模型/组，暂不支持矩阵分面。包体积提示仍存在（Plotly 按需包约 4.95 MB），性能/品牌/首页动效未作专项调整。详见 [第七批记录](BATCH-7.md)。

## 第六批数据处理与重复实验汇总（2026-10-19，Asia/Tokyo）

Java **43/43**、Vitest **49/49**、完整 Chrome E2E **18/18（约 1.5 分钟）** 通过；最后补充分组条件保护与多个指标映射后，49 项前端测试与本批 3 条 E2E 再次通过。TypeScript / Vite 构建通过，Plotly 包体积提示仍存在。本批以功能为主，没有修改首页、入场动效或品牌视觉。

新增 7 项纯计算测试覆盖手算均值/SD/SEM、缺失与 n<2、常量、缺失分组、数值排序稳定性、重复标识、非法字段、列名冲突、极大偏置、极小数及结果溢出。新增 3 项真实 MySQL 集成测试覆盖预览不写库、预览/保存行与字段精确一致、来源规则/指纹、图表配置恢复、CSV 指纹、跨项目拒绝、无效请求不写入，以及派生版本继续排序。

首次 MySQL 集成测试发现 JSON 数值转换使派生下界末位变化；修复为带版本标记的精确数值文本内部编码，读取恢复 number 后重跑通过，未修改旧原始版本。浏览器数值精度验收先与手算值作精度比较，再用服务器预览结果精确核对保存、绘图与重新打开，避免 JS 中间浮点舍入差异干扰一致性验证。

三条真实浏览器流程：逐次观测 → model+epoch 分组 → SEM → 预览 → 独立数据集 → 自动均值/误差列映射 → MySQL 图表保存 → 刷新重开 → SVG/PNG；重复标识错误 → 修正分组 → 改规则使旧预览失效 → 区间图；源过滤 → 数值稳定排序 → 另存 → 原 CSV 字节不变。SVG 含误差棒路径、文字且无 image；PNG 为 1520×1000 px。

截图已目视检查：[处理预览](screenshots/processing-preview.png)、[均值误差图](screenshots/processing-sem.png)、[区间图](screenshots/processing-band.png)、[合理数值演示](screenshots/processing-demo.png)、[来源追溯](screenshots/processing-source.png)。[实际 SVG](exports/processing-sem.svg)、[实际 PNG](exports/processing-sem.png)。已创建独立合成演示项目，17 行逐次观测、2 份派生结果和 2 张图；保留现有用户项目。

边界：最多 4 个分组、5 个指标、8 条源过滤、4 个排序字段，结果上限沿用 20,000 行/200,000 单元格/10 MB。重复标识校验可选，独立观测解释仍由用户确认；不生成置信区间或显著性。长宽表转换、派生规则可视化历史编辑、项目备份、PDF、性能及外观专项不在本批范围。详见 [第六批记录](BATCH-6.md)。

## 第五批模型评估与实际区间（2026-10-19，Asia/Tokyo）

Java **33/33**（含真实 MySQL 集成）、Vitest **43/43**、完整 Chrome E2E **15/15（约 1.3 分钟）** 通过，TypeScript / Vite 构建通过。最后补充单类别分面的指标保留与 seriesId 追溯后，43 项前端测试与 2 条新增 E2E 再次通过。

手算标签 [0,0,1,1]、分数 [0.1,0.4,0.35,0.8] 验证 AUC=0.75、AP=5/6；并列常量分数 AUC=0.5、AP=正类比例。覆盖中文正类、缺失、单一类别、过滤和分面、阈值指标、上下界缺失断点/对数/反向边界/行顺序。后端覆盖新字段、算法版本、归属和反向区间拒绝，以及三类图表完整配置 MySQL 保存/重新打开。

真实 Chrome 流程核对 ROC 点位、PR 阶梯、评估 JSON、配置 v1→v2 与阈值恢复；上下界缺失生成两个独立填充多边形，刷新重开后保持一致。实际 SVG 含文本/路径且无 image，区间 PNG 实测 1520×1000 px。反向区间保存返回错误，原版本保留；分类原始 CSV 下载字节不变。新增功能未引入收费服务或新依赖。

已目视检查 [双模型 ROC 工作台](screenshots/evaluation-demo.png)、[PR 工作台](screenshots/binary-pr.png)、[实际区间工作台](screenshots/actual-bands.png)。独立创建“模型评估与区间 · 合成演示”项目（22 行分类、8 行区间，3 张保存图），测试项目与演示均明确标记合成，保留用户已有项目。截图和文件均来自实际运行，不是界面 Mock。

边界：只支持二分类；多模型独立取有效行，不自动做样本配对，不计算置信区间、显著性或多分类平均。PDF 与多数据源混合子图尚未实现。Plotly 按需包仍约 4.93 MB，构建给出体积提示。完整协议与使用见 [第五批记录](BATCH-5.md)。

## 第四批论文尺寸与经验分布（2026-10-19，Asia/Tokyo）

Java **31/31**（真实 MySQL）、Vitest **33/33**、Chrome E2E **13/13（约 1.4 分钟）** 通过，TypeScript 与 Vite 构建通过。新增数值边界测试覆盖等宽分箱、端点、范围排除、概率/密度、ECDF 重复值、mm/pt 换算、SVG 物理尺寸、PNG pHYs 和热力图发散中心。

真实浏览器保存并重新打开 histogram/ecdf 配置，核对基础字号换算；导出 SVG 为 89 mm 宽且保留文本/路径，PNG 为 1051×691 px 并写入与有效 DPI 一致的密度元数据。热力图数值标注、色块与色标一致，无效色阶保存被拒绝，旧版本保留。原始 CSV 字节不变。

已检查本批截图和实际 PNG。GitHub Actions 已新增前端测试/构建和 Java/MySQL 验证配置，尚未推送或远端执行。Plotly 包体积警告、SVG 字体依赖、根项目许可证未选定仍为已知边界。详见 [第四批记录](BATCH-4.md)。

## 第三批分布图与多子图（2026-10-19，Asia/Tokyo）

Java **28/28**、Vitest **23/23**、Chrome E2E **11/11（约 1.2 分钟）** 通过。后续针对共享/独立坐标切换、类别轴禁用数值控件增加断言，新增专业绘图 3 条 E2E 再次通过；八行布局自动适配的尺寸边界另由组件测试验证。TypeScript / Vite 生产构建通过；Plotly 按需包体积警告仍存在。

实际验证箱线图与小提琴 SVG 路径、已知样本三种四分位算法、真实样本数、缺失/常量处理、带宽拒绝、子图布局、标题、轴范围匹配、MySQL 保存/重开、原数据字节不变，以及两子图 SVG/PNG 下载。SVG 保留文本且无 image 嵌入；PNG 尺寸与配置及倍率一致。截图、导出文件与边界见 [第三批记录](BATCH-3.md)。

测试发现的 Java 用例编译及整数节点比较问题已修正后重跑通过；没有跳过失败检查。验收项目为明确命名的合成数据，保留本地，未清理用户已有项目。以下为此前历史记录。

## 第二批实验关联与对比（2026-10-18 晚）

Java 24/24（真实 MySQL 集成测试）、Vitest 14/14、Chrome E2E 8/8 通过；TypeScript / Vite 构建通过。更新事务隔离及异步衔接后又单独复验新增 E2E 通过。测试涵盖实验表单、复制配置、筛选、数据版本关联、参数差异、缺失值、对比图保存与重新打开、原实验修改后来源快照保持不变。既有 E2E 同时验证 SVG/PNG 导出。

本次发现并修复实验备注与状态控件的可访问标签定位问题。Java 打包曾因运行中 JAR 被 Windows 锁定失败，停止本项目后端后重新打包并启动成功；没有跳过测试。Plotly 构建体积警告仍存在。详情与截图见 [第二批记录](BATCH-2.md)。下文为此前验收历史，不代表当前数据库记录数量。

执行日期：2026-10-18（Asia/Shanghai）。全部在独立 `LabFlow` 目录完成，没有修改其他现有工程。未推送远端。

## 环境

- Windows；Node 24.15.0；Microsoft OpenJDK 21.0.12.1。
- Spring Boot 3.5.7；MySQL Community 8.0.42（原生独立实例，loopback:33316）。
- Vite 7.3.7；React 19；Plotly.js；Vitest 5.0.5；Playwright Chromium。
- 使用真实 Java API 与 MySQL。未使用 H2、浏览器本地 Mock 或付费 API。

## 自动化结果

| 项目 | 实际结果 | 覆盖 |
|---|---|---|
| Java 单元与集成测试 | **16 / 16 通过** | 导入 10、配置合约 4、真实 MySQL 集成 2 |
| 前端组件/纯函数测试 | **8 / 8 通过** | 表格分页、缺失值、撤销重做、过滤不修改数据、样式保留、对数告警、热力图重复值和矢量矩形 |
| Chromium E2E | **3 / 3 通过** | 完整主流程、配置交互与历史、实验记录与坏 CSV |
| TypeScript + Vite 生产构建 | **通过** | 首页包约 399 kB；绘图按需包约 4.88 MB（未压缩） |
| npm audit | **0 漏洞** | 当前 lockfile，包含开发依赖 |
| 本地启动 | **通过** | 私有数据库初始化、Flyway、Java 服务、Vite 代理 |

Java 测试摘要保存在 `test-evidence/`。完整 XML 日志重新运行后位于 `backend/target/surefire-reports/`；Playwright HTML 报告位于 `frontend/playwright-report/`，运行产物目录不提交。

### 浏览器验证的具体路径

1. 从 UI 新建项目 → 上传真实 CSV → 检查数据预览 → 打开编辑器 → 添加序列、改颜色/字体/轴范围 → 保存 MySQL → 刷新并重开 → 配置对比一致 → 切换散点及撤销 → 实际下载 SVG / PNG。
2. 两份数据间切换保留样式 → 撤销恢复另一份真实数据 → 绑定误差列 → 柱状图 → 注释 → 保存多个版本 → 历史恢复并生成新版本 → 热力图 → 实际导出矢量 SVG。
3. 创建与编辑实验参数/指标/备注 → 上传重复表头 CSV → 显示真实后端校验错误。

SVG 检查：有文本标签，无嵌入 `<image>`；热力图色块为矢量路径。PNG 为 1520 × 1000（760 × 500 的 2 倍）；与 SVG 共用配置。标题与顶部图例增加浏览器 bounding-box 防碰撞断言。

## 视觉检查

实际浏览器截图：

- [项目首页](screenshots/home.png)
- [实验记录](screenshots/experiments.png)
- [数据管理](screenshots/data.png)
- [绘图编辑器 · 1560px](screenshots/editor.png)
- [绘图编辑器 · 1280px](screenshots/editor-1280.png)
- [热力图](screenshots/heatmap.png)

已打开并人工视觉检查首页、编辑器、1280px 布局、热力图和 PNG 导出。修复了标题/图例重叠、顶部状态文字换行；热力图采用矢量矩形，避免栅格嵌入。

测试过程中还修复了数据集切换/撤销与草稿状态的同步、实验编辑后 label 选择不稳定、Windows 运行中的 JAR 重打包锁冲突。最终上述回归均通过，不将首次失败当作成功。

## 交付与已知边界

- 本地数据库保留 1 个合成演示项目、3 个实验、2 份数据与 2 张图表；本轮生成的 E2E 测试项目已定向清理，集成测试数据保留在独立 `labflow_test`。
- 图表主包较大，已按需加载，构建仍有 chunk-size 提示；不是构建失败。后续可定制 Plotly bundle。
- 检查了 Chromium 桌面 1560px / 1280px，未声称测试 Firefox、Safari、移动端、百万行数据或并发团队部署。
- 图表任意极端尺寸/字号/超长文本组合未穷举；导出前应使用预览。热力图上限 10000 格；不计算显著性。
- 本地无认证模式不适合公网，具体边界见 README。Docker 备选配置未实际启动测试。
- PDF、多子图、箱线图、小提琴图、论文写作辅助和团队协作留待第二阶段。

导出示例均为合成数据： [SVG](exports/learning-dynamics.svg)、[PNG](exports/learning-dynamics.png)、[热力图 SVG](exports/heatmap.svg)。

## 第二阶段：视觉重构验收（杂志版，2026-10-18）

背景：第二次视觉重构由另一模型执行，因上游 API 余额不足（`402`）与上下文压缩中断，只写入半套设计令牌、未覆盖既有布局类，页面破版；随后一版「深色玻璃 + 极光渐变」方案经评审否决。最终采用编辑 / 杂志风格：暖纸底色、衬线标题、1px 发丝线、单一陶土强调色，并加入按期刊规范渲染的示例图版。

### 变更范围

| 文件 | 变更 |
|---|---|
| `frontend/src/styles.css` | 全量重写：暖纸 `#f7f4ee` + 卡片 `#fffdf9` + 陶土 `#b65c3a`；报头 / 目录导航替代左侧导轨；双列 PLATES 图版区、双列能力条目；编辑器改为纸色外壳 + 白纸画布 |
| `frontend/src/components/Plates.tsx` | **新增**：6 幅手绘 SVG 图版，按 Nature / Science / Cell / NeurIPS / eLife 规范渲染（89 mm 单栏、5–7 pt、a–d 面板字母、Okabe–Ito 配色、误差棒、箱线 + 抖动散点） |
| `frontend/src/App.tsx` | 报头 + 目录导航；Hero（衬线大标 + 陶土斜体行 + Contents 目录 + 规格行）；图版区与能力条目替换原能力卡片 |
| `frontend/src/main.tsx` | 引入 Inter / Newsreader / JetBrains Mono 三款可变字体 |
| `frontend/package.json` | 新增 `@fontsource-variable/newsreader` |
| `frontend/index.html` | `theme-color` 改为 `#f7f4ee` |
| `frontend/playwright.config.ts` | 默认使用系统 Chrome（`PLAYWRIGHT_CHANNEL` 可覆盖） |
| `frontend/e2e/capture.mjs` | 截图前等待入场动画结束（900ms） |

### 自动化结果

| 项目 | 实际结果 |
|---|---|
| TypeScript 项目构建 | **0 错误**（`tsc -b --force`） |
| Vite 生产构建 | **通过**；CSS 51.0 kB、主包约 393 kB、绘图按需包 4.66 MB |
| Vitest 单元/组件测试 | **8 / 8 通过** |
| Playwright Chromium/Chrome E2E | **3 / 3 通过（11.7s）**：完整主流程 + 配置/历史 + 实验记录与坏 CSV |
| 浏览器控制台 | 无 error |

### 视觉检查

1560×1000 与 1280×800 真实浏览器截图为本轮重新生成（2026-10-18 15:00），数据来自真实 MySQL 演示项目：

- [项目首页](screenshots/home.png) · Hero、Contents、统计条、六幅图版、能力条目
- [实验记录](screenshots/experiments.png)
- [数据管理](screenshots/data.png)
- [绘图编辑器 · 1560px](screenshots/editor.png)
- [绘图编辑器 · 1280px](screenshots/editor-1280.png)
- [热力图](screenshots/heatmap.png)

另人工核对了新建项目、实验记录、导出、版本历史四个弹窗与编辑器底部数据面板，均无溢出或截断；1280px 下 Hero、图版与编辑器三栏布局均正常。

图版规格依据：[Nature · Building and exporting figure panels](https://research-figure-guide.nature.com/figures/building-and-exporting-figure-panels/)（89 / 183 mm、5–7 pt、Arial、Okabe–Ito 配色）、Science / AAAS 图件要求、NeurIPS 与 eLife 常见图式。图版数值取自 `samples/` 合成数据，由 LabFlow 自行渲染，未嵌入任何受版权保护的论文图形。

### 数据清理

E2E 生成的 3 个测试项目（`配置交互验收`、`实验记录验收`、`视觉模型研究 · E2E`）已按外键顺序删除，演示库恢复为 **1 个项目 / 2 张图表 / 2 份数据 / 3 条实验 / 2+2 个版本**。

### 已知边界

- E2E 依赖本机 Chrome；未下载 Playwright 自带 Chromium（CDN 下载在本机超时），`PLAYWRIGHT_CHANNEL` 可切换。
- 图版为规范复刻的示例，不代表期刊对投稿的实际裁切与色值要求；如需真实论文图，应替换为 CC-BY 图件并保留署名。
- 仍未覆盖 Firefox、Safari、移动端与百万行数据；绘图引擎按需加载的体积提示仍在。
- 视觉层面覆盖 1280–1560px 桌面视口；<1120px 时布局横向滚动。
