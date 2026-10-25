# FigTide（LabFlow）数据库兼容性审计报告 — 任务 14-0

- 审计模型：glm-5.3
- 审计日期：2026-10-24
- 审计对象：`LabFlow`（已更名 FigTide）后端数据库层，MySQL 8.0 → H2（MODE=MySQL）桌面化兼容性
- 方式：**只读审计**。未改动任何代码、Flyway 迁移、配置或文档（本报告是唯一新增文件）。所有行号均来自当前仓库源码实测。
- 输入：`figtide-desktop-14-0.zip` 中 `docs/development/desktop/DESKTOP-PLAN.md` 与 `docs/development/tasks/14-0-db-audit.md`；仓库 `AGENTS.md` 硬约束（不改后端 / 不改 Flyway 迁移 / 预算与幂等逻辑一行不动）。

## 结论速览

- 迁移脚本 8 个文件 91 行，全部可改写为 H2 版本；改写集中四类：**JSON→CLOB（12 列）**、**ON UPDATE CURRENT_TIMESTAMP(3)（2 处，最大语义缺口）**、**索引语法（内联 INDEX 2 处 + ALTER ADD INDEX 2 处）**、**多列 ADD COLUMN / LONGBLOB（MySQL 专属语法）**。
- Java 主代码 **没有** ON DUPLICATE KEY / LAST_INSERT_ID / GROUP_CONCAT / IFNULL / `LIMIT a,b` / SQL 级 JSON 函数 —— DESKTOP-PLAN「应用层 JSON、选 H2」的前提经代码证实成立。
- `FOR UPDATE` 共 5 处（4 个并发场景），H2 支持；`FOR SHARE` 1 处（H2 支持性待验证）。
- 备份/恢复**不包含 agent_runs / agent_sessions**：桌面迁移会丢失助手运行历史、会话与预算用量（回答 DESKTOP-PLAN §4 的提问：**不包含，会丢失**）。
- 前端 `api.ts` 是相对路径同源调用，无硬编码 host/port；但**后端目前不服务 frontend/dist**，且 `LocalOriginFilter` 白名单写死 5176/8086 —— 随机端口的桌面 launcher 必须解决这两点（14-2）。
- 共 9 个不确定项，全部给出验证方法（见附录）；建议 14-1 先写一个最小 H2 smoke 建表测试，一次性消解 U1–U7。

---

## 1. 迁移脚本逐行审计（V1–V8，共 8 文件 91 行）

目录：`LabFlow/backend/src/main/resources/db/migration/`。全部脚本无 charset/collate 子句（utf8mb4 仅在 `scripts/start.ps1` 建库时设置），无存储引擎子句，无存储过程/触发器/视图。**H2 改写脚本应放独立目录 `db/migration/h2/`（DESKTOP-PLAN 已定），原 MySQL 迁移一行不动**（满足 AGENTS.md 硬约束）。

把握等级：确定 = 文档级公认行为或已实测；较确定 = 高置信但建议 smoke 验证；不确定 = 需实测（见附录验证方法）。

### V1__workspace.sql（6 行）

