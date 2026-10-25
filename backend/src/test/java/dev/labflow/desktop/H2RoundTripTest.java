package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * 任务 14-1-3.5：H2 会话时区统一 UTC 后，写入一个 Instant、读出来必须完全相同。
 *
 * <p>H2 的 TIMESTAMP 不带时区，按 JVM 默认时区换算；H2 相关测试统一以 UTC 运行（本测试自设 UTC，
 * 14-1-4 的 H2 测试基类同样固定 UTC）。桌面启动器必须以 -Duser.timezone=UTC 启动 JVM
 * （DESKTOP-PLAN.md 第 3 节，14-2 执行）。</p>
 */
class H2RoundTripTest {

  private static TimeZone original;

  @BeforeAll
  static void utc() {
    original = TimeZone.getDefault();
    TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
  }

  @AfterAll
  static void restore() {
    TimeZone.setDefault(original);
  }

  @Test
  void instantRoundTripsIdentically() throws Exception {
    Instant written = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    try (Connection conn = DriverManager.getConnection(
        "jdbc:h2:mem:roundtrip;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE",
        "sa", "");
        Statement st = conn.createStatement()) {
      st.execute("CREATE TABLE probe_ts (id INT PRIMARY KEY, ts TIMESTAMP(3) NOT NULL)");
      try (PreparedStatement ps =
          conn.prepareStatement("INSERT INTO probe_ts(id,ts) VALUES(1,?)")) {
        ps.setTimestamp(1, Timestamp.from(written));
        ps.executeUpdate();
      }
      try (ResultSet rs = st.executeQuery("SELECT ts FROM probe_ts WHERE id=1")) {
        assertEquals(true, rs.next());
        Instant read = rs.getTimestamp("ts").toInstant();
        assertEquals(written, read, "Instant 写入 H2 TIMESTAMP(3) 后读出应完全相同");
      }
    }
  }

  @Test
  void defaultTimestampReadsBackAsTimestamp() throws Exception {
    try (Connection conn = DriverManager.getConnection(
        "jdbc:h2:mem:roundtrip_default;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE",
        "sa", "");
        Statement st = conn.createStatement()) {
      st.execute(
          "CREATE TABLE probe_default (id INT PRIMARY KEY, created_at TIMESTAMP(3) NOT NULL"
              + " DEFAULT CURRENT_TIMESTAMP(3))");
      st.execute("INSERT INTO probe_default(id) VALUES(1)");
      try (ResultSet rs = st.executeQuery("SELECT created_at FROM probe_default WHERE id=1")) {
        assertEquals(true, rs.next());
        Timestamp ts = rs.getTimestamp("created_at");
        assertNotNull(ts);
        // DEFAULT CURRENT_TIMESTAMP(3) 应为毫秒精度（到 1970-01-01 起的毫秒数无残留纳秒）
        assertEquals(0, ts.toInstant().getNano() % 1_000_000);
      }
    }
  }
}
