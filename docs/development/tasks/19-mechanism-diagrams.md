# 任务 19：机制图模块（skill 方案包 + 风格预设）

**先读**：`AGENTS.md`、本文件、`docs/REVIEW.md`、`docs/AGENT-TEAM.md`、`docs/FIGURE-TOOLS.md`、`docs/MCP.md`、`docs/API.md`、README「数据与隐私」一节。
**界面**：设计稿截图在 `docs/development/design/19-screens/`（19-1 新建、19-2 编辑器、19-3 绘图助手、19-4 导出 / 参考风格 / MCP，以及 12-x 方法框架图的三张）。文中「设计画布 12-x 的思路」以这些截图为准；截图里的图标是示意，不是正式素材。细节以本文文字为准，并沿用现有编辑器的组件和视觉规则。
**前置**：任务 18（`feature/agent-team`）已经通过 PR 合并到 `main`。推送和开 PR 需要仓库主人单独授权；没有合并之前不要开始本任务。
**分支**：从 `main` 新建 `feature/diagrams`，每一节单独提交，不推送。
**分三段交付，每段完成后按 AGENTS.md 格式汇报并停下，等仓库主人确认后再继续**：
- **19-A 编辑器与风格**：机制图的数据格式、编辑器、6 种风格、模板、导出、确定性审稿。不涉及 AI。
- **19-B skill 方案包与 AI 结构提案**：6 个 skill，AI 只出结构提案，用户预览确认，加评测。
- **19-C 素材与外部连接**：图标库、从参考图提取风格、.drawio 导出、MCP 外部 agent 通道。

---

## 0. 目标与边界

**目标**：用户在 FigTide 里画论文用的机制图、方法框架图、实验流程图和图形摘要。画出来的每个元素都能编辑，按成品物理尺寸检查，导出矢量文件。用户可以选择 **skill**（按领域和图类型划分的绘图方案）和 **风格**（视觉预设）。

**不做的事（硬约束）**：
1. **不接图像生成模型**（GPT Image、Nano Banana 等），不生成位图草稿，也不把位图重建成 SVG。
2. **不内置或打包第三方论文的图片**，包括 Top-Conf Figure Gallery 里的图。测试夹具、截图、示例里也不能出现第三方论文的图。
3. **不复制没有许可证的仓库内容**。`yiyanli123/biorender-mechanism-figures-skill` 没有许可证文件，**不得参考或复制其中任何文字**。任何风格名、文案都不能使用「BioRender」这类商标。
4. MIT 许可的上游 skill 只**借鉴方法**：用自己的话改写成中文的规划步骤和检查项，在每个 skill 的 `SOURCES.md` 里写明参考了上游哪个文件的哪一部分，并在 `THIRD_PARTY_NOTICES.md` 里保留上游的版权和许可声明。不逐字照搬大段文字。
5. 新增依赖只允许 MIT、BSD、Apache-2.0、ISC、0BSD 许可证，锁定确切版本，并写进 `THIRD_PARTY_NOTICES.md`。EPL、GPL、LGPL、AGPL、带 NC 或 ND 条款的依赖和素材一律不用。
6. 沿用现有的硬约束：不修改已有迁移；不修改或删除已有接口字段；图表模块（数据图）的行为完全不变；原始数据只读；不自动保存；不调用收费模型；测试不碰真实工作区和用户的桌面数据目录。

## 0.1 上游参考（只借鉴方法，许可证已核实为 MIT）

| 上游 | 借鉴什么 | 用在哪 |
|---|---|---|
| `lgwrightlab/schematic-figure` | 先写简报、再列事实、再写规格的规划流程；按领域整理的绘图知识（生物、化学、物理器件、计算机）；成品检查项（字号 5–7 pt、细引线、一个面板讲一件事） | 19-B 规划提示词、19-A 审稿规则 |
| `shreyas-makes/science-illustrations-skill` | 图类型划分；**不编造证据**的规则（不画假图表、假显微照片、用户没给的分子或数值） | 19-B 提示词和 D8 检查 |
| `bpoult/scientific-figure-design` | 设计方法和评审清单（Points of View 专栏的总结） | 19-A 审稿规则说明 |
| `Agents365-ai/drawio-skill` | 生成后自检（重叠、裁切、连线堆叠）；.drawio 文件结构 | 19-A 审稿、19-C 导出 |
| `qwdwqfwq/topconf-paper-figure-gallery` | 视觉模式分类：conceptual、framework、pipeline、architecture、taxonomy、teaser | 模板分类；「看看别人怎么画」外链 |

