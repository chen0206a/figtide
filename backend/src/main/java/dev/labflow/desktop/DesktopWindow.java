package dev.labflow.desktop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.Function;
import java.util.function.Supplier;
import org.slf4j.LoggerFactory;

/**
 * 任务 16：独立窗口。优先用系统 Microsoft Edge 的应用模式（--app、独立 user-data-dir、
 * 固定 127.0.0.1 地址）打开界面；找不到 Edge 或启动失败时退回默认浏览器并给出原因。
 * user-data-dir 与 data 目录平级（默认 %LOCALAPPDATA%\FigTide\window），保证草稿与页面
 * 偏好的 localStorage 始终落在同一个固定目录里。
 */
final class DesktopWindow {
  /** 与 %LOCALAPPDATA%\FigTide\data 平级的窗口数据目录名。 */
  static final String WINDOW_DIR_NAME = "window";
  /** desktop.json 里记录「升级提示已展示」的字段。 */
  static final String NOTICE_FIELD = "app_window_notice_shown";

  enum Mode { APP, BROWSER }

  /** 打开结果：app=独立窗口；browser=退回浏览器（reason 说明为什么）。 */
  record Opened(String kind, String reason) {
    boolean fallback() { return !"app".equals(kind); }
  }

  @FunctionalInterface
  interface ProcessLauncher { Process start(List<String> command) throws IOException; }

  private final Mode mode;
  private final Path userDataDir;
  private final Supplier<Optional<Path>> edgeLookup;
  private final ProcessLauncher launcher;
  private final BiConsumer<URI, String> fallbackBrowser;

  DesktopWindow(Mode mode, Path dataDir) {
    this(mode, dataDir, System.getenv());
  }

  DesktopWindow(Mode mode, Path dataDir, Map<String, String> env) {
    this(mode, dataDir, env, () -> findEdge(env), command -> new ProcessBuilder(command).start(),
        (uri, reason) -> { LoggerFactory.getLogger(DesktopWindow.class).warn("独立窗口退回浏览器：{}", reason); DesktopUi.browse(uri); });
  }

  /** 测试用：注入 Edge 查找、进程启动与退回浏览器三个边界。 */
  DesktopWindow(Mode mode, Path dataDir, Map<String, String> env, Supplier<Optional<Path>> edgeLookup,
      ProcessLauncher launcher, BiConsumer<URI, String> fallbackBrowser) {
    this.mode = mode;
    this.userDataDir = dataDir.resolveSibling(WINDOW_DIR_NAME).toAbsolutePath().normalize();
    this.edgeLookup = edgeLookup;
    this.launcher = launcher;
    this.fallbackBrowser = fallbackBrowser;
  }

  Path userDataDir() { return userDataDir; }

  Opened open(URI uri) {
    if (mode == Mode.BROWSER) {
      String reason = "配置 labflow.desktop.window=browser";
      fallbackBrowser.accept(uri, reason);
      return new Opened("browser", reason);
    }
    Optional<Path> edge = edgeLookup.get();
    if (edge.isEmpty()) {
      String reason = "未找到 Microsoft Edge（已用默认浏览器打开）";
      fallbackBrowser.accept(uri, reason);
      return new Opened("browser", reason);
    }
    try {
      Process process = launcher.start(command(edge.get(), uri, userDataDir));
      // Edge may hand the window to an existing process and exit successfully.
      // A non-zero early exit instead means no usable window was opened.
      if (process.waitFor(1, TimeUnit.SECONDS) && process.exitValue() != 0)
        throw new IOException("Edge 进程提前退出（退出码 " + process.exitValue() + "）");
      return new Opened("app", null);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      String reason = "Edge 启动检测被中断（已用默认浏览器打开）";
      fallbackBrowser.accept(uri, reason);
      return new Opened("browser", reason);
    } catch (IOException | RuntimeException e) {
      String reason = "Edge 启动失败：" + e.getMessage();
      fallbackBrowser.accept(uri, reason);
      return new Opened("browser", reason);
    }
  }