| 文件:行 | 原文（关键片段） | 类别 | H2 MODE=MySQL | 改写建议 | 把握 |
|---|---|---|---|---|---|
| V1:1 | `id BIGINT PRIMARY KEY AUTO_INCREMENT`（projects） | 自增主键 | 支持 | 无 | 确定 |
| V1:1,3,4,5,6 | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)` | 精度时间戳默认值 | 支持（H2 `TIMESTAMP(p)` 0–9、`CURRENT_TIMESTAMP(p)`） | 无 | 较确定（U1） |
| V1:2 | `parameters JSON NOT NULL, metrics JSON NOT NULL`（experiments） | MySQL JSON 列 | H2 2.x 有 JSON 类型，但 Java String 直写会被包一层 JSON 字符串（双重引号陷阱） | `CLOB NOT NULL` | 确定（改写必要） |
| V1:2 | `updated_at TIMESTAMP(3) ... ON UPDATE CURRENT_TIMESTAMP(3)`（experiments） | MySQL 专属 ON UPDATE | **不支持** | 去掉子句；UPDATE 语句显式 `updated_at=CURRENT_TIMESTAMP(3)`（对 MySQL 同样成立） | 确定（H2 无此语法） |
| V1:4 | `original_file LONGBLOB NOT NULL` | MySQL 专属大对象类型 | 不支持 LONGBLOB 关键字 | `BLOB NOT NULL` | 较确定（U4） |
| V1:4 | `fields_json/rows_json/warnings_json JSON NOT NULL` | MySQL JSON 列 | 同上陷阱 | `CLOB NOT NULL` | 确定 |
| V1:4,6 | `UNIQUE(dataset_id,version)`、`UNIQUE(chart_id,version)` | 表约束 | 支持 | 无 | 确定 |
| V1:2,3,4,5,6 | `FOREIGN KEY(...) REFERENCES ...` | 外键 | 支持 | 无 | 确定 |
| V1:5 | charts.updated_at 同 V1:2 的 ON UPDATE | MySQL 专属 | 不支持 | 同 V1:2 | 确定 |

### V2__import_rules_and_archive.sql（2 行）

| 文件:行 | 原文 | 类别 | H2 | 改写 | 把握 |
|---|---|---|---|---|---|
| V2:1 | `ALTER TABLE dataset_versions ADD COLUMN parse_rules_json JSON NULL` | 单列 ADD COLUMN + JSON | ADD COLUMN 支持；JSON 陷阱同上 | `ADD COLUMN parse_rules_json CLOB NULL` | 确定 |
| V2:2 | `ALTER TABLE projects ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE` | 单列 ADD COLUMN | 支持 | 无 | 确定 |

### V3__experiment_comparisons.sql（11 行）

| 文件:行 | 原文 | 类别 | H2 | 改写 | 把握 |
|---|---|---|---|---|---|
| V3:1-3 | `ALTER TABLE experiments ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'planned', ADD COLUMN tags_json JSON NULL, ADD COLUMN revision INT NOT NULL DEFAULT 1` | **单条语句多列 ADD COLUMN**（MySQL 专属） | H2 `ALTER TABLE ADD COLUMN` 一次一列 | 拆成 3 条 ALTER；tags_json 用 CLOB | 较确定（U3） |
| V3:4-10 | `CREATE TABLE experiment_datasets (... PRIMARY KEY(experiment_id,dataset_version_id), 2×FOREIGN KEY)` | 复合主键 + 外键 | 支持 | 无 | 确定 |
| V3:11 | `ALTER TABLE dataset_versions ADD COLUMN source_meta_json JSON NULL` | 单列 ADD + JSON | 同上 | `CLOB NULL` | 确定 |

### V4__style_templates.sql（9 行）

| 文件:行 | 原文 | 类别 | H2 | 改写 | 把握 |
|---|---|---|---|---|---|
| V4:2 | `id BIGINT PRIMARY KEY AUTO_INCREMENT` | 自增主键 | 支持 | 无 | 确定 |
| V4:6 | `profile_json JSON NOT NULL` | MySQL JSON 列 | 陷阱同上 | `CLOB NOT NULL` | 确定 |
| V4:7 | `created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)` | 时间默认 | 支持 | 无 | 较确定（U1） |
| V4:8 | `FOREIGN KEY (project_id) REFERENCES projects(id)` | 外键 | 支持 | 无 | 确定 |

### V5__agent_audit.sql（37 行，单条 CREATE TABLE agent_runs）

| 文件:行 | 原文 | 类别 | H2 | 改写 | 把握 |
|---|---|---|---|---|---|
| V5:2 | `run_id CHAR(36) PRIMARY KEY`（无自增，应用生成 UUID） | 字符主键 | 支持 | 无 | 确定 |
| V5:5 | `chart_id BIGINT NULL` | 可空外键列 | 支持 | 无 | 确定 |
| V5:27-28 | `trace_json JSON NOT NULL, proposal_json JSON NULL` | MySQL JSON 列 | 陷阱同上 | `CLOB` | 确定 |
| V5:31-33 | `created_at TIMESTAMP(3) NOT NULL, finished_at TIMESTAMP(3) NULL, decision_at TIMESTAMP(3) NULL`（无默认，应用写入） | 精度时间戳 | 支持 | 无 | 确定 |
| V5:34 | `INDEX agent_project_created (project_id, created_at DESC, run_id)` | **CREATE TABLE 内联 INDEX（MySQL 专属）** + 索引列 DESC | 不支持内联 INDEX | 移出为 `CREATE INDEX agent_project_created ON agent_runs(project_id, created_at DESC, run_id)` | 内联改外置：确定；DESC 接受性：较确定（U2） |
| V5:35 | `INDEX agent_project_chart (project_id, chart_id, created_at DESC)` | 同上 | 同上 | 同上外置 | 同上 |
| V5:36 | `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE` | 级联外键 | 支持 | 无 | 确定 |

### V6__agent_refinements.sql（3 行）

| 文件:行 | 原文 | 类别 | H2 | 改写 | 把握 |
|---|---|---|---|---|---|
| V6:1-3 | `ALTER TABLE agent_runs ADD COLUMN parent_run_id CHAR(36) NULL, ADD INDEX agent_parent (project_id, parent_run_id, status)` | **列 + 索引混在一条 ALTER**（MySQL 专属） | 均不支持此形态 | 拆为 `ADD COLUMN parent_run_id CHAR(36) NULL` + `CREATE INDEX agent_parent ON agent_runs(project_id, parent_run_id, status)` | 确定 |

### V7__agent_session_budgets.sql（19 行）

| 文件:行 | 原文 | 类别 | H2 | 改写 | 把握 |
|---|---|---|---|---|---|
| V7:1-13 | `CREATE TABLE agent_sessions (... created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY ... ON DELETE CASCADE)` | 建表 | 支持 | 无 | 较确定（U1） |
| V7:14-19 | `ALTER TABLE agent_runs ADD COLUMN session_id CHAR(36) NULL, ADD COLUMN request_hash CHAR(64) NULL, ADD COLUMN reservation BIGINT NOT NULL DEFAULT 0, ADD COLUMN session_charge BIGINT NOT NULL DEFAULT 0, ADD INDEX agent_session (project_id, session_id, created_at)` | **多列 ADD + ADD INDEX 混合**（MySQL 专属） | 不支持 | 拆为 4 条 ADD COLUMN + 1 条 CREATE INDEX | 确定 |

### V8__agent_session_order.sql（2 行）

| 文件:行 | 原文 | 类别 | H2 | 改写 | 把握 |
|---|---|---|---|---|---|
| V8:1 | `ALTER TABLE agent_sessions ADD COLUMN turn_count INT NOT NULL DEFAULT 0` | 单列 ADD | 支持 | 无 | 确定 |
| V8:2 | `ALTER TABLE agent_runs ADD COLUMN turn_index INT NOT NULL DEFAULT 0` | 单列 ADD | 支持 | 无 | 确定 |

**改写汇总**：JSON→CLOB 共 **12 列**（V1:6、V2:1、V3:2、V4:1、V5:2）；ON UPDATE CURRENT_TIMESTAMP(3) 共 **2 处**（V1:2、V1:5）；内联 INDEX **2 处**（V5:34-35）；ALTER ADD INDEX **2 处**（V6:1-3、V7:14-19）；多列 ADD COLUMN 语句 **3 条**（V3:1-3、V6:1-3、V7:14-19）；LONGBLOB **1 处**（V1:4）。其余 ~70 行为标准 SQL，H2 直接兼容。

---

## 2. Java SQL 审计

### 2.1 FOR UPDATE（5 处，4 个并发场景）

| 位置 | SQL | 保护的并发语义 |
|---|---|---|
| `backend/src/main/java/dev/labflow/repository/AgentAuditRepository.java:41` | `SELECT * FROM agent_runs WHERE project_id=? AND run_id=? FOR UPDATE`（`lock()`） | 运行结束的幂等转换（pending→终态只发生一次）、父提案 supersede 前的状态校验（`AgentAuditService.begin()` L38-、`finish()` L95-、`decide()` L290- 都先锁后判）。**预算幂等的关键路径，AGENTS.md 硬约束 5 覆盖，不可改语义。** |
| `AgentAuditRepository.java:141` | `SELECT * FROM agent_sessions WHERE project_id=? AND session_id=? FOR UPDATE`（`lockSession()`） | 预算预留/结算串行化：`reserved_budget`/`used_budget`/`turn_count`（L158 `turn_count=turn_count+1,reserved_budget=reserved_budget+?`）的读-改-写；begin 时校验会话绑定的 chart/dataset 未漂移 |
| `AgentAuditRepository.java:190` | `SELECT revision FROM charts WHERE project_id=? AND id=? FOR SHARE`（`chartRevision()`） | 提案生成时钉住源图表 revision（乐观锁基线）。**FOR SHARE 是 MySQL 8 语法，H2 支持性不确定（U5）**；若不支持，降级为 FOR UPDATE（锁更强，语义仍正确） |
| `backend/src/main/java/dev/labflow/service/WorkspaceService.java:227` | `SELECT id FROM datasets WHERE id=? AND project_id=? FOR UPDATE`（`upload()` `@Transactional` L212 内） | 数据集版本号分配 `COALESCE(MAX(version),0)+1`（L231）防并发上传抢同一版本号 |
| `backend/src/main/java/dev/labflow/service/ExperimentService.java:103` 与 `:203-211` | experiments 行锁（编辑 + revision 冲突检查）；对排序后的选择 id 循环加锁（比较快照一致性，L202 注释 "Consistent lock ordering prevents deadlocking"） | 实验编辑乐观锁、多选比较的一致性快照；两处均在 `@Transactional(isolation = READ_COMMITTED)`（L78、L183）内 |

H2（MODE=MySQL）支持行级 `FOR UPDATE`（MVStore）—— 这也是 DESKTOP-Plan 否决 SQLite 的原因，经代码证实该理由成立（5 处依赖）。

### 2.2 MySQL 专属/非标准函数与语法

| 位置 | SQL 片段 | H2 兼容性 |
|---|---|---|
| `AgentAuditRepository.java:104` | `latency_ms=TIMESTAMPDIFF(MICROSECOND,created_at,CURRENT_TIMESTAMP(3))/1000`（`recover()`，@Transactional L91，标记其他实例中断的运行并结算预留） | TIMESTAMPDIFF 函数 H2 有，但 **MICROSECOND 单位是否支持不确定（U6）**。改写建议：取出 created_at 在 Java 里算延迟（字段仅信息性） |
| `AgentAuditRepository.java:104` | `finished_at=CURRENT_TIMESTAMP(3)`、`usage_complete=FALSE` | CURRENT_TIMESTAMP(3) 同 U1；FALSE 字面量 H2 支持 |
| `AgentAuditRepository.java:87` | `ORDER BY created_at DESC,run_id DESC LIMIT ? OFFSET ?`（参数化分页） | H2 支持 LIMIT ? OFFSET ? |
| `AgentAuditRepository.java:49` | `LIMIT 1` | 支持 |
| `AgentAuditRepository.java:17-20` | INSERT 内联字面量 `'queued','running','[]'` 混 `?` | 标准 SQL，支持 |
| `AgentAuditRepository.java:27` | `status IN ('queued','running')`（幂等守卫） | 支持 |
| `WorkspaceService.java:231` | `SELECT COALESCE(MAX(version),0)+1 n FROM dataset_versions WHERE dataset_id=?` | COALESCE 标准，支持 |
| `WorkspaceService.java:356-363` | `UPDATE charts SET name=?,revision=revision+1 WHERE ... AND revision=?`（≠1 → 409） | 标准 SQL，支持 |
| 全仓 grep | **ON DUPLICATE KEY / INSERT IGNORE / REPLACE INTO / GROUP_CONCAT / IFNULL / `LIMIT a,b`（逗号偏移式）/ LAST_INSERT_ID / SQL 级 JSON 函数：主代码 0 命中** | —— DESKTOP-Plan「应用层 JSON」前提成立 |

### 2.3 自增主键取回

`backend/src/main/java/dev/labflow/repository/WorkspaceRepository.java:31-41` `insert()`：`GeneratedKeyHolder` + `connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)` → `key.getKey().longValue()`。所有服务统一走此包装（L17-29 query/one/update）。这是 JDBC 标准生成键路径，**H2 支持**（MySQL 兼容模式下 IDENTITY 语义一致）——不依赖 MySQL `LAST_INSERT_ID()` 会话变量。✓

### 2.4 时区处理

- `application.yml:6` 默认 URL 带 `serverTimezone=UTC&forceConnectionTimeZoneToSession=true` —— **MySQL Connector/J 专属参数**。H2 URL 必须剔除：H2 对 URL 未知参数直接抛异常（严格解析），这不是可忽略参数。
- `application.yml:14` `jackson.time-zone: UTC` —— JSON 层，与 JDBC 无关，profile 无关，保留。
- 时间戳读写全部经 `java.sql.Timestamp`（`BackupService.row()` L165 `t.toInstant().toString()`；`AgentAuditService` `Timestamp.from(Instant.now())`），instant 语义时区无关。风险在 H2 会话时区 = JVM 默认时区（桌面用户本地时区）与 MySQL 侧 UTC 的差异 → U9，建议 launcher 统一 `-Duser.timezone=UTC`（见 R13）。

### 2.5 TIMESTAMP(3) / JSON / BLOB 读写风格

- **TIMESTAMP(3)**：列精度毫秒，MySQL 与 H2 的 `TIMESTAMP(3)` 均映射 `java.sql.Timestamp`（毫秒精度），round-trip 一致。✓
- **JSON 列（12 个）**：全部「字符串进、字符串出」：`WorkspaceService.java:27-41` `encode()`（Jackson `writeValueAsString` → `setObject`）/ `decode()`（行值 `.toString()` → `readValue`）。覆盖 config_json / fields_json / rows_json / warnings_json / parse_rules_json / source_meta_json / parameters / metrics / tags_json（`ExperimentService.java:116` 同样 toString 读取）/ profile_json（`StyleTemplateService.java:111-118`、L132 写入）/ trace_json / proposal_json（AgentAuditRepository 经同一包装）。**这正是 H2 用 CLOB 替代 JSON 列后仍成立的原因**；唯一陷阱是若 H2 保留 JSON 类型则 String 参数被再包一层（DESKTOP-Plan 已识别，本审计经代码证实其判断正确）。
- **BLOB**：`WorkspaceService.java:245-257` INSERT dataset_versions，`original_file` 以 `byte[]` 传参（L252）；`BackupService.row()` L166 `byte[]`→Base64。H2 `BLOB` 同为 byte[] 绑定。✓
- **decimal-strings-v1**：`ProcessingService.java:130-143` `storageRows()` 注释「MySQL JSON 的 binary-double 转换可能改变最后一位小数」→ 数据行数字以字符串存储。这是 MySQL JSON 专属规避；H2 CLOB 存字符串行为一致，**无需改动**，且 MySQL→H2 迁移时该编码原样搬运，跨库 round-trip 一致。✓

### 2.6 事务隔离级别

- `ExperimentService.java:78、183` 显式 `READ_COMMITTED` —— H2 MVStore 支持。✓
- `BackupService.java:116` `@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)` —— 导出一致性快照。**H2 对 REPEATABLE_READ 的支持/映射不确定（U7）**：若 H2 不支持该级别（H2 2.x 文档级隔离级别为 READ COMMITTED / SERIALIZABLE 等），Spring 可能抛异常或被静默降级。备份导出是桌面迁移（14-3）的载体，必须在 14-1 双库验证。

### 2.7 测试守卫（MySQL-only 正则）

- `TestSupportController.java:25-27`：`isolated = url.matches("jdbc:mysql://[^/]+/labflow_(test|e2e)(\\?.*)?")` —— H2 URL 下测试清理端点直接 403。
- `eval/ServerEvaluationTest.java:42-45` 与 `eval/EvaluationRunner.java:64`：`jdbc:mysql://...33316/...` 守卫正则，仅放行本机 MySQL。
- 以上 3 处不改动则 H2 测试跑不起来（详见 §3.3）。