如果上游的提交号和许可证与上表不一致，以实际核实为准，并在汇报里说明。

---

# 19-A 编辑器与风格

## 19-1 数据格式与存储

1. **机制图文档 `DiagramDoc`（`schema_version: 1`）**：
   ```jsonc
   {
     "schema_version": 1,
     "canvas": { "width_mm": 180, "height_mm": 110, "background": "#FFFFFF" },
     "style": { "preset": "nature-flat", "overrides": {} },
     "label_language": "en",                  // en | zh，只影响模板占位文字
     "zones": [                               // 分区：细胞外/膜/胞内/核、面板、放大框
       { "id": "z1", "kind": "compartment|membrane|nucleus|panel|zoom", "label": "Cytoplasm",
         "x": 0, "y": 0, "w": 100, "h": 60, "zoom_of": null }
     ],
     "nodes": [
       { "id": "n1", "kind": "box|pill|ellipse|glyph|icon|text|artwork",
         "x": 10, "y": 12, "w": 24, "h": 10, "label": "Receptor", "zone": "z1",
         "glyph": "receptor",                  // kind=glyph 时必填，取值见 19-2b
         "label_pos": "center|below|above|left|right",
         "boxed": false,                       // true：方框里左侧放小图元（流程步骤常用）
         "badges": ["phospho"],                // 可选：磷酸化 P、冻结、可训练等小标记
         "icon": null, "role": "actor|process|data|model|output|note", "style_ref": null }
     ],
     "edges": [
       { "id": "e1", "from": "n1", "to": "n2",
         "kind": "flow|activate|inhibit|transport|bind|indirect",
         "label": "", "route": "straight|orthogonal|curved" }
     ],
     "annotations": [ { "id": "a1", "kind": "panel_letter|callout|note", "target": "n1", "text": "a" } ],
     "legend": { "mode": "auto|off", "position": "bottom-right" },
     "meta": { "skill": null, "skill_version": null, "template": null, "brief": "", "facts": [] }
   }
   ```
   - 坐标单位全部是毫米，和成品尺寸一致；
   - 上限：分区 ≤ 30、节点 ≤ 120、连线 ≤ 200、单个标签 ≤ 200 字符、整份文档 ≤ 2 MB；
   - `artwork`（导入的 SVG 图层）在 19-C 才启用，19-A 的校验先拒绝；
   - 不允许嵌入位图。
2. **后端校验 `DiagramValidator`**（纯 Java，无 I/O）：拒绝未知字段；ID 唯一；引用有效（连线端点、`zone`、`target`、`zoom_of`）；坐标有限且在画布内；枚举值合法；图标 ID 必须在图标清单里（19-A 清单为空，19-C 补充）；风格预设必须存在。写完整的单元测试。
3. **迁移 V10**（MySQL 和 H2 各一份，H2 用 CLOB）：
   ```sql
   CREATE TABLE diagrams (
     id BIGINT PRIMARY KEY AUTO_INCREMENT,
     project_id BIGINT NOT NULL,
     name VARCHAR(120) NOT NULL,
     revision INT NOT NULL DEFAULT 0,
     archived BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMP(3) NOT NULL,
     updated_at TIMESTAMP(3) NOT NULL,
     FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
   );
   CREATE TABLE diagram_versions (
     id BIGINT PRIMARY KEY AUTO_INCREMENT,
     diagram_id BIGINT NOT NULL,
     version INT NOT NULL,
     schema_version INT NOT NULL,
     doc_json JSON NOT NULL,
     created_at TIMESTAMP(3) NOT NULL,
     UNIQUE (diagram_id, version),
     FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE
   );
   ```
   时间字段写法和时区沿用现有约定（显式写 `updated_at`，UTC）。
