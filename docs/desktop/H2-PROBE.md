# H2 兼容性实测报告 — 任务 14-1-2

- 实测日期：2026-10-24
- H2 版本：2.3.232（`com.h2database:h2`，版本由 Spring Boot 3.5.7 BOM 管理，scope runtime）
- 连接参数（与 `backend/src/main/resources/application-desktop.yml` 完全一致）：`MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE`
- 实测载体：`backend/src/test/java/dev/labflow/desktop/H2CompatibilityProbeTest.java`（保留在仓库，作为以后升级 H2 版本时的回归检查；测试内嵌本报告两张表的期望值，行为漂移即失败）。原始表格由测试生成于 `backend/target/h2-probe-report.md`。

## 方法

- **迁移语句逐条**：从 `classpath:db/migration/V*.sql` 读取**原始的**（未改写的）MySQL 迁移脚本，去掉 `--` 注释行后按分号切分（注释里的分号不算分隔符），得到 18 条语句。每条语句在一个**全新的内存 H2 数据库**上执行；执行前先按序重放同文件之前的所有语句（重放失败忽略——只测目标语句本身），这样每条语句面对的 schema 与它在 MySQL 里的真实上下文一致。V 编号 = 文件（V1…V8），`#` 后的数字 = 该文件内第几条语句（从 1 起）。
- **写法探针（U1–U7B）**：针对盘点报告（`docs/desktop/DB-AUDIT-glm-5.3.md`）附录 U1–U7 的每一项，写独立的最小 SQL 场景直接验证。
- 所有结果均为实测（非文档推断）；报错原文保留 H2 的 `[42000-232]` 状态码与 `[*]` 位置标记。

## 原始 MySQL 迁移语句逐条执行（18 条：15 支持 / 3 不支持）

| 编号 | 语句（截断） | 结果 | 报错原文 |
|---|---|---|---|
| V1#1 | CREATE TABLE projects (id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(120) NOT NULL, d… | 支持 | |
| V1#2 | CREATE TABLE experiments (id BIGINT PRIMARY KEY AUTO_INCREMENT, … ON UPDATE CURRENT_TIMESTAMP(3)… | 支持 | |
| V1#3 | CREATE TABLE datasets (…) | 支持 | |
| V1#4 | CREATE TABLE dataset_versions (… original_file LONGBLOB NOT NULL, fields_json JSON NOT NULL…) | 支持 | |
| V1#5 | CREATE TABLE charts (… ON UPDATE CURRENT_TIMESTAMP(3)…) | 支持 | |
| V1#6 | CREATE TABLE chart_versions (…) | 支持 | |
| V2#1 | ALTER TABLE dataset_versions ADD COLUMN parse_rules_json JSON NULL | 支持 | |
| V2#2 | ALTER TABLE projects ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE | 支持 | |
| V3#1 | ALTER TABLE experiments ADD COLUMN status …, ADD COLUMN tags_json …, ADD COLUMN revision … | **不支持** | Syntax error in SQL statement "ALTER TABLE experiments ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'planned'[*],\000a ADD COLUMN tags_json JSON NULL,\000a AD… |
| V3#2 | CREATE TABLE experiment_datasets (复合主键 + 2×外键) | 支持 | |
| V3#3 | ALTER TABLE dataset_versions ADD COLUMN source_meta_json JSON NULL | 支持 | |
| V4#1 | CREATE TABLE style_templates (…) | 支持 | |
| V5#1 | CREATE TABLE agent_runs (… INDEX agent_project_created (project_id, created_at DESC, run_id), INDEX agent_project_chart (…)…) | 支持 | |
| V6#1 | ALTER TABLE agent_runs ADD COLUMN parent_run_id CHAR(36) NULL, ADD INDEX agent_parent (…) | **不支持** | Syntax error in SQL statement "ALTER TABLE agent_runs\000d\000a ADD COLUMN parent_run_id CHAR(36) NULL[*],\000d\000a ADD INDEX agent_parent (project_id, paren… |
| V7#1 | CREATE TABLE agent_sessions (…) | 支持 | |
| V7#2 | ALTER TABLE agent_runs ADD COLUMN session_id CHAR(36) NULL, ADD COLUMN request_hash CHAR(64) NULL, …, ADD INDEX agent_session (…) | **不支持** | Syntax error in SQL statement "ALTER TABLE agent_runs\000d\000a ADD COLUMN session_id CHAR(36) NULL[*],\000d\000a ADD COLUMN request_hash CHAR(64) NULL,\000d\… |
| V8#1 | ALTER TABLE agent_sessions ADD COLUMN turn_count INT NOT NULL DEFAULT 0 | 支持 | |
| V8#2 | ALTER TABLE agent_runs ADD COLUMN turn_index INT NOT NULL DEFAULT 0 | 支持 | |

3 条不支持的语句全部是**同一类形态**：单条 `ALTER TABLE` 里混多个 `ADD COLUMN`（或 `ADD COLUMN` + `ADD INDEX`）。

