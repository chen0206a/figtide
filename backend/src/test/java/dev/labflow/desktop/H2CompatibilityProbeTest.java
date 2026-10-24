package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * 在内存 H2（连接参数与 application-desktop.yml 一致：MODE=MySQL + DATABASE_TO_LOWER +
 * CASE_INSENSITIVE_IDENTIFIERS）上逐条执行原始 MySQL 迁移脚本的每一条语句，以及
 * 14-0 盘点报告（docs/desktop/DB-AUDIT-glm-5.3.md 附录）里的 MySQL 专有写法探针。
 *
 * <p>结果写入 target/h2-probe-report.md（实测证据；结论固化在 docs/desktop/H2-PROBE.md）。
 * 断言记录当前 H2 版本（2.3.232，由 Spring Boot BOM 管理）的实测行为：以后升级 H2 时
 * 如果行为变化，这里的断言失败，提醒重新核对 db/migration/h2/ 里的脚本。
 */
class H2CompatibilityProbeTest {
  private static final String H2_URL_PARAMS =
      "MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE";

  record Probe(String id, String label, String sql, boolean ok, String error, String detail) {}

  private static final Map<String, Boolean> EXPECTED_MYSQL_SCRIPT = new LinkedHashMap<>();
  private static final Map<String, Boolean> EXPECTED_FEATURE_PROBES = new LinkedHashMap<>();

  static {
    // 原始 MySQL 迁移语句逐条实测结果（语句编号 = 文件内的第几条语句，从 1 开始）。
    // 实测于 H2 2.3.232（Spring Boot 3.5.7 BOM 管理的版本）。
    EXPECTED_MYSQL_SCRIPT.put("V1#1", true);   // projects：AUTO_INCREMENT + TIMESTAMP(3) DEFAULT
    EXPECTED_MYSQL_SCRIPT.put("V1#2", true);   // experiments：ON UPDATE CURRENT_TIMESTAMP(3) 居然支持
    EXPECTED_MYSQL_SCRIPT.put("V1#3", true);   // datasets
    EXPECTED_MYSQL_SCRIPT.put("V1#4", true);   // dataset_versions：LONGBLOB + JSON DDL 均支持
    EXPECTED_MYSQL_SCRIPT.put("V1#5", true);   // charts
    EXPECTED_MYSQL_SCRIPT.put("V1#6", true);   // chart_versions
    EXPECTED_MYSQL_SCRIPT.put("V2#1", true);   // dataset_versions ADD parse_rules_json JSON
    EXPECTED_MYSQL_SCRIPT.put("V2#2", true);   // projects ADD archived
    EXPECTED_MYSQL_SCRIPT.put("V3#1", false);  // experiments 多列 ADD COLUMN：语法不支持
    EXPECTED_MYSQL_SCRIPT.put("V3#2", true);   // experiment_datasets 复合主键 + FK
    EXPECTED_MYSQL_SCRIPT.put("V3#3", true);   // dataset_versions ADD source_meta_json JSON
    EXPECTED_MYSQL_SCRIPT.put("V4#1", true);   // style_templates
    EXPECTED_MYSQL_SCRIPT.put("V5#1", true);   // agent_runs：内联 INDEX（含 DESC）支持
    EXPECTED_MYSQL_SCRIPT.put("V6#1", false);  // agent_runs ADD COLUMN + ADD INDEX 混合：语法不支持
    EXPECTED_MYSQL_SCRIPT.put("V7#1", true);   // agent_sessions
    EXPECTED_MYSQL_SCRIPT.put("V7#2", false);  // agent_runs 多列 ADD + ADD INDEX：语法不支持
    EXPECTED_MYSQL_SCRIPT.put("V8#1", true);   // agent_sessions ADD turn_count
    EXPECTED_MYSQL_SCRIPT.put("V8#2", true);   // agent_runs ADD turn_index

    // U 探针（编号沿用盘点报告附录 U1–U7）。实测推翻了盘点报告里 ON UPDATE、
    // LONGBLOB、内联 INDEX、TIMESTAMPDIFF(MICROSECOND)、REPEATABLE_READ 的判断。
    EXPECTED_FEATURE_PROBES.put("U1_CURRENT_TIMESTAMP_3_DEFAULT", true);
    EXPECTED_FEATURE_PROBES.put("U2_ON_UPDATE_CURRENT_TIMESTAMP", true);
    EXPECTED_FEATURE_PROBES.put("U3_LONGBLOB", true);
    EXPECTED_FEATURE_PROBES.put("U4_INLINE_INDEX", true);
    EXPECTED_FEATURE_PROBES.put("U5_ALTER_ADD_MULTIPLE_COLUMNS", false);
    EXPECTED_FEATURE_PROBES.put("U6_FOR_SHARE", false);
    EXPECTED_FEATURE_PROBES.put("U7_TIMESTAMPDIFF_MICROSECOND", true);
    EXPECTED_FEATURE_PROBES.put("U7B_REPEATABLE_READ_ISOLATION", true);
  }

