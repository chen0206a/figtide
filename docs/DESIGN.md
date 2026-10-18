# LabFlow · 第一阶段产品设计

## 产品边界与核心路径
单用户本地研究工作区。创建项目 → 添加实验 → 上传真实 CSV/XLSX → 检查字段与缺失值 → 映射图表 → 即时编辑 → 保存 MySQL 版本 → 重开 → 导出 SVG/PNG。
不包含 AI 服务、团队权限、PDF、多子图、推断统计或显著性标记。预设不是期刊认证。

## 系统架构
```mermaid
flowchart LR
  UI[React / TypeScript 工作台] -->|HTTP JSON / multipart| API[Spring Boot 3 / Java 21]
  UI --> Plot[Plotly SVG 实时画布与导出]
  API --> Service[Service 校验 / 解析 / 版本事务]
  Service --> Repo[Jdbc Repository]
  Repo --> DB[(MySQL 8 / Flyway)]
  DB --> Raw[不可变原始文件 BLOB + SHA256]
```
请求使用 TanStack Query；编辑草稿使用 React reducer 历史栈，保存后服务端版本为基准。Plotly.react 更新现有图形，使用 SVG traces 避免散点 WebGL 导出栅格化。数据表使用 TanStack Table。Tailwind + shadcn 风格 Radix primitives 组成可访问控件。

## 数据库 ER 图
```mermaid
erDiagram
  projects ||--o{ experiments : owns
  projects ||--o{ datasets : owns
  projects ||--o{ charts : owns
  datasets ||--|{ dataset_versions : immutable_versions
  charts ||--|{ chart_versions : snapshots
  dataset_versions ||--o{ chart_versions : references
  projects { bigint id PK
    varchar name
    text description
    timestamp created_at }
  experiments { bigint id PK
    bigint project_id FK
    varchar name
    json parameters
    json metrics
    text notes }
  datasets { bigint id PK
    bigint project_id FK
    varchar name }
  dataset_versions { bigint id PK
    bigint dataset_id FK
    int version
    varchar sha256
    longblob original_file
    json fields_json
    json rows_json
    json warnings_json }
  charts { bigint id PK
    bigint project_id FK
    varchar name
    int revision }
  chart_versions { bigint id PK
    bigint chart_id FK
    bigint dataset_version_id FK
    int version
    int schema_version
    json config_json
    timestamp created_at }
```
数据版本为 append-only；同一 dataset 下新增版本明确由用户触发。图表保存包含完整配置快照与数据版本引用，乐观锁 revision 防止覆盖；历史恢复创建新版本而不覆盖旧版本。原文件保存在数据库，避免文件系统和 SQL 事务不一致。

## API v1 合约
前缀 `/api`，JSON UTF-8，错误 `{message, code}`；参数错误 400，资源不存在 404，版本冲突 409，过大 413。ID 为正整数。

| 方法 | 路径 | 语义 |
|---|---|---|
| GET / POST | /projects | 项目列表 / 创建 {name,description} |
| GET / POST | /projects/{p}/experiments | 实验列表 / 创建 {name,parameters,metrics,notes} |
| PUT | /projects/{p}/experiments/{id} | 更新实验 |
| GET | /projects/{p}/datasets | 列出所有版本与元数据 |
| POST | /projects/{p}/datasets | multipart file，新数据集 |
| POST | /projects/{p}/datasets/{id}/versions | 上传新的不可变版本 |
| GET | /projects/{p}/data/{versionId} | 字段、类型、缺失计数、数据行、警告 |
| GET | /projects/{p}/data/{versionId}/original | 下载原始文件 |
| GET / POST | /projects/{p}/charts | 列表 / 创建 {name,config} |
| GET / PUT | /projects/{p}/charts/{id} | 当前快照 / 保存 {name,revision,config} |
| GET | /projects/{p}/charts/{id}/versions | 历史快照列表 |