## MySQL 专有写法探针（8 项：6 支持 / 2 不支持）

| 编号 | 写法 | 结果 | 报错原文 / 细节 |
|---|---|---|---|
| U1 | `TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3)` 默认值 | 支持 | |
| U2 | 列定义 `ON UPDATE CURRENT_TIMESTAMP(3)` | 支持 | 语法层面接受；运行时是否随 UPDATE 触发未测（H2 版脚本按固定规则去掉该子句，见下） |
| U3 | `LONGBLOB` 数据类型 | 支持 | MODE=MySQL 下被接受（等价 BLOB） |
| U4 | `CREATE TABLE` 内联 `INDEX`（含 `DESC` 索引列，V5:34-35 写法） | 支持 | |
| U5 | 单条 ALTER 混合多列 / 列+索引（V3:1-3、V6、V7:14-19 写法） | **不支持** | Syntax error in SQL statement "ALTER TABLE probe_u5 ADD COLUMN x INT[*], ADD COLUMN y INT" [42000] |
| U6 | `SELECT … FOR SHARE`（`AgentAuditRepository.java:190`） | **不支持** | Syntax error in SQL statement "SELECT id FROM probe_u6 FOR [*]SHARE" [42000-232] |
| U7 | `TIMESTAMPDIFF(MICROSECOND, …)`（`AgentAuditRepository.java:104`） | 支持 | |
| U7B | `REPEATABLE_READ` 事务隔离级别（JDBC `setTransactionIsolation`，`BackupService.java:116`） | 支持 | JDBC 层接受；Spring/连接池全链路在 14-1-4 双库集成测试验证 |

## 逐条对照盘点报告（DB-AUDIT-glm-5.3.md）的判断

| 盘点判断 | 盘点结论 | 把握 | 实测结果 | 对照 |
|---|---|---|---|---|
| U1 `CURRENT_TIMESTAMP(3)` 精度默认值 | 支持 | 较确定 | 支持 | **证实** |
| 附录 U2 `CREATE INDEX … (col DESC)` 接受性 | 支持 | 较确定 | 支持（V5#1 含 DESC 通过） | **证实** |
| §1 V5:34-35 内联 INDEX「不支持」 | 不支持，需外置为 CREATE INDEX | 确定 | 支持 | **推翻**——H2 2.3.232 接受 `CREATE TABLE` 内 `INDEX name (cols)`（含 DESC）。H2 版脚本按「能原样保留的就保留」原样保留内联 INDEX |
| 附录 U3 多列 ADD COLUMN 不支持 | 不支持 | 较确定 | 不支持（V3#1、V6#1、V7#2、U5 均报语法错） | **证实** |
| 附录 U4 无 LONGBLOB | 不支持 | 较确定 | 支持 | **推翻**——MODE=MySQL 下 `LONGBLOB` 关键字被接受。H2 版 `V1` 的 `original_file LONGBLOB NOT NULL` 原样保留 |
| 附录 U5 `FOR SHARE` | 不确定 | 不确定 | **不支持**（[42000-232]） | **证实不支持**——按 14-1-3.3 统一降级为 `FOR UPDATE`（锁变强、语义不变） |
| 附录 U6 `TIMESTAMPDIFF(MICROSECOND)` | 不确定 | 不确定 | **支持** | **落定：支持**——但 14-1-3.2 仍按任务书固定要求改为 Java 计算延迟（与支持与否无关的固定改写） |
| 附录 U7 `REPEATABLE_READ` | 不确定 | 不确定 | JDBC 层支持 | **部分落定**——14-1-3.4 无需改代码；Spring 全链路由 14-1-4 的 H2 集成测试（含 BackupService 导出）验证 |
| 附录 U8 `flyway-database-h2` 依赖 | 需要显式加入 | 较确定 | 不需要 | **推翻**——flyway-core 11.7.2 自带 H2 支持（`org/flywaydb/core/internal/database/h2/H2DatabaseType` 等类已在 jar 内），且 Boot 3.5.7 BOM 不管理该 artifact 版本；14-1-1 据此**未**添加该依赖 |
| 附录 U9 H2 会话时区 round-trip | 不确定 | 不确定 | 未在本探针范围 | **转 14-1-3.5**——测试统一 `-Duser.timezone=UTC` + Instant round-trip 测试验证 |
| §1 V1:2、V1:5 `ON UPDATE CURRENT_TIMESTAMP(3)`「H2 无此语法」 | 不支持 | 确定 | 语法**支持** | **推翻（语法层面）**——但 H2 版脚本仍按任务书固定规则去掉该子句、由 14-1-3 在 UPDATE 语句显式赋值：理由从「H2 无此语法」修正为「方案固定决策 + 语义由代码保证（运行时触发行为未测、无需依赖）」 |
| §1 JSON 列：DDL 支持但字符串双重编码陷阱 | DDL 可用、必须改 CLOB | 确定 | DDL 确实支持（V1#2/#4、V2#1 等带 `JSON` 的建表全部通过） | **证实**（DDL 部分）——12 个 JSON 列改 CLOB 是任务书固定规则（陷阱规避），不因 DDL 支持而改变 |
| §1 `AUTO_INCREMENT`、复合主键、外键、`TIMESTAMP(3)`、`UNIQUE(...)` | 支持 | 确定 | 支持 | **证实** |