  @Test
  void migrationStatementsBehaveAsRecorded() throws Exception {
    List<Probe> probes = probeMysqlMigrationStatements();
    for (Probe p : probes) {
      assertEquals(EXPECTED_MYSQL_SCRIPT.get(p.id()), p.ok(),
          "H2 行为与记录不符（升级 H2 后请重新核对 db/migration/h2/）：" + p.id() + " " + p.sql());
    }
  }

  @Test
  void mysqlSpecificConstructsBehaveAsRecorded() throws Exception {
    List<Probe> probes = new ArrayList<>(probeFeatures());
    for (Probe p : probes) {
      assertEquals(EXPECTED_FEATURE_PROBES.get(p.id()), p.ok(),
          "H2 行为与记录不符（升级 H2 后请重新核对 db/migration/h2/）：" + p.id() + " " + p.label());
    }
  }

  @Test
  void writesProbeReportForH2ProbeDoc() throws Exception {
    List<Probe> all = new ArrayList<>(probeMysqlMigrationStatements());
    all.addAll(probeFeatures());
    StringBuilder md = new StringBuilder();
    md.append("# H2 兼容性实测（由 H2CompatibilityProbeTest 生成）\n\n");
    md.append("H2 版本见 pom（Spring Boot BOM 管理）。连接参数与 application-desktop.yml 一致：")
        .append(H2_URL_PARAMS).append("\n\n");
    md.append("## 原始 MySQL 迁移语句逐条执行\n\n");
    md.append("| 编号 | 语句（截断） | 结果 | 报错原文 |\n|---|---|---|---|\n");
    for (Probe p : all) {
      if (p.id().startsWith("U")) {
        continue; // U 探针单独一张表
      }
      String stmt = p.sql() == null ? "" : p.sql().replaceAll("\\s+", " ");
      if (stmt.length() > 90) {
        stmt = stmt.substring(0, 90) + "…";
      }
      md.append("| ").append(p.id()).append(" | ").append(stmt).append(" | ")
          .append(p.ok() ? "支持" : "不支持").append(" | ")
          .append(p.error() == null ? "" : p.error().replace("|", "\\|")).append(" |\n");
    }
    md.append("\n## MySQL 专有写法探针（U1–U7）\n\n");
    md.append("| 编号 | 写法 | 结果 | 报错原文 / 细节 |\n|---|---|---|---|\n");
    for (Probe p : all) {
      if (p.id().startsWith("U")) {
        md.append("| ").append(p.id()).append(" | ").append(p.label()).append(" | ")
            .append(p.ok() ? "支持" : "不支持").append(" | ")
            .append((p.error() == null ? "" : p.error().replace("|", "\\|"))
                + (p.detail() == null ? "" : " " + p.detail())).append(" |\n");
      }
    }
    Files.writeString(Path.of("target", "h2-probe-report.md"), md.toString(), StandardCharsets.UTF_8);
    assertNotNull(md.toString());
  }

