package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.sun.net.httpserver.HttpServer;
import dev.labflow.agent.CompatibleModelProvider;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;

class CompatibleModelProviderTest {
  ObjectMapper json = new ObjectMapper();
  HttpServer server;
  String base;

  @BeforeEach
  void start() throws Exception {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    base = "http://127.0.0.1:" + server.getAddress().getPort();
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  @Test
  void realHttpTranslatesMessagesToolsUsageAndPreservesToolIds() throws Exception {
    server.createContext(
        "/chat/completions",
        exchange -> {
          assertEquals(
              "Bearer fixture-secret", exchange.getRequestHeaders().getFirst("Authorization"));
          JsonNode request = json.readTree(exchange.getRequestBody());
          assertEquals(123, request.path("max_tokens").asInt());
          assertEquals("fixture-model", request.path("model").asText());
          assertFalse(request.path("stream").asBoolean());
          byte[] bytes =
              "{\"model\":\"actual-model\",\"choices\":[{\"finish_reason\":\"tool_calls\",\"message\":{\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"exact-id\",\"type\":\"function\",\"function\":{\"name\":\"lint_figure\",\"arguments\":\"{}\"}}]}}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":3}}"
                  .getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(200, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    server.start();
    var provider = new CompatibleModelProvider(json, base, "fixture-model", "fixture-secret");
    var reply =
        provider.complete(
            json.createArrayNode(), json.createArrayNode(), 123, Duration.ofSeconds(2));
    assertEquals("exact-id", reply.message().at("/tool_calls/0/id").asText());
    assertEquals(12, reply.promptTokens());
    assertEquals("actual-model", reply.model());
    assertFalse(provider.info().toString().contains("fixture-secret"));
  }

  @Test
  void providerErrorsNeverExposeBodyOrSecret() throws Exception {
    server.createContext(
        "/chat/completions",
        exchange -> {
          byte[] bytes = "fixture-secret and confidential request".getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(401, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    server.start();
    var provider = new CompatibleModelProvider(json, base, "fixture", "fixture-secret");
    var error =
        assertThrows(
            Exception.class,
            () ->
                provider.complete(
                    json.createArrayNode(), json.createArrayNode(), 10, Duration.ofSeconds(2)));
    assertFalse(error.getMessage().contains("fixture-secret"));
    assertTrue(error.getMessage().contains("401"));
  }

  @Test
  void unrestrictedEvaluationDoesNotSendALocalOutputTokenCap() throws Exception {
    var received=new CompletableFuture<JsonNode>();
    server.createContext("/chat/completions",exchange->{received.complete(json.readTree(exchange.getRequestBody()));byte[] bytes="{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":3}}".getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});
    server.start();new CompatibleModelProvider(json,base,"fixture","").complete(json.createArrayNode(),json.createArrayNode(),0,Duration.ofSeconds(2));
    assertFalse(received.get(2,TimeUnit.SECONDS).has("max_tokens"));
  }

  @Test
  void textOnlyClosingRequestOmitsEmptyToolsAndToolChoice() throws Exception {
    var received = new CompletableFuture<JsonNode>();
    server.createContext(
        "/chat/completions",
        exchange -> {
          received.complete(json.readTree(exchange.getRequestBody()));
          byte[] bytes =
              "{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"role\":\"assistant\",\"content\":\"请确认候选\"}}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":3}}"
                  .getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(200, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    server.start();
    var provider = new CompatibleModelProvider(json, base, "fixture", "");
    var reply =
        provider.complete(
            json.createArrayNode(), json.createArrayNode(), 128, Duration.ofSeconds(2));
    var request = received.get(2, TimeUnit.SECONDS);
    assertFalse(request.has("tools"));
    assertFalse(request.has("tool_choice"));
    assertEquals("stop", reply.finishReason());
  }

  @Test
  void timeoutAlsoBoundsResponseBodyConsumption() throws Exception {
    server.createContext(
        "/chat/completions",
        exchange -> {
          exchange.sendResponseHeaders(200, 1000);
          try {
            Thread.sleep(700);
          } catch (InterruptedException ignored) {
          }
          exchange.close();
        });
    server.start();
    var provider = new CompatibleModelProvider(json, base, "fixture", "");
    long start = System.nanoTime();
    assertThrows(
        Exception.class,
        () ->
            provider.complete(
                json.createArrayNode(), json.createArrayNode(), 10, Duration.ofMillis(120)));
    assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 650);
  }

  @Test
  void oversizedResponseFailsClosed() throws Exception {
    server.createContext(
        "/chat/completions",
        exchange -> {
          byte[] bytes = new byte[1_000_001];
          exchange.sendResponseHeaders(200, bytes.length);
          try {
            exchange.getResponseBody().write(bytes);
          } finally {
            exchange.close();
          }
        });
    server.start();
    var provider = new CompatibleModelProvider(json, base, "fixture", "");
    assertThrows(
        Exception.class,
        () ->
            provider.complete(
                json.createArrayNode(), json.createArrayNode(), 10, Duration.ofSeconds(2)));
  }

  @Test
  void missingUsageIsAnIncompatibleResponse() throws Exception {
    server.createContext(
        "/chat/completions",
        exchange -> {
          byte[] bytes =
              "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"text\"},\"finish_reason\":\"stop\"}]}"
                  .getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(200, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    server.start();
    var provider = new CompatibleModelProvider(json, base, "fixture", "");
    var error =
        assertThrows(
            Exception.class,
            () ->
                provider.complete(
                    json.createArrayNode(), json.createArrayNode(), 10, Duration.ofSeconds(2)));
    assertTrue(error.getMessage().contains("token 用量"));
  }

  @Test
  void keylessRemoteAndInsecureRemoteAreNotEnabled() {
    for (String base :
        new String[] {"https:/missing-host", "https://example.com:0", "https://example.com:70000"})
      assertThrows(
          IllegalArgumentException.class,
          () -> new CompatibleModelProvider(json, base, "fixture", "fixture-secret"));
    assertFalse(
        new CompatibleModelProvider(json, "https://api.deepseek.com", "chosen-model", "")
            .info()
            .available());
    assertThrows(
        IllegalArgumentException.class,
        () -> new CompatibleModelProvider(json, "http://example.com", "fixture", "secret"));
  }
}
