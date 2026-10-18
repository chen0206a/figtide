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
    return Objects.requireNonNull(key.getKey()).longValue();
  }
}