  /** 逐条执行原始 MySQL 迁移脚本语句；每条语句都在全新数据库上先重放之前的语句（忽略失败）。 */
  private List<Probe> probeMysqlMigrationStatements() throws Exception {
    List<String[]> statements = loadMysqlMigrationStatements();
    List<Probe> probes = new ArrayList<>();
    for (int i = 0; i < statements.size(); i++) {
      String file = statements.get(i)[0];
      String sql = statements.get(i)[1];
      String id = file + "#" + (countFile(statements, file, i));
      Probe p = executeOnFreshDb(id, "迁移语句", sql, statements.subList(0, i));
      probes.add(p);
    }
    return probes;
  }

  private int countFile(List<String[]> statements, String file, int upto) {
    int n = 0;
    for (int j = 0; j <= upto; j++) {
      if (statements.get(j)[0].equals(file)) {
        n++;
      }
    }
    return n;
  }

  private List<String[]> loadMysqlMigrationStatements() throws Exception {
    PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
    Resource[] resources = resolver.getResources("classpath:db/migration/V*.sql");
    List<String[]> statements = new ArrayList<>();
    for (Resource r : resources) {
      String name = r.getFilename().replaceFirst("__.*$", "");
      try (InputStream in = r.getInputStream()) {
        // 先去掉 -- 注释行再按分号切分：注释里出现的分号不是语句分隔符。
        String text = stripComments(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        for (String raw : text.split(";")) {
          String stmt = raw.trim();
          if (!stmt.isEmpty()) {
            statements.add(new String[] {name, stmt});
          }
        }
      }
    }
    statements.sort((a, b) -> a[0].compareTo(b[0]));
    return statements;
  }

  private String stripComments(String sql) {
    StringBuilder sb = new StringBuilder();
    for (String line : sql.split("\n", -1)) {
      if (line.trim().startsWith("--")) {
        continue;
      }
      sb.append(line).append('\n');
    }
    return sb.toString();
  }

  private Probe executeOnFreshDb(String id, String label, String sql, List<String[]> priorStatements)
      throws Exception {
    String dbName = "probe_" + Math.abs(sql.hashCode()) + "_" + System.nanoTime();
    try (Connection conn = DriverManager.getConnection(
        "jdbc:h2:mem:" + dbName + ";" + H2_URL_PARAMS, "sa", "")) {
      for (String[] prior : priorStatements) {
        try (Statement st = conn.createStatement()) {
          st.execute(prior[1]);
        } catch (Exception ignored) {
          // 前置语句失败（自身不兼容）时继续，让目标语句暴露自己的兼容性；级联失败记录在报错原文里。
        }
      }
      try (Statement st = conn.createStatement()) {
        st.execute(sql);
        return new Probe(id, label, sql, true, null, null);
      } catch (Exception e) {
        String msg = String.valueOf(e.getMessage()).trim();
        if (msg.length() > 160) {
          msg = msg.substring(0, 160) + "…";
        }
        return new Probe(id, label, sql, false, msg, null);
      }
    }
  }

  private List<Probe> probeFeatures() throws Exception {
    List<Probe> probes = new ArrayList<>();
    probes.add(probeU1CurrentTimestampDefault());
    probes.add(probeU2OnUpdate());
    probes.add(probeU3Longblob());
    probes.add(probeU4InlineIndex());
    probes.add(probeU5AlterAddMultipleColumns());
    probes.add(probeU6ForShare());
    probes.add(probeU7TimestampdiffMicrosecond());
    probes.add(probeU7bRepeatableRead());
    return probes;
  }

  private Probe probeU1CurrentTimestampDefault() throws Exception {
    return runFeatureProbe("U1_CURRENT_TIMESTAMP_3_DEFAULT", "TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) 默认值",
        conn -> {
          try (Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE probe_u1 (id INT PRIMARY KEY, t TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3))");
            st.execute("INSERT INTO probe_u1 (id) VALUES (1)");
            try (ResultSet rs = st.executeQuery("SELECT t FROM probe_u1 WHERE id = 1")) {
              if (!rs.next()) {
                throw new IllegalStateException("no row");
              }
              assertNotNull(rs.getTimestamp(1));
            }
          }
        });
  }