4. **接口**（形状尽量和图表一致，写进 `docs/API.md`）：
   ```
   GET    /api/projects/{p}/diagrams                 列表（含归档标记）
   POST   /api/projects/{p}/diagrams                 新建：{ name, doc } 或 { name, template, style }
   GET    /api/projects/{p}/diagrams/{id}            当前版本 + revision
   PUT    /api/projects/{p}/diagrams/{id}            保存为新版本：{ base_revision, doc }，revision 不符返回 409
   GET    /api/projects/{p}/diagrams/{id}/versions   版本历史
   POST   /api/projects/{p}/diagrams/{id}/restore    恢复到某版本（生成一个新版本）
   PUT    /api/projects/{p}/diagrams/{id}/archive    归档 / 取消归档（不提供删除）
   GET    /api/diagram-catalog                       风格、模板、skill 清单（19-B 起）、图标清单（19-C 起）
   ```
   接口同样有项目归属检查、乐观锁和 Host/Origin 校验，规则与图表完全相同。
5. **备份恢复和迁移工具**：`BackupService` 纳入两张新表（ID 重映射、外键检查），`scripts/migrate-to-desktop.ps1` 一并迁移。补备份恢复往返测试和迁移工具测试；旧备份文件（没有这两张表）仍然可以恢复。

## 19-2 风格预设（6 种）

1. 预设放在后端 `backend/src/main/resources/diagram/styles/*.json`，通过 `/api/diagram-catalog` 下发。**前后端只用这一份**，前端不另写一份。每个预设包含：
   - 调色板：分区底色 ≤ 6、强调色 ≤ 3、文字色、线色；
   - 线宽（pt）、箭头样式、圆角、字体族和基准字号（pt）；
   - 填充方式：`flat | soft | outline`；阴影；`sketch`（手绘）和 `iso`（等距 3D）开关。
2. 6 种预设：
   | id | 名称 | 要点 |
   |---|---|---|
   | `nature-flat` | Nature 扁平 | 白底，Arial/Helvetica，正文 6–7 pt，0.5 pt 细线，低饱和配色 |
   | `soft-illustration` | 柔和插画 | 圆角大、柔和渐变、浅色分区、细胞和膜用圆润的轮廓 |
   | `line-minimal` | 线稿极简 | 黑色线条加一个强调色，无填充 |
   | `conference-framework` | 会议框架风 | 模块分组浅色底，圆角矩形，适合 AI 论文 Figure 1 |
   | `isometric` | 等距 3D | 方块节点画成等距立体（顶面和侧面），只用矢量 |
   | `sketch` | 手绘草图 | 用 rough.js（MIT）绘制，**固定随机种子**，同一份文档每次渲染结果相同 |
3. 所有预设的配色必须通过任务 18 的色觉检查（`ColorVision`，三种色觉缺陷下任意两个分区底色 CIEDE2000 ≥ 20）。写测试固定这一点。
4. 切换风格只改 `style.preset`，不改结构和坐标；`overrides` 可以覆盖单项。切换可撤销。

## 19-2b 科学图元库（必须做，这是机制图和流程图的区别）

只有方框和箭头的图不能叫机制图。渲染器内置一套**参数化矢量图元**，颜色全部来自风格调色板，随风格切换，尺寸按节点宽高缩放，不是位图，也不是第三方图标：

| 类别 | 图元 |
|---|---|
| 细胞与分区 | 磷脂双分子层（分区 `membrane` 渲染为双层磷脂头和尾）、双层核膜（`nucleus`）、细胞、囊泡 |
| 分子 | 跨膜受体（二聚体，胞外结构域 + 跨膜段 + 胞内尾）、蛋白（不规则团块）、二聚体、配体（三亚基）、小分子（稠环）、DNA 双螺旋（可高亮基因片段） |
| 标记 | 磷酸化 P、冻结（雪花）、可训练（火焰）、数字编号 |
| 方法框架 | 输入帧堆叠、编码器（梯形）、语言模型块、注意力热图、token 序列、堆叠层、数据集（圆柱）、结果柱状图、文字输入 |
| 实验与装置 | 试管、烧瓶、细胞群、激光器、透镜（双凸）、分束器、样品台、探测器、能级线 |

