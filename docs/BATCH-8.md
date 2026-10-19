# 第八批：科研成果复用与交付

本批补齐个人样式、跨数据集图表复用、项目备份恢复及矢量 PDF；继续以真实功能和协议一致为先。

## 合同

- 样式模板 schema_version=1，归属创建时的项目，可在本机所有项目中选用。服务端从合法图表配置提取白名单外观；不含数据标识、字段、标题、过滤、轴范围/对数、统计阈值或注释内容。应用进入撤销栈，序列外观按顺序循环。
- 图表复用显式选择目标数据版本并确认字段对应；所有仍保存的字段引用（含暂未启用的专业设置）都必须映射。目标列类型校验、绘图和服务端保存校验通过后创建新图；源图及原始数据不变。
- 项目备份格式 labflow-project-v1：ZIP 内仅 manifest.json 和 SHA-256 校验文件。包含项目、实验及关联、全部数据版本和原文件、全部图表版本、该项目创建的样式模板。数据库 JSON 原文保存，避免数值重新编码。不是数据库整体备份，也不含其他项目或本机草稿。
- 恢复始终创建新项目；在事务中映射项目、实验、数据集、数据版本、图表和模板 ID，仅改写协议定义的引用，实验参数/指标中的数字不作为 ID 处理。保留版本、revision、时间和内容指纹。预览只读，提交重新校验；损坏、未知格式、缺失引用、重复 ID、超限拒绝，失败回滚。校验和用于检测损坏，不代表可信发布者或数字签名。
- PDF 从同一 Plotly SVG 转换，保留矢量图形和可选物理尺寸；字体与 Unicode 兼容性必须验证，禁止将 PNG 包装成 PDF 冒充矢量导出。

## API

`GET /api/style-templates`；`POST /api/projects/{p}/style-templates {name,config}`；`DELETE /api/style-templates/{id}`。

`GET /api/projects/{p}/backup` 下载；`POST /api/backups/preview` multipart file 只读检查；`POST /api/backups/restore` multipart file + name 创建新项目。归档项目可备份，恢复项目默认未归档。源文件仍限 10 MB；备份压缩文件限 64 MiB、展开限 96 MiB、只允许两个固定条目且不写上传路径。

新增 Flyway V4 样式模板表。旧图表 schema_version=1 不迁移；所有外观与复用产生标准配置，仍通过已有保存 API。

## 验收

覆盖模板隔离绑定与非法配置；字段映射完整性和类型；真实 MySQL 全版本备份恢复、派生数据及实验快照引用重建、损坏归档拒绝且无残留；浏览器完成模板保存应用、字段改名后的图表复用、备份下载预览恢复和 PDF/SVG/PNG 导出。

## 使用与运行

```powershell
cd 'D:\RAG-agent项目\LabFlow'
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
node scripts/seed-delivery-demo.mjs
```

打开 `http://127.0.0.1:5176/`，选择“成果复用与交付 · 合成演示”。脚本幂等创建两份合成学习曲线、两条实验记录、两张图的三份快照和一个样式；不修改已有用户项目。示例值仅演示软件，不作为真实模型证据。选择 β 图可直接导出内置字体的 89 mm 图版。

- 编辑器左侧“样式与图表复用”：保存/应用/删除个人样式；切换“复用到其他数据集”逐项选择列，保存新图。模板可跨项目选用，整图复制首版在同项目不同数据版本间进行。
- 顶部“管理项目”：默认备份当前项目，也能选择其他项目；下载后通过文件选择器预览统计，指定名称恢复新项目。恢复不会自动切走当前未保存的工作区。
- “导出”选择 PDF，需将画布字体显式切为 Noto Sans SC 并预览。常规、粗体与字体覆盖内的中英文字形支持；缺失字形、斜体/混合字体富文本或无法保持的字符布局会报错。编辑器输入仍按纯文本处理；转换器单独验证了 SVG 多行 tspan 的定位，并不把输入中的 HTML 当作代码或富文本执行。

测试命令（先启动本地服务；Java 21 与本地 MySQL 配置沿用项目脚本）：

```powershell
$env:JAVA_HOME=(Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn -f backend/pom.xml test
cd frontend
npm test
npm run build
npm run e2e
cd ..
# 可选 PDF 文件 QA，仅开发验收需要 PyMuPDF
python -m pip install pymupdf
python scripts/check-pdf.py
```

运行应用无需 Python。字体已随源码提供，字体重建脚本仅是可选开发工具，见 [字体来源与许可证](../frontend/public/fonts/README.md)。PDF 使用 MIT 的 [jsPDF](https://github.com/parallax/jsPDF) 与 [svg2pdf.js](https://github.com/yWorks/svg2pdf.js)，均按需加载；运行时不请求外部 API。

## 实测结果与变更

2026-10-19：Java **56/56**、Vitest **64/64**、完整本机 Chrome E2E **23/23（1.7 分钟）**、TypeScript/Vite 构建通过。Java 新增 5 项真实 MySQL 集成验收，前端新增 5 项函数/交互验收，Chrome 新增 3 条流程。补强模板嵌套白名单后，再跑 Java 全部测试及新增 3 条浏览器流程。npm audit 0 项漏洞；未执行远端 CI。

实际 PDF 为单页 **89 × 58.553 mm**，文本含中文与 Greek α，包含 26 个矢量绘制对象、0 个 image；嵌入字体子集约 253 KB，压缩成品约 44 KB。8 pt 基础字号和文字位置保持一致，标题中心误差约 0.001 pt。另验粗体热力图（20 个矢量绘制对象、0 个 image）及多行文字/± 字形。视觉核对了页面、文字、轴、色块和边距；没有把 PNG 包装为 PDF。

修复了开发服务器首次动态发现 PDF 依赖时刷新工作区的问题；依赖预发现不使 PDF 成为首页首包。修复了 Chrome 模态状态下 SVG 转换器测量节点字号陈旧导致的文字锚点偏移：在离屏 SVG 中固定浏览器计算的字形 run 起点，保留矢量可选文本。Plotly 按需包约 4.96 MB，仍有体积提示；没有做专项性能或首页动效调整。内置字体文件约 20.8 MB，仅选择字体或导出时加载。

新增 DeliveryController / StyleTemplateService / BackupService、Flyway V4、模板与映射对话框、项目备份面板、PDF 转换/字形检查与本地字体、导出状态反馈、测试与合成示例。保留图表 schema v1、原保存 API、乐观锁、原始文件与不可变版本合同。备份恢复中仅明确 ID 引用重建；JSON 原文与派生数值编码保留，记录中显示用的历史编号仍作为原始文本保存。

截图：[合成演示工作台](screenshots/delivery-demo.png)、[明确字段映射](screenshots/figure-reuse.png)、[恢复预览](screenshots/project-delivery.png)。实际导出：[PDF](exports/reusable-figure.pdf)、[SVG](exports/reusable-figure.svg)、[PNG](exports/reusable-figure.png)、[PDF 渲染预览](exports/reusable-figure-pdf-preview.png)。机器核查证据见 [PDF QA](test-evidence/batch8-pdf.json)。

边界：备份只涵盖单项目和该项目创建的模板，不是整个 MySQL 实例备份，也不包含本机草稿。只允许恢复到新项目；不提供覆盖/合并恢复、自动跨文件样本配对、外部字体 PDF 或团队共享。旧的本地单用户安全边界不变，公开部署仍须认证、授权与隔离。本批不自动推送远端。