`config.schema_version=1`；包含 datasetVersionId、type、x、group、series[{id,y,name,color,opacity,width,dash,symbol,size,error}]、axes、style、legend、annotations、transforms。第一版只接受明确的 filter 转换，不修改原始行。所有字段引用均验证归属；未知 schema 拒绝。创建更新时间由服务器记录。

## 信息架构与视觉规范
全局窄导轨：概览 / 实验 / 数据 / 绘图。项目选择固定在顶部工具栏。
概览：研究项目列表、真实数量统计、六项主要能力介绍、最近图表与创建入口。
实验：列表和编辑表单，参数/指标 JSON 与备注，项目数据文件可跳转。
数据：上传、数据集版本列表、类型摘要、分页预览、缺失及异常提示。
编辑器：62px 顶栏；236px 左侧数据/图层；自适应中央画布；288px 右侧属性；底部可折叠表格与告警。

视觉方向（2026-10 第二次迭代）：大厂级深色玻璃工作台。
外壳：近黑 `#05070d`，叠加三处极光渐变（靛紫 `#7c5cff`、电蓝 `#4f6bff`、青 `#22d3ee`、品红 `#ff4fa3`）与 68px 网格纹理，导轨与顶栏使用 `backdrop-filter` 玻璃层。
表面：`--glass` 半透明渐变卡片，1px `rgba(255,255,255,.08)` 描边，18px 圆角，悬浮上移 3px 并出现紫色辉光；主按钮使用 `--iris` 三色渐变与投影。
字体：Inter Variable（正文）+ JetBrains Mono Variable（读数、标签、时间）；标题字重 600–660，负字距；统计数字等宽并带渐变填充。
语义色：violet / indigo / cyan / mint / pink / amber；数据侧沿用真实序列色，不改动原始数据。
工作台：编辑器保留白纸画布（`#fff` + 大范围投影 + 点阵网格），只有外壳与面板为深色，保证论文图不受界面配色影响。
状态：明确加载、空数据引导、错误可重试、未保存/保存中/已保存/冲突反馈；页面入场有 0.5s 上浮动画，`prefers-reduced-motion` 下关闭。Ctrl+S 保存；Ctrl+Z 撤销；Ctrl+Shift+Z 重做。文本输入保留原生撤销。点击曲线选择序列；点击轴名称/标题选择对应属性。

## 安全与数据语义
仅绑定 loopback，无认证。禁止直接公网部署；未来必须添加认证、项目授权、用户隔离、CSRF 策略与审计。前端 dev proxy 同源访问，无宽泛 CORS。
上传限 10MB、20000 行、100 列；UTF-8 BOM/严格 UTF-8 CSV；错误编码提示转码；重复/空表头拒绝；缺失值为 null；NaN/Infinity 警告并转 null；XLSX 只读取首个 sheet，不执行公式，公式单元格拒绝，拒绝宏格式。异常行宽拒绝。文件名只用于元数据，原文件从不执行。
误差棒只能映射实际非负数值列。热力图要求 x/y 唯一坐标，重复坐标明确提示，不静默求平均。对数坐标非正数显示警告。演示 CSV 明确标为合成数据。

## 测试与交付
Parser 单测覆盖 BOM/中文/缺失/非有限/重复表头/超限/公式；真实 MySQL 集成测试验证项目隔离、版本保存恢复、冲突。组件测试验证编辑/撤销/字段映射；Playwright 浏览器完成主路径与导出，保留截图和导出样本。所有测试报告按实际执行结果记录。Git 本地提交，不推送。

## 目录
```
LabFlow/
  backend/       Maven · controller/service/repository/importer
  frontend/      Vite · components/editor/lib/tests
  docs/          产品架构、API、测试记录与截图
  samples/       明确标记的合成实验 CSV
  scripts/       本地环境启动/停止与验证
  .runtime/      忽略提交：独立 JDK/MySQL 数据/日志
```

参考技术文档：[Spring Boot](https://docs.spring.io/spring-boot/3.5/system-requirements.html)、[Plotly export](https://plotly.com/javascript/plotlyjs-function-reference/)。原创界面，无第三方商业素材。
