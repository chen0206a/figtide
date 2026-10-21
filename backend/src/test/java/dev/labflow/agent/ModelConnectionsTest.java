package dev.labflow.agent;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.sun.net.httpserver.HttpServer;
import dev.labflow.api.ApiException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.regex.Pattern;
import org.junit.jupiter.api.*;

class ModelConnectionsTest {
  final ObjectMapper json = new ObjectMapper();
  final String key = "fixture.private-key.123";
  HttpServer server;
  ModelConnections connections;
  String base;
  AtomicInteger requests;
  AtomicInteger status;
  AtomicBoolean noTools, missingId, emptyChatCalls, badArguments;
  CountDownLatch entered, release;

  @BeforeEach
  void setup() throws Exception {
    requests = new AtomicInteger();
    status = new AtomicInteger(200);
    noTools = new AtomicBoolean();
    missingId = new AtomicBoolean();
    emptyChatCalls = new AtomicBoolean();
    badArguments = new AtomicBoolean();
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    base = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
    server.createContext(
        "/v1/chat/completions",
        exchange -> {
          requests.incrementAndGet();
          var input = json.readTree(exchange.getRequestBody());
          if (entered != null) {
            entered.countDown();
            try {
              release.await(3, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
              Thread.currentThread().interrupt();
            }
          }
          int code = status.get();
          byte[] bytes;
          if (code != 200)
            bytes = ("private upstream body " + key).getBytes(StandardCharsets.UTF_8);
          else {
            var matcher =
                Pattern.compile("[a-f0-9-]{36}").matcher(input.at("/messages/0/content").asText());
            String nonce = matcher.find() ? matcher.group() : "unexpected";
            var body = json.createObjectNode().put("model", "fixture");
            var choice = body.putArray("choices").addObject();
            var message = choice.putObject("message").put("role", "assistant");
            if (input.path("tools").isArray() && !noTools.get()) {
              var call = message.putArray("tool_calls").addObject().put("type", "function");
              if (!missingId.get()) call.put("id", "probe-1");
              call.putObject("function")
                  .put("name", "labflow_connection_check")
                  .put(
                      "arguments",
                      badArguments.get()
                          ? "not-json"
                          : json.createObjectNode().put("nonce", nonce).toString());
              choice.put("finish_reason", "tool_calls");
            } else {
              message.put("content", nonce);
              if (emptyChatCalls.get()) message.putArray("tool_calls");
              choice.put("finish_reason", "stop");
            }
            body.putObject("usage").put("prompt_tokens", 20).put("completion_tokens", 10);
            bytes = json.writeValueAsBytes(body);
          }
          exchange.sendResponseHeaders(code, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    server.start();
    connections = new ModelConnections(json, base, "fixture-initial", key);
  }

  @AfterEach
  void stop() {
    if (release != null) release.countDown();
    server.stop(0);
  }

  ObjectNode input() {
    return json.createObjectNode()
        .put("revision", connections.view().path("revision").asLong())
        .put("base_url", base)
        .put("model", "fixture-new")
        .put("keep_key", true);
  }

  ObjectNode testInput() {
    return input().put("allow_test", true);
  }

  @Test
  void twoRealHttpProbesVerifyCandidateWithoutApplyingOrLeakingTheKey() {
    emptyChatCalls.set(true);
    var before = connections.view();
    var result = connections.test(testInput());
    assertTrue(result.path("ok").asBoolean(), result.toString());
    assertEquals(2, requests.get());
    assertEquals(60, result.path("tokens").asLong());
    assertEquals(before, connections.view());
    assertFalse(result.toString().contains(key));
    assertFalse(before.toString().contains(key));
    var applied = connections.configure(input().put("test_id", result.path("test_id").asText()));
    assertEquals("fixture-new", applied.path("model").asText());
    assertFalse(applied.path("verified_at").asText().isBlank());
    assertEquals(2, requests.get(), "Saving never sends paid requests");
  }

  @Test
  void replacingAddressNeverForwardsExistingKeyAndSavingWithoutTestStaysUnverified() {
    var other = input().put("base_url", "https://other.example/v1");
    assertEquals(400, assertThrows(ApiException.class, () -> connections.configure(other)).status);
    assertEquals(0, requests.get());
    var applied = connections.configure(input());
    assertTrue(applied.path("verified_at").asText().isBlank());
    assertEquals("[已脱敏]", connections.snapshot().redactSecret(key));
  }

  @Test
  void missingConsentInvalidInputAndStaleRevisionNeverSendRequests() {
    assertThrows(ApiException.class, () -> connections.test(input()));
    assertThrows(ApiException.class, () -> connections.configure(input().put("revision", 0)));
    assertThrows(ApiException.class, () -> connections.configure(input().put("api_key", key)));
    assertThrows(
        ApiException.class, () -> connections.configure(input().put("model", "bad\nmodel")));
    assertThrows(
        ApiException.class,
        () -> connections.configure(input().put("base_url", "http://outside.example")));
    assertThrows(
        ApiException.class,
        () -> connections.configure(input().put("base_url", "https://u:password@example.com/v1")));
    assertEquals(0, requests.get());
  }

  @Test
  void authEndpointAndQuotaFailuresReturnOnlySafeActionableErrors() {
    for (int code : new int[] {401, 403, 404, 429, 500}) {
      status.set(code);
      var result = connections.test(testInput());
      assertFalse(result.path("ok").asBoolean());
      assertFalse(result.toString().contains(key));
      assertFalse(result.toString().contains("private upstream"));
      assertTrue(result.path("message").asText().contains(String.valueOf(code)));
    }
    assertEquals(5, requests.get());
  }

  @Test
  void chatOnlyModelsAndMalformedToolIdsCannotBeCalledVerified() {
    noTools.set(true);
    assertEquals("tool_support", connections.test(testInput()).path("code").asText());
    noTools.set(false);
    missingId.set(true);
    assertEquals("tool_support", connections.test(testInput()).path("code").asText());
    missingId.set(false);
    badArguments.set(true);
    assertEquals("tool_support", connections.test(testInput()).path("code").asText());
    assertTrue(connections.view().path("verified_at").asText().isBlank());
  }

  @Test
  void testReceiptBindsExactModelSecretAndRevision() {
    var result = connections.test(testInput());
    assertThrows(
        ApiException.class,
        () ->
            connections.configure(
                input()
                    .put("model", "another-model")
                    .put("test_id", result.path("test_id").asText())));
    connections.configure(input());
    assertThrows(
        ApiException.class,
        () -> connections.configure(input().put("test_id", result.path("test_id").asText())));
  }

  @Test
  void snapshotsRemainStableAfterReplacementAndDisconnect() {
    var snapshot = connections.snapshot();
    connections.configure(input());
    assertEquals("fixture-initial", snapshot.info().model());
    assertEquals("fixture-new", connections.snapshot().info().model());
    connections.disconnect(
        json.createObjectNode().put("revision", connections.view().path("revision").asLong()));
    assertFalse(connections.snapshot().info().available());
    assertTrue(snapshot.info().available());
    assertFalse(connections.view().path("has_key").asBoolean());
  }

  @Test
  void concurrentProbeIsBoundedAndChangingConnectionInvalidatesAnInFlightTest() throws Exception {
    entered = new CountDownLatch(1);
    release = new CountDownLatch(1);
    var pending = CompletableFuture.supplyAsync(() -> connections.test(testInput()));
    assertTrue(entered.await(2, TimeUnit.SECONDS));
    assertEquals(429, assertThrows(ApiException.class, () -> connections.test(testInput())).status);
    connections.configure(input());
    release.countDown();
    var failure = assertThrows(ExecutionException.class, () -> pending.get(5, TimeUnit.SECONDS));
    assertInstanceOf(ApiException.class, failure.getCause());
    assertEquals(409, ((ApiException) failure.getCause()).status);
    assertTrue(connections.view().path("verified_at").asText().isBlank());
  }
}
