package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * db/migration/（MySQL）与 db/migration/h2/（H2）的 Flyway 版本集合必须完全一致。
 *
 * <p>14-1-2.3：以后新增 MySQL 迁移却忘了写 H2 版本，本测试失败。AGENTS.md「桌面版后端授权」一节同款规则：
 * 新增迁移必须同时提供 MySQL 和 H2 两个版本。</p>
 */
class MigrationParityTest {

  @Test
  void versionSetsMatchBetweenMysqlAndH2() throws Exception {
    Set<String> mysql = versions("classpath:db/migration/V*.sql");
    Set<String> h2 = versions("classpath:db/migration/h2/V*.sql");
    assertEquals(mysql, h2,
        "db/migration 与 db/migration/h2 的版本集合不一致（新增迁移必须同时提供 MySQL 和 H2 两个版本）。"
            + "MySQL=" + mysql + " H2=" + h2);
  }

  /**
   * 按文件名顺序在同一个内存 H2（参数与 application-desktop.yml 一致）上执行 db/migration/h2/ 的全部语句，
   * 模拟 Flyway 顺序应用：任何一条失败即测试失败。14-1-2 改写脚本的自检。
   */
  @Test
  void h2MigrationsApplyInOrderOnH2() throws Exception {
    PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
    Resource[] resources = resolver.getResources("classpath:db/migration/h2/V*.sql");
    List<String> names = new ArrayList<>();
    for (Resource r : resources) {
      names.add(r.getFilename());
    }
    names.sort(String::compareTo);
    assertTrue(names.size() >= 8, "db/migration/h2 至少应有 V1–V8，实际 " + names);

    try (Connection conn = DriverManager.getConnection(
        "jdbc:h2:mem:migration_parity;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE",
        "sa", "");
        Statement st = conn.createStatement()) {
      for (String name : names) {
        String text = new String(resolver.getResource("classpath:db/migration/h2/" + name)
            .getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        for (String raw : stripComments(text).split(";")) {
          String stmt = raw.trim();
          if (stmt.isEmpty()) {
            continue;
          }
          st.execute(stmt);
        }
      }
      // 全部迁移应用后，核心表都存在（用一条轻量查询验证 schema 成型）。
      try (var rs = st.executeQuery(
          "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='agent_runs'")) {
        assertTrue(rs.next() && rs.getLong(1) == 1, "迁移全部执行后 agent_runs 表应存在");
      }
    }
  }

  /** 去掉 `--` 注释行（注释里的分号不是语句分隔符）。 */
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

  /** 提取目录下每个 V*.sql 的版本号前缀（V1、V2…）。 */
  private Set<String> versions(String pattern) throws Exception {
    PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
    Resource[] resources = resolver.getResources(pattern);
    Set<String> versions = new TreeSet<>();
    for (Resource r : resources) {
      String name = r.getFilename();
      try (InputStream in = r.getInputStream()) {
        in.readAllBytes(); // 触发资源真实存在（排除目录等异常条目）
      }
      int cut = name.indexOf("__");
      if (cut <= 0) {
        throw new IllegalStateException("迁移文件名不符合 Flyway 约定 V<n>__desc.sql: " + name);
      }
      versions.add(name.substring(0, cut));
    }
    return versions;
  }
}