要求：
1. 图元是纯函数 `(kind, w, h, palette) → SVG 路径`，同一参数输出相同；每个图元至少有两层（主体 + 细节），线宽按成品 pt 计算；
2. 标签位置由 `label_pos` 决定；**连线的端点吸附到图元本身的范围**（`label_pos=below` 时不连到标签上）；
3. 6 种风格下每个图元都要有快照测试；`line-minimal` 下只用线和强调色；
4. 设计稿用的原型代码在 `docs/development/reference/diagram-engine-sketch.js`（我写的示意实现，可以参考思路和图元造型，但必须按本仓库的结构重写、补类型和测试，不能直接拷进产品代码）；
5. 19-11 的外部图标库是补充，不替代内置图元。

## 19-3 渲染器与编辑器

1. **渲染器** `frontend/src/diagram/render/`：纯函数，`(doc, style) → SVG`。编辑器、缩略图、导出、审稿采集几何信息都用这一个渲染器。按毫米渲染，屏幕显示时缩放。
2. **入口**：「科研绘图」页加切换「数据图 / 机制图」。机制图列表和图表列表结构一致（新建、打开、归档、版本数）。路由 `/projects/:p/diagrams/:id`。
3. **新建流程**（按设计画布 12-1 的思路）：
   - 第一步选模板：按视觉模式分组（conceptual、framework、pipeline、architecture、taxonomy、teaser，另加 mechanism、workflow、comparison），每个模板有缩略图（用我们自己的渲染器画模板本身，不用任何外部图片）；
   - 第二步选风格：6 个风格缩略图，用同一个模板实时预览；
   - 第三步选成品尺寸：单栏、双栏或自定义，单栏和双栏宽度沿用任务 18 的期刊规则表；
   - 页面角落放链接「看看别人怎么画 ↗」，用系统默认浏览器打开 Top-Conf Figure Gallery 首页，旁边注明「外部网站，图片版权归原作者」。
4. **模板**：19-A 先做 12 个模板，每个视觉模式至少 1 个。模板是 `DiagramDoc` 骨架（分区 + 占位节点和连线），放在 `backend/src/main/resources/diagram/templates/`，占位文字中英文各一份。每个模板必须通过 `DiagramValidator` 和 19-5 的审稿，0 个 error。
5. **编辑器**（按设计画布 12-2 的思路）：
   - 左栏：分区类型、**科学图元面板**（按当前 skill 显示常用图元，例如生物医学显示受体、蛋白、二聚体、配体、小分子、DNA；方法框架显示输入帧、编码器、注意力图、语言模型、token、数据集）、连线类型（激活 →、抑制 ⊣、转运、结合、间接作用 - - →、普通流程）、风格切换；
   - 画布：拖动、框选、缩放；连线从节点的连接点拉出；对齐、等距分布、吸附网格（1 mm）；分区可以嵌套节点，拖动分区时里面的节点一起移动；
   - 右栏：选中元素的属性（文字、类型、角色、所在分区、连线类型和走线方式）；
   - 自动图例：用到两种及以上连线类型时，自动生成连线含义图例，可以关闭；
   - 撤销和重做、本机草稿（`figtide-diagram-draft-v1:*`）、离开提示、Ctrl+S、Ctrl+Z 的行为与图表编辑器一致；保存走乐观锁，冲突提示和图表一致；
   - 键盘：方向键移动 1 mm，Shift + 方向键移动 5 mm，Delete 删除，Ctrl+D 复制；所有按钮都有可访问名称。
6. **自动排版**：提供「整理排版」按钮。流程类模板用分层布局（`@dagrejs/dagre`，MIT），分区模板在各自分区内排版。排版结果必须确定（同样的输入得到同样的坐标），排版是一次可撤销的编辑。19-B 的 AI 提案也用这个排版模块。

## 19-4 导出

1. SVG：渲染器输出，字体写成风格里的字体族；
2. PNG：300 / 600 dpi，按成品毫米尺寸换算像素；
3. PDF：沿用图表的 `jspdf + svg2pdf.js` 和 Noto Sans SC 字体子集方案（参考 `frontend/src/editor/pdf.ts`）。标签里有中文时必须使用嵌入的字体；
4. 导出对话框显示成品尺寸、最小字号；如果审稿有 error，提示但不阻止导出。

## 19-5 机制图审稿（复用任务 18 的审稿引擎）

