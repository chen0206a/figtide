package dev.labflow.desktop;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.*;
import java.nio.file.*;
import java.util.Map;

/** Called only after acquiring the data-directory lock. Actual ports belong in app.port. */
record DesktopPort(int preferred, int requested) {
  static final int DEFAULT_PORT = 17861;
  static final String FALLBACK_NOTICE = "端口被占用，本次无法沿用未保存的草稿和页面偏好";
  private static final ObjectMapper JSON = new ObjectMapper();

  static DesktopPort select(Path data, String[] args) throws IOException {
    Path file = data.resolve("desktop.json");
    String override = DesktopPaths.option(args, "labflow.desktop.port", null);
    int preferred;
    if (Files.exists(file)) {
      if (Files.size(file) > 4096) throw new IOException("desktop.json 超出大小限制");
      var value = JSON.readTree(Files.readString(file)).path("preferred_port");
      if (!value.isIntegralNumber() || !value.canConvertToInt())
        throw new IOException("desktop.json 的 preferred_port 必须是整数");
      preferred = valid(value.intValue());
    } else {
      preferred = override == null ? DEFAULT_PORT : parse(override);
      Path temporary = Files.createTempFile(data, "desktop-", ".tmp");
      try {
        Files.writeString(temporary, JSON.writeValueAsString(Map.of("preferred_port", preferred)) + "\n");
        try { Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE); }
        catch (AtomicMoveNotSupportedException e) { Files.move(temporary, file); }
      } finally { Files.deleteIfExists(temporary); }
    }
    // An explicit override is per-run; it must never overwrite an existing preference.
    if (override != null) preferred = parse(override);
    try (var socket = new ServerSocket()) {
      socket.setReuseAddress(false);
      socket.bind(new InetSocketAddress("127.0.0.1", preferred));
      return new DesktopPort(preferred, preferred);
    } catch (BindException e) {
      return new DesktopPort(preferred, 0);
    }
  }

  DesktopPort fallback() { return new DesktopPort(preferred, 0); }
  boolean temporary() { return requested == 0; }

  private static int parse(String value) throws IOException {
    try { return valid(Integer.parseInt(value)); }
    catch (NumberFormatException e) { throw new IOException("labflow.desktop.port 必须是 1–65535 的整数", e); }
  }
  private static int valid(int port) throws IOException {
    if (port < 1 || port > 65535) throw new IOException("桌面首选端口必须在 1–65535 之间");
    return port;
  }
}
