package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DesktopLauncherTest {
  @TempDir Path temp;

  @Test void choosesWindowsUserDirectoriesAndSupportsExplicitDataLocation() {
    var normal = DesktopPaths.resolve(new String[0], Map.of("LOCALAPPDATA", temp.toString()), "ignored");
    assertEquals(temp.resolve("FigTide/data"), normal.data());
    assertEquals(temp.resolve("FigTide/logs"), normal.logs());
    var fallback = DesktopPaths.resolve(new String[0], Map.of(), temp.toString());
    assertEquals(temp.resolve("AppData/Local/FigTide/data"), fallback.data());
    var custom = DesktopPaths.resolve(new String[]{"--labflow.data-dir=" + temp.resolve("中文 空间/data")}, Map.of(), "ignored");
    assertEquals(temp.resolve("中文 空间/data"), custom.data());
    assertEquals(temp.resolve("中文 空间/logs"), custom.logs());
  }

  @Test void desktopEntrypointIsExplicit() {
    assertFalse(DesktopLauncher.enabled(new String[]{"--spring.profiles.active=dev"}));
    assertTrue(DesktopLauncher.enabled(new String[]{"--spring.profiles.active=other,desktop"}));
  }

  @Test void osLockPreventsSecondOwnerAndCleanExitRemovesPortOnly() throws Exception {
    try (var first = DesktopInstance.acquire(temp).orElseThrow()) {
      first.publish(18888);
      assertTrue(DesktopInstance.acquire(temp).isEmpty());
      assertTrue(Files.readString(temp.resolve("app.port")).contains(first.id()));
      Files.writeString(temp.resolve("user-data.txt"), "keep");
    }
    assertFalse(Files.exists(temp.resolve("app.port")));
    assertTrue(Files.exists(temp.resolve("app.lock")));
    assertEquals("keep", Files.readString(temp.resolve("user-data.txt")));
    try (var next = DesktopInstance.acquire(temp).orElseThrow()) { assertNotNull(next); }
  }

  @Test void stalePortRecordDoesNotPreventAcquiringTheFreeLock() throws Exception {
    Files.writeString(temp.resolve("app.port"), "{\"port\":1,\"instance_id\":\"00000000-0000-0000-0000-000000000000\"}");
    try (var instance = DesktopInstance.acquire(temp).orElseThrow()) {
      instance.publish(18889);
      assertTrue(Files.readString(temp.resolve("app.port")).contains(instance.id()));
    }
  }

  @Test void verifiesExistingInstanceIdentityBeforeReusingItsPort() throws Exception {
    try (var instance = DesktopInstance.acquire(temp).orElseThrow()) {
      var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      var reply = new java.util.concurrent.atomic.AtomicReference<>(instance.id());
      server.createContext("/api/desktop/ping", exchange -> {
        byte[] body = ("{\"instance_id\":\"" + reply.get() + "\"}").getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, body.length);
        try (var out = exchange.getResponseBody()) { out.write(body); }
      });
      server.start();
      try {
        instance.publish(server.getAddress().getPort());
        assertEquals(instance.uri(), DesktopInstance.running(temp).orElseThrow());
        reply.set("unrelated-service");
        assertTrue(DesktopInstance.running(temp).isEmpty());
      } finally { server.stop(0); }
    }
  }

  @Test void corruptOrNonLoopbackRecordIsNotUsed() throws Exception {
    Files.writeString(temp.resolve("app.port"), "not-json");
    assertTrue(DesktopInstance.running(temp).isEmpty());
    Files.writeString(temp.resolve("app.port"), "{\"port\":70000,\"instance_id\":\"00000000-0000-0000-0000-000000000000\"}");
    assertTrue(DesktopInstance.running(temp).isEmpty());
  }

  @Test void desktopLogConfigurationKeepsFiveSizeRolledArchives() throws Exception {
    try (var stream = getClass().getResourceAsStream("/logback-desktop.xml")) {
      String xml = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
      assertTrue(xml.contains("SizeBasedTriggeringPolicy"));
      assertTrue(xml.contains("<maxIndex>5</maxIndex>"));
      assertTrue(xml.contains("${DESKTOP_LOG_DIR}/figtide.log"));
    }
  }
}
