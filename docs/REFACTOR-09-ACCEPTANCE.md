# 任务 09 验收记录

日期：2026-10-23。分支：`refactor/frontend`，基线：`62d089e`。范围为09-1至09-5；任务10仅随原任务包收录，未执行。

## 分节提交与验证

| 小节 | 提交 | 主要改动文件 | 单测 / 构建 | 该节 E2E |
| --- | --- | --- | --- | --- |
| 09-1 收敛蓝色 | `2136e12` | styles.css、styles/dialogs.css、home.css、model-connection.css、editor下相关CSS、Experiments、DataLayersPanel | 192/192；通过 | visual-polish 1/1 |
| 09-2 统一表格 | `1f25e48` | styles/table.css、DataTable及测试、HomeTables、UploadDialog、Comparison、EvaluationResults、ClassificationResults、BottomDrawer、test-setup.ts | 192/192；通过 | visual-polish、home-workspace、refinements 3/3 |
| 09-3 实验表格 | `bbba02d` | ExperimentsTable及测试/CSS、tableModel及测试、Experiments、lib/metrics.ts、lib/format.ts、homeData、VersionHistoryDialog | 202/202；通过 | experiments、visual-polish 2/2；布局基线1/1 |
| 09-4 数据页 | `187b987` | DataPage及测试、data-page.css、styles.css、lib/api.ts已有时间字段的可选类型 | 204/204；通过 | visual-polish、processing 4/4 |
| 09-5 论文尺寸 | `dc919c7` | PublicationPanel及测试/CSS、publication.ts及测试、ScientificPanel、AppearanceTab、FigureCanvas、Workbench、model.ts | 208/208；通过 | publication-presets、publication、delivery 6/6 |

各节均先运行单测、构建及对应专项E2E，再单独提交。原始运行、失败及修复记录见 [TEST-RESULTS.md](TEST-RESULTS.md) 顶部各节。09-1全部修改选择器和前后值见 [选择器清单](test-evidence/refactor09-1-selectors.json)。

## 实现要点

- 蓝色仅保留链接、可操作文字、选中/当前、焦点和进行中；辅助说明/规格/时间使用灰色及等宽字体。未把科研图的数据色板改成黑白。
- 所有实际表格共用lf-table，表头不转大写、数字右对齐；空值为带aria-label的“空”，不改成0。版本历史本来是列表，保留其快照操作结构。
- 实验表格支持项目内字段频率推断、默认4参数/3指标、列显示持久化、存储不可用回退、空值始终最后的排序、明确方向的最优值、编辑/复制和数据版本跳转。卡片与原有选择、基线、对比逻辑保留；选择栏不再为空选择占位。
- 数据页文件名普通字体500并换行，元数据等宽；派生标记来自已有source_meta，右侧单层卡片，提示/字段/表格对齐。created_at是既有API查询返回值，只补前端可选类型。
- 论文预设只修改已有publication字段。外观页和画布工具栏复用同一组件，原专业页控件迁移，避免两套。物理字体沿用既有公式 `fontPx = fontPt × 25.4 / 72 × style.width / widthMm`；标尺10mm一格。新建单序列且无分组隐藏图例，保存配置不重写。
- 180mm PDF实际页面为180×118.42105mm；760×500像素配置不变。证据：[PDF](exports/refactor-09-double.pdf)、[尺寸/配置记录](test-evidence/refactor09-publication.json)。

## 总验收发现与修复

首轮完整E2E为54/62通过、8失败。7项是任务09明确改变了默认视图/图例/表格宽度/文件名字体/空选择栏后的旧测试假设；1项是真实纸面适配问题。没有删除业务断言：

- AUC/AP及工具结构测试显式开启所测试的图例；保留AUC/AP数值、旧配置开关、增删序列、一步撤销与导出断言。真实上传流程通过外观控件开启图例，再保留标题/图例不重叠检查。
- 默认实验页就绪选择器切换为表格；编辑用例明确切回卡片，保留原有编辑/备注断言。窄屏测试同时检查表格记录和卡片状态，选择栏检查改为有选择显示/清空消失/保持视口内；数据页检查普通文件名字体、等宽元数据及表格铺满。
- 1280px下2400×2400画布的纸面底部超出约1.34px；原适配函数只扣固定88px，没有测量标题/脚注/标尺。改为实测不缩放装饰高度及stage padding，物理开关变化时重新适配。只改查看缩放，不改保存/导出配置；新增一项真实几何回归单测。诊断两次专项experience均2/3，修复后整轮再次验证。
- 任务08的像素布局不能直接约束09有意变更的布局，另存09基线；仍检查四页26个元素的7项几何/字体属性，最终整轮独立比较，不覆盖08证据。