---

## 3. 依赖与配置

### 3.1 backend/pom.xml 现状（DB 相关）

| 依赖 | 作用 | H2 桌面化需要 |
|---|---|---|
| `spring-boot-starter-parent 3.5.7`（Java 21） | Flyway 11.x 由 BOM 管理 | — |
| `spring-boot-starter-jdbc` | JdbcTemplate（无 JPA） | 保留 |
| `org.flywaydb:flyway-mysql` | MySQL 迁移（传递 flyway-core） | 保留（dev profile） |
| `com.mysql:mysql-connector-j`（runtime） | MySQL 驱动 | 保留（dev profile） |
| `commons-csv 1.14.1`、`poi-ooxml 5.4.1` | 数据解析 | 无关 |
| `spring-boot-starter-test` | 测试 | 无关 |

**缺**：`com.h2database:h2`（desktop profile 的 runtime + H2 测试的 test scope）；**`org.flywaydb:flyway-database-h2`** —— Flyway 10 起数据库支持模块化，H2 支持独立成 artifact（较确定，U8：验证 Boot 3.5.7 BOM 是否管理其版本 / `mvn dependency:tree`）。无 Testcontainers。

### 3.2 application.yml（backend/src/main/resources/application.yml，16 行）现状

- L1-3：`server.address: 127.0.0.1`、`port: ${LABFLOW_PORT:8086}` —— 绑定本地 ✓（与 DESKTOP-Plan 一致）
- L6：单一 `datasource.url` `${LABFLOW_DB_URL:jdbc:mysql://127.0.0.1:33316/labflow?...&serverTimezone=UTC&forceConnectionTimeZoneToSession=true}` —— **无 profile 切分**
- L10-12：multipart 64MB/65MB（与 BackupService 64MiB zip 上限配套）
- L14：jackson UTC
- L15-16：`flyway.enabled: true`，默认 locations `classpath:db/migration` —— **无 h2/ 目录拆分**

