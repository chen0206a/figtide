package dev.labflow.review;

import java.util.*;

public record ReviewIssue(String id, String rule, String severity, String title, String detail,
    boolean fixable, List<Map<String, Object>> fix, Map<String, Object> anchor) {
  public static ReviewIssue issue(String rule, String key, String title, String detail,
      List<Map<String, Object>> fix, String kind, Object ref) {
    return new ReviewIssue(rule + ":" + key, rule, "warning", title, detail, !fix.isEmpty(),
        List.copyOf(fix), Map.of("kind", kind, "ref", ref));
  }
  public static Map<String, Object> operation(String tool, Object... pairs) {
    Map<String, Object> args = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) args.put((String) pairs[i], pairs[i + 1]);
    return Map.of("tool", tool, "arguments", args);
  }
  public ReviewIssue advice(String suffix) {
    return new ReviewIssue(id, rule, severity, title, detail + suffix, false, List.of(), anchor);
  }
}