  private Probe probeU2OnUpdate() {
    return runFeatureProbe("U2_ON_UPDATE_CURRENT_TIMESTAMP", "列定义 ON UPDATE CURRENT_TIMESTAMP(3)",
        conn -> {
          try (Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE probe_u2 (id INT PRIMARY KEY, t TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) "
                + "ON UPDATE CURRENT_TIMESTAMP(3))");
          }
        });
  }

  private Probe probeU3Longblob() {
    return runFeatureProbe("U3_LONGBLOB", "LONGBLOB 数据类型",
        conn -> {
          try (Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE probe_u3 (id INT PRIMARY KEY, data LONGBLOB)");
          }
        });
  }

  private Probe probeU4InlineIndex() {
    return runFeatureProbe("U4_INLINE_INDEX", "CREATE TABLE 内联 INDEX（V5:34-35 写法）",
        conn -> {
          try (Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE probe_u4 (id INT PRIMARY KEY, a INT, b INT, "
                + "INDEX idx_a (a))");
          }
        });
  }

  private Probe probeU5AlterAddMultipleColumns() {
    return runFeatureProbe("U5_ALTER_ADD_MULTIPLE_COLUMNS", "单条 ALTER 混合多列/列+索引（V3:1-3、V6、V7:14-19 写法）",
        conn -> {
          try (Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE probe_u5 (id INT PRIMARY KEY)");
            st.execute("ALTER TABLE probe_u5 ADD COLUMN x INT, ADD COLUMN y INT");
          }
        });
  }

  private Probe probeU6ForShare() {
    return runFeatureProbe("U6_FOR_SHARE", "SELECT … FOR SHARE（AgentAuditRepository.java:190）",
        conn -> {
          try (Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE probe_u6 (id INT PRIMARY KEY)");
            st.execute("SELECT id FROM probe_u6 FOR SHARE");
          }
        });
  }

  private Probe probeU7TimestampdiffMicrosecond() {
    return runFeatureProbe("U7_TIMESTAMPDIFF_MICROSECOND", "TIMESTAMPDIFF(MICROSECOND, …)（AgentAuditRepository.java:104）",
        conn -> {
          try (Statement st = conn.createStatement()) {
            st.execute("SELECT TIMESTAMPDIFF(MICROSECOND, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))");
          }
        });
  }

  private Probe probeU7bRepeatableRead() {
    return runFeatureProbe("U7B_REPEATABLE_READ_ISOLATION", "REPEATABLE_READ 事务隔离级别（BackupService.java:116）",
        conn -> {
          conn.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
        });
  }

  interface SqlAction {
    void run(Connection conn) throws Exception;
  }

  private Probe runFeatureProbe(String id, String label, SqlAction action) {
    String dbName = "probe_" + id + "_" + System.nanoTime();
    try (Connection conn = DriverManager.getConnection(
        "jdbc:h2:mem:" + dbName + ";" + H2_URL_PARAMS, "sa", "")) {
      try {
        action.run(conn);
        return new Probe(id, label, null, true, null, null);
      } catch (Exception e) {
        String msg = String.valueOf(e.getMessage()).trim();
        if (msg.length() > 160) {
          msg = msg.substring(0, 160) + "…";
        }
        return new Probe(id, label, null, false, msg, null);
      }
    } catch (Exception connectFailure) {
      return new Probe(id, label, null, false,
          "连接失败：" + connectFailure.getMessage(), null);
    }
  }
}