14-1 需要：`application-desktop.yml`（或等价 profile）—— `jdbc:h2:file:<data>/labflow;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE`（**不带** serverTimezone 等 MySQL 参数）+ `flyway.locations: classpath:db/migration/h2`。MySQL profile 走原配置不动。

### 3.3 测试接线（H2 化的障碍清单）

- **11 个集成测试类**硬编码 `@SpringBootTest(properties = "spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_test?...serverTimezone=UTC")`：WorkspaceIntegrationTest:18、ExperimentIntegrationTest:18、ClassificationIntegrationTest:19、DeliveryIntegrationTest:24、AgentAuditIntegrationTest:27、AgentRunIntegrationTest:25、FigureToolsIntegrationTest、ProcessingIntegrationTest、ModelConnectionIntegrationTest、eval/AgentEvaluationTest:21、eval/EvaluationRunnerIntegrationTest:26。无 Testcontainers，依赖 `scripts/start.ps1` 初始化的本机 33316 MySQL。
- **4 个类使用 TestSupportController 清理端点**（AgentRunIntegrationTest、eval/AgentEvaluationTest、eval/EvaluationRunnerIntegrationTest、ModelConnectionIntegrationTest）——H2 URL 被 L25-27 正则拒绝 → 403。
- CI `.github/workflows/ci.yml:23-34`：mysql:8.0 service 容器映射 33316:3306，`MYSQL_DATABASE: labflow_test`。
- 14-1 落地建议：测试 datasource URL 参数化（env / profile，如 `LABFLOW_TEST_DB`）；CI 增加一个 H2 job；TestSupportController 与 eval 守卫正则扩展接受 H2 测试库 URL（这是后端代码改动，属于 14-1 任务文件授权范围，仍不动 MySQL 行为）。