1. 在 `dev.labflow.review` 下新增 `diagram/` 子包，**复用**已有的 `ColorVision`、渲染事实校验和期刊规则表，不复制代码。渲染事实新增 `kind: "diagram"`，只包含几何信息：节点框、文字框、连线折线、箭头位置、字号、颜色。**不包含标签文字**。隐私单测参照任务 18。
2. 规则（ID 用 D 开头，和图表的 R 规则分开）：
   | 规则 | 内容 | 可自动修复 |
   |---|---|---|
   | D1 | 按成品尺寸换算后最小字号 ≥ 期刊要求（默认 6 pt） | 是：调大字号 |
   | D2 | 线宽 ≥ 0.5 pt | 是 |
   | D3 | 分区和角色配色在三种色觉缺陷下可区分 | 是：换成色盲友好配色 |
   | D4 | 文字重叠、超出所在节点或画布 | 部分：放大节点；其余给意见 |
   | D5 | 连线有歧义：穿过无关节点、两条连线重叠、箭头挤在一起、交叉过多（阈值写成常量） | 部分：改成直角走线；其余给意见 |
   | D6 | 用了两种及以上连线类型但图例已关闭 | 是：打开图例 |
   | D7 | 流程类模板里有孤立节点或悬空连线 | 否（意见） |
   | D8 | 标签没有出现在用户的描述或事实列表里（只针对 AI 生成的内容，19-B 启用） | 否（意见：「请确认这项内容有依据」） |
   | D9 | 用了要求署名的图标，但导出时没有附署名（19-C 启用） | 是：附加署名 |
3. 修复操作只用 19-6 定义的机制图操作，走同一条校验链。
4. 接口：`POST /api/projects/{p}/diagram-tools/review`，形状和图表的审稿接口一致（`issues`、`passed`、`skipped`），只读，不调用模型。缺少渲染事实时，D4 和 D5 标记为「跳过」，不能当作通过。
5. 界面：编辑器顶栏「审稿这张图」，复用任务 18 的审稿面板和画布编号标记组件。

## 19-6 机制图操作（为 19-B 和修复做准备）

新建 `DiagramOperations`（纯 Java，无 I/O，参照 `FigureOperations`）：`add_zone`、`update_zone`、`add_node`、`update_node`、`remove_node`、`add_edge`、`update_edge`、`remove_edge`、`set_style`、`set_canvas`、`set_legend`、`add_annotation`。每个操作有 JSON 参数结构，拒绝额外属性；`apply` 之后必须通过 `DiagramValidator`；`changes(before, after)` 给出逐项差异。目录通过 `/api/diagram-tools/catalog` 下发，前端从目录生成操作，不另写一份字段名。补 `POST /api/projects/{p}/diagram-tools/preview`（只读，返回新文档和差异）。

## 19-A 验收

- 后端测试（MySQL、H2）全部通过：校验器、操作、迁移 V10、备份恢复往返、接口（含 409）、D1–D7 规则的触发和不触发；
- 前端测试和构建通过：渲染器快照（6 种风格 × 全部模板，以及 6 种风格 × 全部图元）、排版确定性、手绘风格同种子结果相同、撤销栈、草稿恢复、渲染事实隐私；
- 新增 E2E `diagram.spec.ts`：新建（模板 → 风格 → 尺寸）→ 编辑节点和连线 → 切换风格 → 审稿并修复 → 保存 → 冲突提示 → 版本恢复 → 导出 SVG、PNG、PDF（检查文件可解析、尺寸正确）；
- 数据图相关的现有测试全部原样通过；桌面模式完整 E2E 一次全绿；
- 新建 `docs/DIAGRAMS.md`：数据格式、风格、模板、审稿规则、局限；附截图（新建流程、编辑器、审稿）；
- `THIRD_PARTY_NOTICES.md` 收录 rough.js、dagre 和上游 skill 的声明。

**完成 19-A 后汇报并停下。**

---

# 19-B skill 方案包与 AI 结构提案

## 19-7 skill 方案包格式