小结：盘点报告 9 个不确定项（U1–U9）中，**7 个被实测直接消解**（U1、U2、U3、U4、U5、U6、U7 的 JDBC 层），U8 在 14-1-1 消解，U9 转入 14-1-3.5。两个「确定/较确定」级别的判断被推翻（内联 INDEX、LONGBLOB），一个语法层面被推翻但改写规则不变（ON UPDATE）——这也是把探针测试留在仓库里作为 H2 升级回归检查的原因。

## 实测结论如何落进 `db/migration-h2/`（V1–V8，与 MySQL 版文件名一一对应）

> **路径偏差（14-1-3 实测发现）**：任务书写的是 `db/migration/h2/`，实际放在与 `db/migration/` **平级**的 `db/migration-h2/`。原因：Flyway 11 的 `classpath:` 位置会**递归扫描子目录**——`db/migration/h2/` 一旦存在，默认 MySQL profile（`locations=classpath:db/migration`，任务书要求一行不改）会把两套 V1–V8 一起扫出来，启动即报 `Found more than one migration with version 1: …db\migration\h2\V1__workspace.sql …db\migration\V1__workspace.sql`（第一次在 MySQL 上启动带 Spring 上下文的集成测试时实测复现）。Flyway 11.7.2 没有 `classpathpath:` 之类的非递归前缀（jar 内字符串检索为 0 处），因此唯一不触碰默认配置的做法是把 H2 脚本目录移出 `db/migration/` 子树。

| 改动 | 处数 | 依据 |
|---|---|---|
| JSON 列 → `CLOB` | 12 列（V1×6、V2×1、V3×2、V4×1、V5×2） | 任务书固定规则（不看实测）：代码以字符串读写 JSON，H2 的 JSON 类型会给 String 参数再包一层引号 |
| `ON UPDATE CURRENT_TIMESTAMP(3)` 去掉 | 2 处（V1 experiments/charts 的 updated_at） | 任务书固定规则：由 14-1-3 在 UPDATE 语句显式赋值 |
| 单条多列/混合 ALTER 拆分 | 3 条（V3#1→3 条 ALTER；V6#1→1 ALTER+1 CREATE INDEX；V7#2→4 ALTER+1 CREATE INDEX） | 实测不支持（V3#1、V6#1、V7#2 报语法错） |
| `LONGBLOB` 保留 | 1 处（V1 dataset_versions.original_file） | 实测支持，能原样保留的就保留 |
| V5 内联 INDEX 保留 | 2 个（agent_project_created、agent_project_chart） | 实测支持（含 DESC） |
| 其余语句 | — | 逐字与 MySQL 版一致 |

每个 h2 脚本文件头一行注释写明对应 MySQL 文件与改动内容。`MigrationParityTest`（`backend/src/test/java/dev/labflow/desktop/MigrationParityTest.java`）校验两个目录的版本号集合完全相同；AGENTS.md「桌面版后端授权」一节已补：「新增迁移必须同时提供 MySQL 和 H2 两个版本」。

## 强杀落盘实测（`WRITE_DELAY`，14-1-4 验收发现）

`scripts/test-agent.ps1` 的 audit-restart 环节会在写入两条 agent 运行记录后**立刻强杀**后端进程再重启验证数据仍在。H2 默认不这样做：MVStore 把已提交的数据缓存在内存、延迟约 1 秒才写盘（`org.h2.mvstore.MVStore` 的 auto-commit delay），进程被 `TerminateProcess`（崩溃、断电、任务管理器结束进程都是同类）时这段数据丢失。实测（H2 2.3.232，`Runtime.halt(137)` 后重开同一个文件库）：

| URL | 强杀后重开 |
|---|---|
| `jdbc:h2:file:…;MODE=MySQL;DATABASE_TO_LOWER=TRUE`（默认写缓冲） | 数据库为空——建表和提交过的 INSERT 全部丢失 |
| 同上 + `;WRITE_DELAY=0` | 提交过的行全部仍在 |

E2E 里的现象与此一致：重启后 Flyway 报 `Current version of schema "public": 8`（旧数据早已落盘），但强杀前最后写入的项目 94 和两条运行记录没了，`GET /projects/94/agent/runs/{id}/audit` 返回 404。

结论：`application-desktop.yml` 和 `test-agent.ps1` 的 H2 文件库 URL 统一带 `WRITE_DELAY=0`（提交即落盘）。桌面应用写入频率是人手速级别，同步写盘的代价可以忽略；换来的是崩溃/强杀不丢已提交数据。