---

## 4. BackupService / DeliveryController 审计

### 4.1 备份包含什么（BackupService.java，574 行）

`COLUMNS`（L24-71）导出 **7 张表 + manifest 根的 project 行**：

| 表 | 导出列（要点） |
|---|---|
| projects（manifest.project，L120-123） | name、description、created_at、archived 等整行 |
| datasets | id、project_id、name、created_at |
| dataset_versions | **original_file（LONGBLOB→Base64）**、sha256、row_count、parse_rules_json、source_meta_json、fields/rows/warnings_json |
| experiments | parameters、metrics、status、tags_json、revision、updated_at |
| experiment_datasets | 链接表（experiment_id, dataset_version_id） |
| charts | name、revision、created_at、updated_at |
| chart_versions | **config_json、schema_version、dataset_version_id**、version |
| style_templates | profile_json、schema_version |

### 4.2 排除什么（EXCLUDED）

- **agent_runs、agent_sessions 整表不在 COLUMNS** —— 助手运行历史（trace/proposal/决策记录/延迟统计）、会话绑定、预算用量（used_budget/reserved_budget/reported_tokens）**全部不进备份**。
  **回答 DESKTOP-PLAN §4 的提问：不包含；MySQL→H2 桌面迁移会丢失助手历史与预算账目。** 是否可接受（桌面端从零开始助手状态）或扩展 `labflow-project-v2` 格式纳入，是 14-3 必须做的产品决策。