每个 skill 一个目录：`backend/src/main/resources/diagram/skills/<id>/`
```
skill.json      id、version、名称、描述、适用的视觉模式、模板列表、推荐风格、允许的节点和连线类型、图标标签、检查项开关
planning.md     规划提示词（中文，用自己的话写）：简报 → 事实 → 规格 → 结构
checks.json     本 skill 额外的确定性检查参数（例如流程图最多几层、机制图必须有分区）
SOURCES.md      参考了哪个上游的哪个文件哪一部分、上游提交号、许可证
```
- `skill.json` 里的 `version` 每次修改提示词都要升级，写进运行审计（`skill_id`、`skill_version`、`prompt_version`）；
- 加一个单元测试：每个 skill 引用的模板、风格、节点和连线类型都存在；`SOURCES.md` 不为空；`planning.md` 和上游文件不存在长段重复（连续 40 个字符以上相同即失败，用上游文件的本地副本比对，副本只放在测试资源里并附许可证）。

## 19-8 内置 6 个 skill

| id | 名称 | 模板 | 要点 |
|---|---|---|---|
| `bio-mechanism` | 生物医学机制图 | 分区机制（胞外/膜/胞内/核）、信号级联、药物作用 | 激活和抑制必须区分；分子、通路名称只能来自用户描述 |
| `ml-framework` | 方法框架图 | pipeline、framework、architecture、teaser | 模块分组、数据流方向一致、输入输出明确 |
| `workflow` | 实验流程图 | 从左到右的步骤、步骤加放大面板 | 步骤编号、时间点和条件只能来自用户描述 |
| `chem-materials` | 化学 / 材料机理 | 反应路径、能级图、结构对比 | 不画用户没给的结构式和数值 |
| `physics-device` | 物理装置 / 光路 | 器件剖面、光路 | 先列几何事实（元件顺序、方向、路径），再画 |
| `concept-abstract` | 概念图 / 图形摘要 | 中心辐射、前后对比、taxonomy 分类树 | 一张图只讲一个核心观点 |

每个 skill 补 2–4 个模板（加上 19-A 的 12 个，总数 20 个左右）。

## 19-9 AI 结构提案

1. **先做审计（19-B0），汇报后再实现**：现有 `agent_runs`、`agent_sessions` 的 `dataset_version_id` 是 NOT NULL，`AgentRunService` 围绕图表设计。列出所有假定「运行一定有数据版本和图表」的代码位置，然后在两种方案中选一种，写进汇报：
   - **方案 A（优先）**：V11 新增迁移，`agent_runs`、`agent_sessions` 增加可空的 `diagram_id`，并把 `dataset_version_id` 改为可空；新增 `mode: "diagram"`，复用预算预留和结算、幂等、取消、超时、审计。现有单助手、协作、审稿运行的行为和测试不变；
   - **方案 B**：独立的 `DiagramAgentService` 和表，但**调用**现有的预算、审计组件，不复制它们的逻辑。

   不论选哪个，原有 suite v1.5 回放和任务 18 的评测都必须原样通过。
2. **流程**（单助手，状态机写在代码里）：
   ```
   用户描述 + 选中的 skill
     → 简报（一句话要点、必须包含、不能暗示的内容、尺寸）
     → 事实列表：每条事实标注来自用户原文的哪一句，没有出处的不能进入事实列表
     → 结构：分区、节点、连线（只有语义，不给坐标）
     → 前端排版（19-3 的排版模块）→ 渲染 → 提交渲染事实 → 确定性审稿
     → 提案：简报 + 事实 + 结构预览 + 审稿修复（默认勾选）+ 审稿意见
     → 用户确认 → 进入草稿和撤销栈（不自动保存）
   ```
3. **工具**：模型只能用 `DiagramOperations` 里的操作和只读工具（当前文档、skill 规则、模板列表）。不能读取其他图表或数据集。用户描述里如果提到数据，只当作文字，不读取数据行。
4. **不编造**：模型给出的每个节点标签必须能追溯到事实列表或用户原文，追溯不到的由 D8 列为意见。提示词里写明：不添加用户没提到的分子、通路、数值、时间点、仪器；用户的描述不够时，先追问，不要猜。
5. **界面**（按设计画布 12-3 的思路）：编辑器右侧「绘图助手」面板，顶部选 skill（下拉框，显示说明和推荐风格），输入描述 → 先显示简报和事实列表，用户可以删掉或修改事实后再继续 → 显示结构提案的预览（蓝色编号）、审稿修复（橙色）、审稿意见 → 「应用这组调整」。
6. **追改**：在已有图上继续说「把 STAT3 放到细胞核里，加一条抑制」，生成操作提案，规则同上。

