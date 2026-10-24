package dev.labflow.desktop;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.channels.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** The OS lock owns the database; a stale file is never treated as a live lock. */
public final class DesktopInstance implements AutoCloseable {
  private static final ObjectMapper JSON = new ObjectMapper();
  private final Path data;
  private final FileChannel channel;
  private final FileLock lock;
  private final AtomicBoolean closed = new AtomicBoolean();
  private final String id = UUID.randomUUID().toString();
  private volatile int port;

  private DesktopInstance(Path data, FileChannel channel, FileLock lock) {
    this.data = data; this.channel = channel; this.lock = lock;
  }

  static Optional<DesktopInstance> acquire(Path data) throws IOException {
    Files.createDirectories(data);
    FileChannel channel = FileChannel.open(data.resolve("app.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
    try {
      FileLock lock = channel.tryLock();
      if (lock != null) return Optional.of(new DesktopInstance(data, channel, lock));
    } catch (OverlappingFileLockException ignored) {
      // Another runtime in this JVM owns it; identical to an interprocess lock conflict.
    } catch (IOException | RuntimeException e) {
      channel.close(); throw e;
    }
    channel.close(); return Optional.empty();
  }

  public String id() { return id; }
  public URI uri() { return URI.create("http://127.0.0.1:" + port + "/"); }

  synchronized void publish(int actualPort) throws IOException {
    if (actualPort < 1 || actualPort > 65535 || closed.get()) throw new IOException("Invalid desktop port");
    Path temporary = data.resolve("app.port." + id + ".tmp");
    Files.writeString(temporary, JSON.writeValueAsString(Map.of("port", actualPort, "instance_id", id)));
    try { Files.move(temporary, data.resolve("app.port"), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
    catch (AtomicMoveNotSupportedException e) { Files.move(temporary, data.resolve("app.port"), StandardCopyOption.REPLACE_EXISTING); }
    port = actualPort;
  }

  static Optional<URI> running(Path data) {
    try {
      Path file = data.resolve("app.port");
      if (Files.size(file) > 4096) return Optional.empty();
      var record = JSON.readTree(Files.readString(file));
      int port = record.path("port").asInt();
      String id = record.path("instance_id").asText();
      if (port < 1 || port > 65535 || !id.matches("[0-9a-f-]{36}")) return Optional.empty();
      URI base = URI.create("http://127.0.0.1:" + port + "/");
      var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1))
          .followRedirects(HttpClient.Redirect.NEVER).build();
      var response = client.send(HttpRequest.newBuilder(base.resolve("api/desktop/ping"))
          .timeout(Duration.ofSeconds(1)).GET().build(), HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() == 200 && id.equals(JSON.readTree(response.body()).path("instance_id").asText()))
        return Optional.of(base);
    } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    catch (Exception ignored) { /* Startup race or stale record: never contact an arbitrary host. */ }
    return Optional.empty();
  }

  @Override public synchronized void close() throws IOException {
    if (!closed.compareAndSet(false, true)) return;
    try {
      Path file = data.resolve("app.port");
      if (Files.exists(file)) {
        try {
          if (id.equals(JSON.readTree(Files.readString(file)).path("instance_id").asText())) Files.delete(file);
        } catch (IOException ignored) { /* Lock release still must run. */ }
      }
    } finally {
      try { lock.release(); } finally { channel.close(); }
    }
    // Keep the lock file: unlinking it creates a race between two different lock-file inodes.
  }
}