- 恢复必然产生**新 projects.id**（旧 id 不保留）；恢复要求传新项目名（`POST /api/backups/restore` 的 `name` 参数）。
- `restore()` L513 硬编码 `archived=false` —— 原项目归档标记丢失（次要，安全默认）。

### 4.3 ID 重映射（restore L505-573）

1. L517-556：每表 old→new map，新 id 由 `db.insert` 生成键产生；
2. L536-541：`chart_versions.config_json` 解析后 **datasetVersionId 重映射**（图表配置内的数据集版本引用）；
3. L558-563：`source_meta_json` 在 insert 后用 UPDATE 重映射（`ref()` L441-445、`remapMeta()` L447-481 覆盖 datasetVersionId / datasetId / baseline_id / experiment ids / dataset_version_ids 列表）；
4. L532：experiment_datasets 链接按 map 重映射；
5. L566-568：恢复完成后 `validateAndReport` 对**每个 chart version 重新校验**配置可解析。

### 4.4 迁移数据丢失 + 验证数字

**丢失清单**：agent_runs / agent_sessions 全部行；原 project id；archived 标记；project created_at（新行当前时间）。

**现有验证机制（数字）**：
- zip 只允许 `manifest.json` + `sha256.txt` 两个条目（L181-184），整包 sha256 校验（L201-207）；
- 每个 dataset_version 的 original_file 字节 sha256 与 sha256 列比对（validate L238-402 内）；
- `rows_json` 解析行数 == `row_count` 列（L303）——**注意 row_count 是数据集内部行数，不是表行数**；
- chart 历史完整性（版本连续、引用闭合）；
- 导出事务 REPEATABLE_READ（L116）保证快照一致；
- 上限：压缩 64MiB（L20 `COMPRESSED_LIMIT`）/ 展开 96MiB（`EXPANDED_LIMIT`）；manifest 本体 ≤ 96MiB−65B（L144）；
- 恢复任何 DataAccessException 全量回滚（L570-572）。

**缺口**：没有「每表行数 MySQL 源 == H2 目标」的总对账 —— 现有校验都在单版本/单图表粒度。14-3 迁移工具应补每表 `COUNT(*)` 对账（数字清单可直接复用 manifest 各表数组长度）。

**端点（DeliveryController.java）**：L45-53 `GET /api/projects/{p}/backup`（zip 下载，`labflow-project-<p>.labflow.zip`）、L55-58 `POST /api/backups/preview`、L60-63 `POST /api/backups/restore` —— **DESKTOP-PLAN 的迁移载体端点齐备** ✓。

---

## 5. 前端与静态资源服务

### 5.1 frontend/src/lib/api.ts

`api.ts:20` `fetch("/api" + path, ...)` —— **相对路径同源调用**，前端 src **零硬编码 host/port** ✓。任意端口下只要 dist 与 API 同源即工作。dev 期由 `vite.config.ts` 的 `server.proxy["/api"] → process.env.LABFLOW_API || http://127.0.0.1:8086` 承担（仅开发工具链）。

### 5.2 后端能否服务 frontend/dist？

**今天不能**：`backend/src/main/resources` 仅有 `application.yml` + `db/migration`（无 `static/`、无 WebMvcConfigurer/ResourceHandler/SPA fallback）。生产传输目前靠 `scripts/serve-test-build.cjs`（Node 静态服务器：dist @127.0.0.1:5178，`/api` 反代 127.0.0.1:8087）—— 它同时**证明了 dist 从任意同源静态服务即可运行**。14-2/14-4 建议：把 dist 打进 jar `classpath:/static/` + SPA fallback 到 index.html（单进程、随机端口同源，`api.ts` 无需任何改动）；不建议在 jpackage 里保留 Node 双进程。