## 19-10 评测

1. **任务集** `backend/src/test/resources/diagram-eval/suite-v1.json`：36 条描述（6 个 skill × 6 条），全部是合成的科学描述，明确标注。每条写明金标准：必须出现的实体、必须出现的连线及其类型（激活还是抑制）、不能出现的内容、分区归属。
2. **指标**：实体召回率、连线类型正确率（激活和抑制分开统计）、编造标签数（D8 命中数）、提案后确定性审稿的 error 数、步数、token、延迟。
3. **回放**：每个 skill 各 2 条人工编写的协议夹具（共 12 条），在 CI 里跑，标注为人工协议录制，不是模型采样。
4. **真实模式**：只提供命令，由仓库主人手动运行，沿用 `EvaluationSpendBudget` 的调用前预留；报告里不得填写没有实际跑过的数字。
5. 报告写进 `docs/AGENT-EVALUATION.md` 新的一节「机制图」，Bootstrap 置信区间方法与任务 18 一致。

## 19-B 验收

- 后端测试（MySQL、H2）全部通过；suite v1.5 和任务 18 的评测回放原样通过；
- 19-B0 审计结论和所选方案写进汇报和 `docs/DIAGRAMS.md`；
- skill 方案包测试（引用完整、来源不为空、和上游没有长段重复）通过；
- 12 条回放夹具通过；D8 追溯检查有单测（有出处的标签不报，没有出处的报）；
- E2E `diagram-agent.spec.ts`（协议夹具）：选 skill → 输入描述 → 修改事实列表 → 结构提案 → 取消一条审稿修复 → 应用 → 撤销；以及一次追改；
- 桌面模式完整 E2E 一次全绿；截图：skill 选择、事实列表、结构提案。

**完成 19-B 后汇报并停下。**

---

# 19-C 素材与外部连接

## 19-11 图标库

1. 收录约 150 个科研图标，SVG 文件放在 `backend/src/main/resources/diagram/icons/`，通过 `GET /api/diagram-icons/{id}.svg` 提供，清单经 `/api/diagram-catalog` 下发。
2. **只收 CC0 和 CC BY 4.0 许可的图标**（界面类图标可以用 MIT 或 Apache）。不收 CC BY-SA、NC、ND（ND 不允许改色）。候选来源：Servier Medical Art、Bioicons（**按单个图标**核实许可证，同一站点里许可证不同）。其他来源要先核实再用。
3. 清单每项：`id`、中英文名称、标签、来源、作者、许可证、来源链接、是否修改过（改色、简化）。每个来源的许可证全文放在 `icons/licenses/` 下。
4. 所有图标文件必须通过 19-12 的 SVG 净化器，加测试：清单和文件一一对应、许可证在允许范围内、没有脚本和外部引用。
5. 编辑器左栏加图标面板（搜索中英文名称和标签，按 skill 推荐的标签排序）。图标颜色跟随风格调色板。
6. **自动署名**：用了 CC BY 图标时，导出对话框默认勾选「附加图标署名」，可以选择写进图注文本（复制到剪贴板）或另存为 `.txt`；D9 检查生效。

## 19-12 SVG 净化器（安全）

后端 `SvgSanitizer`，图标入库和 19-14 的 SVG 导入共用：
- XML 解析器禁止 DOCTYPE 和外部实体（防 XXE 和实体膨胀）；
- 元素和属性用白名单：基本图形、路径、分组、渐变、文字、`defs`、`use`（只允许指向文档内的 `#id`）；
- 删除 `script`、`foreignObject`、`iframe`、`image`（禁止引用外部或内嵌的位图）、所有 `on*` 事件属性、`javascript:` 和外部 URL、CSS 里的 `url()`（文档内 `#id` 除外）和 `@import`；
- 大小 ≤ 2 MB，元素数 ≤ 20000，嵌套深度 ≤ 64；
- 测试样本覆盖以上每一种攻击，外加一个正常的复杂 SVG 净化前后渲染结果一致。