  /** 生产启动参数；绝不包含任何调试参数（--remote-debugging-port 只允许出现在测试探针里）。 */
  static List<String> command(Path edge, URI uri, Path userDataDir) {
    return List.of(edge.toString(),
        "--app=" + uri.toASCIIString(),
        "--user-data-dir=" + userDataDir,
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,900");
  }

  static Mode mode(String value) {
    String normalized = value == null ? "app" : value.trim().toLowerCase(Locale.ROOT);
    return switch (normalized) {
      case "app" -> Mode.APP;
      case "browser" -> Mode.BROWSER;
      default -> throw new IllegalArgumentException("labflow.desktop.window 只支持 app 或 browser，收到：" + value);
    };
  }

  // ---- Edge 查找：注册表 App Paths，然后 ProgramFiles 候选目录 ----

  static Optional<Path> findEdge(Map<String, String> env) {
    return findEdge(env, key -> regQuery(key));
  }

  /** registry 注入便于单测；输出为 null 表示查询失败（非 Windows / reg 不存在）。 */
  static Optional<Path> findEdge(Map<String, String> env, Function<String, String> registry) {
    for (String root : List.of("HKLM", "HKCU")) {
      String output = registry.apply(root + "\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion"
          + "\\App Paths\\msedge.exe");
      if (output != null) {
        Optional<Path> path = parseRegQuery(output);
        if (path.isPresent() && Files.isRegularFile(path.get())) return path;
      }
    }
    for (Path candidate : candidatePaths(env))
      if (Files.isRegularFile(candidate)) return Optional.of(candidate);
    return Optional.empty();
  }

  /** 解析 `reg query … /ve` 输出中带 REG_SZ 的默认值行；(默认)/(Default) 等本地化名称都兼容。 */
  static Optional<Path> parseRegQuery(String output) {
    if (output == null) return Optional.empty();
    for (String line : output.split("\\R")) {
      int marker = line.indexOf("REG_SZ");
      if (marker < 0) continue;
      String value = line.substring(marker + "REG_SZ".length()).trim().replace("\"", "");
      if (value.isEmpty()) continue;
      try { return Optional.of(Path.of(value)); } catch (InvalidPathException ignored) { }
    }
    return Optional.empty();
  }

  static List<Path> candidatePaths(Map<String, String> env) {
    var result = new ArrayList<Path>();
    for (String key : List.of("ProgramFiles(x86)", "ProgramFiles")) {
      String dir = env.get(key);
      if (dir != null && !dir.isBlank()) result.add(Path.of(dir, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    return result;
  }

  private static String regQuery(String key) {
    try {
      var process = new ProcessBuilder("reg", "query", key, "/ve").redirectErrorStream(true).start();
      var text = new StringBuilder();
      try (var reader = process.inputReader()) {
        String line;
        while ((line = reader.readLine()) != null) text.append(line).append('\n');
      }
      if (!process.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) return null;
      return text.toString();
    } catch (Exception e) { return null; }
  }

  // ---- 升级提示（16-3）：记录在 desktop.json，只提示一次 ----

  /** desktop.json 是否还没有展示过升级提示；文件不存在（新装）返回 false。 */
  static boolean noticeDue(Path dataDir) throws IOException {
    Path file = dataDir.resolve("desktop.json");
    if (!Files.exists(file)) return false;
    if (Files.size(file) > 4096) return false;
    var tree = new ObjectMapper().readTree(Files.readString(file));
    return !tree.path(NOTICE_FIELD).asBoolean(false);
  }

  /** 在 desktop.json 里标记提示已展示，保留其它字段（preferred_port 等）。文件不存在时不创建。 */
  static void markNotice(Path dataDir) throws IOException {
    Path file = dataDir.resolve("desktop.json");
    if (!Files.exists(file)) return;
    var mapper = new ObjectMapper();
    var tree = (ObjectNode) mapper.readTree(Files.readString(file));
    tree.put(NOTICE_FIELD, true);
    Path temporary = Files.createTempFile(dataDir, "desktop-", ".tmp");
    try {
      Files.writeString(temporary, mapper.writeValueAsString(tree) + "\n");
      try { Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE); }
      catch (AtomicMoveNotSupportedException e) { Files.move(temporary, file); }
    } finally { Files.deleteIfExists(temporary); }
  }
}
