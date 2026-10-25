package dev.labflow.desktop;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.Map;

public record DesktopPaths(Path data, Path logs) {
  static String option(String[] args, String key, String fallback) {
    String prefix = "--" + key + "=";
    return Arrays.stream(args).filter(a -> a.startsWith(prefix)).reduce((a, b) -> b)
        .map(a -> a.substring(prefix.length())).orElseGet(() -> System.getProperty(key, fallback));
  }

  static DesktopPaths resolve(String[] args, Map<String, String> env, String home) {
    String local = env.get("LOCALAPPDATA");
    Path base = (local == null || local.isBlank() ? Path.of(home, "AppData", "Local") : Path.of(local)).resolve("FigTide");
    String custom = option(args, "labflow.data-dir", env.getOrDefault("LABFLOW_DATA_DIR", base.resolve("data").toString()));
    Path data = Path.of(custom).toAbsolutePath().normalize();
    Path logs = Path.of(option(args, "labflow.desktop.logs-dir", data.resolveSibling("logs").toString()))
        .toAbsolutePath().normalize();
    return new DesktopPaths(data, logs);
  }
}