## 19-13 从参考图提取风格

1. 新建风格时可以选「从参考图提取」：用户上传**自己有权使用的**图片（PNG、JPG、SVG）。
2. **只在浏览器本地处理**：位图用 k-means 提取主色（≤ 6 个，排除背景色）；SVG 统计线宽、圆角、字体族。生成一个自定义风格，用户确认后保存。
3. **只保存提取出的风格参数，不保存、不上传图片**。界面上写明：「请只上传你有权使用的图片；FigTide 只保存颜色、线宽等参数，不保存图片。」
4. 保存位置：复用 `style_templates` 表（`profile_json` 里加 `kind: "diagram"`，不改表结构），备份恢复照常。
5. 提取出的配色要跑 D3 色觉检查，不通过时提示并给出调整建议。

## 19-14 MCP 外部 agent 通道

在 `mcp/` 新增工具（注解规则与任务 17 一致）：

| 工具 | 类型 | 说明 |
|---|---|---|
| `list_diagrams` | 只读 | 项目的机制图列表 |
| `get_diagram` | 只读 | 当前文档、revision、版本数 |
| `get_diagram_brief` | 只读 | 简报、事实列表、规格（分区、节点、连线语义）、风格参数（调色板、线宽、字体、字号）、成品尺寸，同时给出 Markdown 和 JSON 两种格式，方便外部 agent（例如装了 schematic-figure 的 Claude Code）按它来画 |
| `review_diagram` | 只读 | 确定性审稿（没有渲染事实，D4/D5 显示跳过） |
| `preview_diagram_changes` | 只读 | 传入操作，返回差异 |
| `save_diagram_version` | 写入 | 带 `base_revision` 保存操作结果；返回编辑器链接 |
| `import_diagram_svg` | 写入 | 把外部画好的 SVG 经 `SvgSanitizer` 净化后，作为一个 `artwork` 图层存成新版本；带 `base_revision` |

- `artwork` 图层在编辑器里可以整体移动、缩放、锁定、隐藏，**里面的文字不能单独编辑**，界面和 `docs/MCP.md` 写明这一点；
- 导入不会覆盖原来的图层，用户可以对照后删除旧图层；版本历史可以恢复；
- `docs/MCP.md` 新增一节「让外部 agent 画机制图」：步骤是 `get_diagram_brief` → 外部 agent 绘制 → `import_diagram_svg`，并说明外部 agent 使用的模型服务会看到简报内容。

## 19-15 .drawio 导出

1. 前端 `frontend/src/diagram/export/drawio.ts`：节点导出为 `mxCell` 顶点（带样式），分区导出为容器，连线导出为边（激活用普通箭头，抑制用 T 形端点，间接作用用虚线），图标作为内嵌 SVG 图片，标签保留为可编辑文字；
2. 测试：XML 合法；节点、连线、分区数量和原文档一致；父子关系正确；特殊字符转义正确；
3. 冒烟清单新增：用 draw.io 桌面版或网页版打开导出文件，确认能编辑（由仓库主人手动确认）。

## 19-C 验收

- 后端、前端、MCP 测试全部通过；SVG 净化器的攻击样本全部被拦截；
- 图标清单测试通过，`THIRD_PARTY_NOTICES.md` 和 `icons/licenses/` 完整；
- E2E：插入图标 → 导出时附署名；从参考图提取风格（使用测试里自己生成的图片）→ 保存 → 应用；MCP 集成测试：`get_diagram_brief` → `import_diagram_svg`（测试里自己画的 SVG）→ 编辑器里看到新图层 → 版本恢复；
- 桌面模式完整 E2E 一次全绿；
- README 功能列表、GUIDE.md「画机制图」一节、CHANGELOG「未发布」一节更新。

---

## 汇报要求（每段都适用）

按 AGENTS.md 格式，另外列出：
- 新增接口、迁移、依赖（名称、版本、许可证）；
- 改动的共享方法（如果有），说明原因并证明原有测试不改就能通过；
- 上游 skill 的实际提交号和许可证核实结果；
- 图标来源和许可证核实结果（19-C）；
- 需要仓库主人手动确认的冒烟项。