### 5.3 硬编码端口/路径清单

| 值 | 位置 | 性质 |
|---|---|---|
| 8086 | application.yml 默认、LocalOriginFilter 白名单、vite 代理默认 | 可覆盖默认值 |
| 5176 | Vite dev 端口、LocalOriginFilter 默认 frontend-origin | 开发期 |
| 5178 / 8087 | serve-test-build.cjs（E2E 传输） | 测试工具 |
| 33316 | MySQL（start.ps1、全部集成测试、CI、eval 守卫） | 测试/开发 DB |
| — | `ModelConnectionDialog.tsx:58` 本地端点正则 | 用户模型端点校验，与后端 URL 无关 |

**关键风险**：`LocalOriginFilter.java:22-30` 写死白名单 `{127.0.0.1:5176, localhost:5176, 127.0.0.1:8086, localhost:8086} ∪ frontendOrigin`（L14 `@Value` 可配）—— 桌面**随机端口**下所有非 GET 请求 403（ORIGIN_DENIED）。DESKTOP-PLAN 的 Host/Origin 检查要求只实现了一半（有 Origin 检查、无 Host 头检查、白名单静态）。14-2 必须动态化（launcher 持端口文件后注入允许集，或按 Host 头 127.0.0.1:<本进程端口> 判定）。

---

## 6. 风险表、任务落位与对 DESKTOP-PLAN 的挑战

### 6.1 风险表（按严重度排序）

| # | 风险 | 证据 | 影响 | 落位 |
|---|---|---|---|---|
| R1 | **ON UPDATE CURRENT_TIMESTAMP(3) H2 无对应物**：experiments/charts 的 updated_at 只靠 MySQL 子句维护，Java UPDATE 语句从不设置它（grep 0 命中），却用于排序（ExperimentService:55、WorkspaceService:325 ORDER BY updated_at） | V1:2、V1:5 + §2.2 | H2 下 updated_at 停滞 → 列表排序错乱（用户可感知） | 14-1（代码在 UPDATE 里显式赋值，MySQL/H2 双兼容） |
| R2 | H2 JSON 类型 String 双重编码陷阱 | §2.5；DESKTOP-PLAN 已知 | 所有 12 个 JSON 列读写坏 | 14-1（h2 脚本用 CLOB，计划已定） |
| R3 | LocalOriginFilter 固定白名单 × 随机端口 | §5.3 | 桌面端全部写请求 403 | 14-2 |
| R4 | 后端不服务 dist | §5.2 | 无法单进程交付 | 14-2/14-4 |
| R5 | 备份不含 agent_runs/agent_sessions | §4.2 | 桌面迁移丢助手历史与预算账目 | 14-3（产品决策） |
| R6 | FOR SHARE（AgentAuditRepository:190）H2 支持性 | U5 | 提案 revision 基线锁失效或启动报错 | 14-1（验证，必要时降级 FOR UPDATE） |
| R7 | REPEATABLE_READ（BackupService:116）H2 支持性 | U7 | 备份快照一致性削弱或异常 | 14-1 验证 / 14-3 载体 |
| R8 | TIMESTAMPDIFF(MICROSECOND)（AgentAuditRepository:104） | U6 | recover() 启动失败（该语句在 @PostConstruct 链路上，**会阻断应用启动**） | 14-1（Java 计算改写） |
| R9 | 索引/多列 ALTER 语法改写工作量 | §1（V3/V5/V6/V7） | 纯机械改写，量大但低险 | 14-1 |
| R10 | 测试体系 MySQL-only（11 类硬编码 URL + 3 处守卫正则 + CI 单 MySQL job） | §3.3 | 双库回归无法建立 | 14-1 |
| R11 | flyway-database-h2 依赖缺失 | U8 | Flyway 无法跑 H2 | 14-1/14-4 |
| R12 | 恢复语义：新项目名必填、archived 丢失 | §4.2 | 迁移工具 UX/数据语义 | 14-3 |
| R13 | H2 会话时区随 JVM（用户本地时区）≠ MySQL 侧 UTC | U9 | Timestamp 显示/round-trip 偏移（单会话内 round-trip 自洽，跨库迁移需统一） | 14-2（launcher `-Duser.timezone=UTC`） |
| R14 | 每表行数总对账缺失 | §4.4 | 迁移完整性只有粒度校验，无总量对账 | 14-3 |
| R15 | 64MiB/96MiB 备份上限对大项目截断（multipart 64MB 配套） | §4.4 | 大数据集项目无法走备份迁移 | 14-3（提示/分片决策） |

### 6.2 14-1 → 14-5 落位建议（与 DESKTOP-PLAN 任务划分对照）

