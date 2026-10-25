package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DesktopPortTest {
  @TempDir Path data;

  private int freePort() throws Exception {
    for (int port = 17862; port < 17962; port++) {
      try (var socket = new ServerSocket()) {
        socket.bind(new InetSocketAddress("127.0.0.1", port)); return port;
      } catch (BindException ignored) { }
    }
    throw new IllegalStateException("No isolated test port available");
  }

  @Test void consecutiveLaunchesReuseThePersistedPreference() throws Exception {
    int port = freePort();
    var first = DesktopPort.select(data, new String[]{"--labflow.desktop.port=" + port});
    assertEquals(port, first.requested());
    byte[] before = Files.readAllBytes(data.resolve("desktop.json"));
    try (var server = new ServerSocket()) {
      server.bind(new InetSocketAddress("127.0.0.1", first.requested()));
      assertEquals(port, server.getLocalPort());
    }
    var second = DesktopPort.select(data, new String[0]);
    assertEquals(first, second);
    assertArrayEquals(before, Files.readAllBytes(data.resolve("desktop.json")));
  }

  @Test void occupiedPreferenceFallsBackWithoutChangingDesktopJsonAndNextLaunchRetriesIt() throws Exception {
    int port = freePort();
    DesktopPort.select(data, new String[]{"--labflow.desktop.port=" + port});
    byte[] before = Files.readAllBytes(data.resolve("desktop.json"));
    try (var occupied = new ServerSocket()) {
      occupied.bind(new InetSocketAddress("127.0.0.1", port));
      var fallback = DesktopPort.select(data, new String[0]);
      assertTrue(fallback.temporary());
      assertEquals(port, fallback.preferred());
      try (var server = new ServerSocket()) {
        server.bind(new InetSocketAddress("127.0.0.1", fallback.requested()));
        assertTrue(server.getLocalPort() > 0);
        assertNotEquals(port, server.getLocalPort());
      }
      assertArrayEquals(before, Files.readAllBytes(data.resolve("desktop.json")));
    }
    assertEquals(port, DesktopPort.select(data, new String[0]).requested());
  }

  @Test void firstLaunchRecordsDefaultEvenIfItIsUnavailable() throws Exception {
    var selection = DesktopPort.select(data, new String[0]);
    assertEquals(17861, selection.preferred());
    assertTrue(selection.preferred() < 49152);
    assertEquals(17861, new ObjectMapper().readTree(Files.readString(data.resolve("desktop.json"))).path("preferred_port").intValue());
  }

  @Test void overrideIsPerRunWhenAPreferenceAlreadyExists() throws Exception {
    int original = freePort();
    DesktopPort.select(data, new String[]{"--labflow.desktop.port=" + original});
    byte[] before = Files.readAllBytes(data.resolve("desktop.json"));
    var override = DesktopPort.select(data, new String[]{"--labflow.desktop.port=" + (original + 1)});
    assertEquals(original + 1, override.preferred());
    assertArrayEquals(before, Files.readAllBytes(data.resolve("desktop.json")));
    assertEquals(original, DesktopPort.select(data, new String[0]).preferred());
  }

  @Test void invalidOrCorruptPreferencesFailRatherThanSilentlyChangingTheOrigin() throws Exception {
    assertThrows(java.io.IOException.class, () -> DesktopPort.select(data, new String[]{"--labflow.desktop.port=0"}));
    Files.writeString(data.resolve("desktop.json"), "{\"preferred_port\":1.5}");
    assertThrows(java.io.IOException.class, () -> DesktopPort.select(data, new String[0]));
    Files.writeString(data.resolve("desktop.json"), "{\"preferred_port\":70000}");
    assertThrows(java.io.IOException.class, () -> DesktopPort.select(data, new String[0]));
  }
}
