# FigTide 桌面版方案（Windows 第一版）

**目标**：用户下载一个安装包或压缩包，双击就能用 FigTide，不需要安装 JDK 和 MySQL。数据保存在本机。
**范围**：只做 Windows；界面在系统默认浏览器里打开（不做原生窗口，原生窗口留给第二版的 Tauri）。

> 本方案基于仓库现状的初步阅读（`backend/src/main/resources/db/migration/V1–V8`、`application.yml`、`BackupService`），具体兼容问题以 14-0 的盘点结果为准。

---

## 1. 已确定的决定

| 事项 | 决定 | 理由 |
|---|---|---|
| 平台 | 先只做 Windows | 本机能测；macOS 以后用 GitHub Actions 的 macOS 机器补 |
| 界面 | 启动后打开系统默认浏览器 | 改动最小、最稳定；前端代码完全不用改 |
| 内嵌数据库 | **H2（文件模式，MODE=MySQL）**，MySQL 保留为可选 | 见第 2 节 |
| 数据迁移 | 复用已有的「项目备份 → 恢复」接口，加自动核对 | 见第 4 节 |
| 打包 | `jlink` 精简运行时 + `jpackage` | JDK 自带，不引入新框架 |
| 签名 | 第一版不签名，README 说明 SmartScreen 提示 | 证书要花钱，开源第一版通常不签 |

## 2. 为什么选 H2，而不是 SQLite

初步阅读到的 MySQL 专有写法：

- `BIGINT PRIMARY KEY AUTO_INCREMENT`
- `TIMESTAMP(3) … DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`
- `JSON` 列（parameters、metrics、fields_json、rows_json、config_json 等）
- `LONGBLOB`（原始文件就存在数据库里）
- 代码里有多处 `SELECT … FOR UPDATE`（工作区、实验、助手会话的并发保护）

H2 支持 `FOR UPDATE`、`AUTO_INCREMENT`、毫秒精度时间戳和 `ON UPDATE` 列定义，在 MySQL 兼容模式下大部分 SQL 不用改；SQLite 不支持 `FOR UPDATE`，并发保护要重写，风险更大。

**已知的 H2 陷阱（14-1 必须处理）**：H2 的 `JSON` 类型会把以普通字符串传进来的参数存成「JSON 字符串」，读出来多一层引号。H2 的迁移脚本里，这些列改用 `CLOB`（代码本来就是按字符串读写 JSON，没有用 SQL 里的 JSON 函数），这样两种数据库的行为一致。

## 3. 架构

```
FigTide.exe（jpackage 生成的启动器）
  └─ 精简 Java 运行时（jlink）
       └─ figtide.jar（Spring Boot，profile = desktop）
            ├─ 提供前端静态页面（frontend/dist 打进 jar）
            ├─ /api/*（现有接口，不改）
            └─ H2 数据库文件：%LOCALAPPDATA%\FigTide\data\
```

启动流程：
1. 检查是否已有实例在运行（数据目录下的锁文件 + 端口文件）。如果有，直接用浏览器打开已有实例的地址，然后退出。
2. 在 127.0.0.1 上选一个空闲端口启动，把端口写进端口文件。
3. Flyway 迁移 H2（`db/migration/h2/`），MySQL 继续用原来的 `db/migration/`（按 profile 选择 `spring.flyway.locations`）。
4. 服务就绪后，用系统默认浏览器打开 `http://127.0.0.1:<端口>/`。
5. 系统托盘图标，菜单：「打开 FigTide」「打开数据文件夹」「导出诊断日志」「退出」。退出时正常关闭服务和数据库。

**本机安全**（桌面版新增的要求）：本地服务虽然只监听 127.0.0.1，但浏览器里打开的其他网站也能向它发请求。必须：
- 校验 `Host` 头只能是 `127.0.0.1:<端口>` 或 `localhost:<端口>`，防 DNS 重绑定；
- 写操作校验 `Origin`，只接受同源请求；CORS 不放开。

**目录**：数据库和上传文件放 `%LOCALAPPDATA%\FigTide\data`，日志放 `%LOCALAPPDATA%\FigTide\logs`。卸载程序不删除数据目录，README 写明数据位置和备份方法。

## 4. 老用户的数据迁移

仓库已有 `GET /projects/{p}/backup`（导出）和 `POST /backups/restore`（恢复）。迁移工具做法：
1. 旧版（MySQL）服务开着时，逐个导出项目备份，保存到一个迁移文件夹；
2. 桌面版逐个恢复；
3. **自动核对**，生成迁移报告：每个项目的数据集数、数据版本数、每个原始文件的 SHA-256、图表数、图表版本数、实验数、样式模板数，新旧两边逐项一致才算通过；
4. 迁移是复制，不修改、不删除旧库。

需要 14-0 确认：备份里有没有包含助手的运行记录和会话（如果没有，迁移后这部分历史会丢失，需要在迁移说明里写清楚，或补充）。

## 5. 14-0 盘点之后的决定

依据 `docs/desktop/DB-AUDIT-glm-5.3.md`（已由人工逐条核对代码事实）：

| 问题 | 决定 |
|---|---|
| 助手运行记录、会话、预算（agent_runs / agent_sessions）不在备份里 | **不迁移**。迁移说明和迁移报告里写清楚「助手历史不随迁移保留」。不扩展备份格式 |
| `experiments` / `charts` 的 `updated_at` 依赖 MySQL 的 `ON UPDATE` | 所有相关 UPDATE 语句**显式赋值** `updated_at`，两种数据库通用；H2 脚本不依赖 `ON UPDATE` |
| `recover()` 里的 `TIMESTAMPDIFF(MICROSECOND…)`（在启动路径上） | 改成在 Java 里计算延迟，不依赖数据库函数 |
| `FOR SHARE` | 先在 H2 上验证；不支持就统一改为 `FOR UPDATE`（锁更强，语义不变） |
| `REPEATABLE_READ`（备份导出） | 在 H2 上用备份集成测试验证 |
| `LocalOriginFilter` 写死端口、后端不提供前端页面、时区 | 14-2 处理 |
| 备份 64 MiB 上限 | 14-3 处理（迁移前检查，超限的项目给出明确提示） |
| 恢复时 `archived` 丢失、项目名必填 | 14-3 迁移工具负责：沿用原名、恢复后按原状态设置归档 |

注意：盘点报告里有几处「H2 是否支持某写法」标为「确定」的判断（例如 `ON UPDATE`、`LONGBLOB`）未经实测，以 14-1 的冒烟测试结果为准。

## 6. 任务拆分

| 任务 | 内容 | 风险 |
|---|---|---|
| **14-0** | 兼容性盘点（只读，不改代码） | 无 |
| 14-1 | H2 profile、H2 迁移脚本、后端测试同时在 MySQL 和 H2 上跑 | 中 |
| 14-2 | 桌面启动器：数据目录、随机端口、单实例、打开浏览器、托盘、Host/Origin 校验 | 中 |
| 14-3 | 迁移工具与核对报告 | **高**（涉及真实数据） |
| 14-4 | jlink + jpackage 打包脚本、图标、版本号；GitHub Actions 在打标签时自动构建并挂到 Release | 中 |
| 14-5 | 在打包产物上跑全量 E2E；手工冒烟清单；README「安装」一节 | 低 |

14-1 之后的任务书，等 14-0 的盘点结果出来再写细。