第二轮整跑60/62：纸面适配及前述功能通过，剩余实验按钮精确名称未计入EXP编号、清空按钮名称不完整。专项editor/shell-pages一轮2/3，窄屏通过，实验名称的宽泛后缀又同时匹配“实验操作”按钮；最后限定为`^EXP-\d+ AdamW ablation$`，不使用first()隐藏歧义。全部断言保留后重新整跑。

最终一次完整执行62/62通过（2.7分钟，不是拼接失败项重跑统计）；隔离库清理本轮71个项目，新JVM审计/中断恢复通过。最终Vitest34文件209/209（17.06s），构建通过（10.35s），git diff --check无错误。CSS19文件6607行、35种六位颜色、3处!important、0衬线/禁用引用，颜色数量与08一致。

## 运行方式

每节实际使用`npm test -- --maxWorkers=4`（仍运行全部Vitest）、`npm run build`，以及本机忽略目录中的`.runtime/test-refactor09.ps1 -Specs ...`；总验收使用同脚本`-All`。该包装基于已有scripts/test-agent.ps1，另外把5178端口改为生产dist的本地静态服务与API代理，因此验收的是实际构建产物；没有mock数据API或图表渲染。

测试环境为独立`labflow_e2e`数据库、Java API 8087、网页5178、本地模型兼容夹具18769；单worker，运行后按水位清理本次项目。成功整轮后另做新JVM审计/中断恢复校验。真实用户工作区数据库不作为测试目标。

仓库已有可复用的完整浏览器测试入口（需先准备本机MySQL/JDK/依赖，使用开发前端服务）：

```powershell
Set-Location frontend
npm test -- --maxWorkers=4
npm run build
Set-Location ..
./scripts/test-agent.ps1 -All
node scripts/audit-css.cjs docs/test-evidence/refactor09-css.json
```

本轮CSS输出指定09证据路径，避免默认覆盖任务08统计。上述公共入口命令为复现说明，本轮实际使用的生产静态服务包装命令见前文，不混写为同一命令。

## 四组设计对照

实际页面截图均1440px宽，使用真实Java/MySQL测试夹具，图形由Plotly实际渲染。并排图左侧设计稿、右侧实际页面；没有用设计稿冒充运行截图。

| 页面 | 并排截图 | 与设计稿的差异及原因 |
| --- | --- | --- |
| 实验表格 | [对照](screenshots/refactor-09-compare-experiments.png) | 夹具3条记录、3参数/2指标，设计稿8条/4参数/2指标；按真实字段推断，不造记录填满。截图为空选择，故按新规则隐藏胶囊；选2项进对比及窄屏显隐另有E2E。保留既有PageHeader外边距/全局内容限宽与导航图标，不照搬静态稿的固定宽度。 |
| 数据页 | [对照](screenshots/refactor-09-compare-data.png) | 实际1个版本、3行3数值列（含1空值），设计稿3版本/12行/5列。长文件名完整换行；保留搜索仅影响查看的说明与原文件操作。派生标签由数据来源决定，夹具主数据无派生标签，派生场景由组件/processing测试覆盖。 |
| 编辑器单栏 | [对照](screenshots/refactor-09-compare-editor-single.png) | 采用实际760×500画布、100%查看；设计稿约600px纸面，留白比例不同。保留撤销/预览、模型连接、可折叠画布/图例/样式入口及图表标题。PDF验证选择Noto Sans SC图内字体，UI仍Inter/Mono。单栏8pt字体按原有物理公式较大，不用静态稿视觉尺寸反推新算法。 |
| 编辑器双栏 | [对照](screenshots/refactor-09-compare-editor-double.png) | 同一像素画布下切180mm，图中文字相对变小，成品高度118.4mm；设计稿数据、标题和边距不同。右侧以真实输入控件提供自定义与DPI，属性可滚动，未为截图删掉既有编辑能力。 |

## 边界与未执行

- 各节未单独运行完整E2E，集中到总验收；每节要求的专项已执行。
- 未运行Java JUnit：本轮无Java/SQL/API改动。E2E实际启动Java和隔离MySQL，不能把后端`package -DskipTests`说成Java单测通过。
- 未调用真实/收费模型；助手测试仅用本地兼容协议夹具。未部署Pages、未推送远端、未开始任务10。
- 生产构建仍有现存Plotly包大于500kB警告，构建成功；本轮未重做打包策略。
- 既有关闭状态的publication默认89mm保持兼容，新预设采用88/120/180；高度可见标签精简，可访问名称仍为“高度（按比例） / mm”。
- 后端、API、Flyway、schema必填结构、AgentAssistant.tsx、草稿/保存/预算/幂等/恢复实现无改动；相关真实流程纳入完整浏览器回归。无需新增产品决定。

最终总测试结果及CSS审计见TEST-RESULTS任务09总验收记录。