- **14-1（H2 profile + 双库测试）**：`db/migration/h2/` 8 个脚本改写（CLOB×12、索引外置×4、多列 ALTER 拆分×3、LONGBLOB→BLOB）；R1 的 UPDATE 显式 updated_at；R6/R8 验证与改写；`application-desktop.yml` + H2 URL；h2 + flyway-database-h2 依赖；测试 URL 参数化 + 守卫正则扩展 + CI H2 job；U1–U8 全部在此一次性消解。
- **14-2（launcher）**：R3 Origin 白名单动态化 + Host 头检查；R4 jar 服务 dist + SPA fallback；R13 时区统一。
- **14-3（迁移工具 + 验证）**：R5 agent 数据决策（丢失声明 or 格式 v2）；R14 每表 COUNT 对账；R12/R15 恢复语义与上限。
- **14-4（打包）**：R11 验证、jlink/jpackage、H2 runtime 依赖裁剪。
- **14-5（E2E）**：打包产物上跑 backup→restore→图表打开全链路。

### 6.3 对 DESKTOP-PLAN 的挑战/修正

1. **计划遗漏 R1（ON UPDATE CURRENT_TIMESTAMP）** —— 这是全部审计里唯一「不改 Java 代码就无法保持语义」的 schema 依赖，计划文档未提；建议补进 14-1 任务文件。
2. 计划的 JSON 双引号陷阱判断**经代码证实正确**（§2.5）；「代码以字符串读写 JSON、无 SQL JSON 函数」亦证实（§2.2 grep 0 命中）。
3. 选 H2 的理由（FOR UPDATE 不可替代）**成立且比计划表述更强**：5 处 FOR UPDATE + 1 处 FOR SHARE，SQLite 连基本场景都不满足。
4. 迁移载体端点（GET /projects/{p}/backup + POST /backups/restore）**齐备**；但计划应写明：restore 需要新项目名、archived 丢失、**agent 数据不迁移**（§4.2 直接回答了计划 §4 留的问题）。
5. 计划未提 FOR SHARE / REPEATABLE_READ / TIMESTAMPDIFF(MICROSECOND) 三个 H2 兼容点（R6/R7/R8，其中 R8 在 @PostConstruct 链路上会**阻断启动**）。
6. 计划未提 `flyway-database-h2` 依赖（R11）。
7. 计划的 Host 头检查目前不存在，Origin 检查存在但白名单写死（R3）——14-2 工作量比「补 Host 检查」略大。
8. 计划数据目录 `%LOCALAPPDATA%\FigTide\data` 与 H2 file URL 兼容；注意 H2 会建 `.lock.db`/`.trace.db` 辅助文件，launcher 单实例锁已计划，无冲突。

---

## 附录：不确定项与验证方法（9 项）

| # | 不确定项 | 把握 | 验证方法（14-1 第一步） |
|---|---|---|---|
| U1 | H2 `CURRENT_TIMESTAMP(3)` 精度参数及作为列 DEFAULT | 较确定 | 最小 H2 建表 smoke（下述脚本一次覆盖 U1–U7） |
| U2 | H2 `CREATE INDEX ... (col DESC)` 语法接受性 | 较确定 | 同上（V5 两个索引原样执行） |
| U3 | H2 单条 ALTER 多列 ADD COLUMN 不支持 | 较确定 | 同上（V3:1-3 原样执行，预期报错即证实） |
| U4 | H2 无 LONGBLOB 别名 | 较确定 | 同上（V1:4 原样执行） |
| U5 | `FOR SHARE` 在 H2 | 不确定 | H2 控制台执行 `SELECT revision FROM charts WHERE ... FOR SHARE`；或直接跑 AgentAudit 集成测试 |
| U6 | `TIMESTAMPDIFF(MICROSECOND, ...)` 单位 | 不确定 | H2 控制台单测；不支持则按 R8 Java 改写 |
| U7 | REPEATABLE_READ 在 H2（Spring 隔离级映射） | 不确定 | H2 profile 跑 BackupService 导出集成测试 |
| U8 | `flyway-database-h2` 是否需显式加入 / Boot 3.5.7 BOM 版本管理 | 较确定 | `mvn dependency:tree` + H2 URL 下 `flyway migrate` 冒烟 |
| U9 | H2 会话时区与 Timestamp 跨库 round-trip | 不确定 | MySQL 导出→H2 恢复→对比 `created_at` 字符串（14-3 验证；或 launcher 锁 UTC 规避） |

**建议的统一验证入口**：14-1 先写一个 `H2SchemaSmokeTest`（`@SpringBootTest` + `jdbc:h2:file:tmp;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE` + `flyway.locations: classpath:db/migration/h2`），启动即覆盖 U1–U4，随后跑 AgentAudit/Backup 集成测试覆盖 U5–U7。

---

*本报告为只读审计产物，未提交 git；除本文件外未新增/修改任何文件。*
