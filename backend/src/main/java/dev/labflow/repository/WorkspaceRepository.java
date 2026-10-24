package dev.labflow.repository;

import java.sql.Statement;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class WorkspaceRepository {
  private final JdbcTemplate jdbc;

  public WorkspaceRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<Map<String, Object>> query(String sql, Object... args) {
    return jdbc.queryForList(sql, args);
  }

  public Map<String, Object> one(String sql, Object... args) {
    var rows = query(sql, args);
    if (rows.isEmpty()) throw new dev.labflow.api.ApiException(404, "记录不存在或不属于当前项目");
    return rows.getFirst();
  }

  public int update(String sql, Object... args) {
    return jdbc.update(sql, args);
  }

  public long insert(String sql, Object... args) {
    GeneratedKeyHolder key = new GeneratedKeyHolder();
    jdbc.update(
        c -> {
          var ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
          for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
          return ps;
        },
        key);
    // 14-1 可移植性：H2（含 MODE=MySQL）的 RETURN_GENERATED_KEYS 会把 DEFAULT
    // CURRENT_TIMESTAMP(3) 的 created_at 等带默认值列也算作生成列，返回 {id, created_at}；
    // MySQL 只返回自增 id（列名可能是 GENERATE_* 或 id）。统一按列名（忽略大小写）取 id，
    // 取不到再回退第一个数值列，两种库行为一致。
    var rows = key.getKeyList();
    if (rows.isEmpty()) throw new IllegalStateException("INSERT 未返回生成键: " + sql);
    var row = rows.getFirst();
    Object id = null;
    for (var e : row.entrySet()) {
      if ("id".equalsIgnoreCase(e.getKey())) {
        id = e.getValue();
        break;
      }
    }
    if (id == null) {
      for (var v : row.values()) {
        if (v instanceof Number number) {
          id = number;
          break;
        }
      }
    }
    return ((Number) Objects.requireNonNull(id, () -> "生成键里没有数值列: " + row)).longValue();
  }
}
