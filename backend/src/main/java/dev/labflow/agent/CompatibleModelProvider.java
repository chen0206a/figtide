package dev.labflow.agent;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.Flow;

/** Non-streaming Chat Completions adapter. Never logs upstream headers, bodies or errors. */
public class CompatibleModelProvider implements ModelProvider {
  public static final class Failure extends Exception {
    private final String code;

    Failure(String code, String message) {
      super(message);
      this.code = code;
    }

    public String code() {
      return code;
    }
  }

  private final ObjectMapper json;
  private final URI endpoint;
  private final String model, key;
  private final HttpClient http =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(10))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();

  // Explicit constructor for deterministic local HTTP tests; no key in configuration files.
  public CompatibleModelProvider(ObjectMapper json, String base, String model, String key) {
    this.json = json;
    this.model = model;
    this.key = key;
    URI uri = URI.create(base.replaceAll("/+$", "") + "/chat/completions");
    boolean loopback =
        uri.getHost() != null && List.of("127.0.0.1", "localhost", "[::1]").contains(uri.getHost());
    if ((!"https".equals(uri.getScheme()) && !(loopback && "http".equals(uri.getScheme())))
        || uri.getHost() == null
        || uri.getPort() == 0
        || uri.getPort() > 65535
        || uri.getUserInfo() != null
        || uri.getQuery() != null
        || uri.getFragment() != null)
      throw new IllegalArgumentException("模型地址必须为 HTTPS 或本机 HTTP，且不能包含凭据和查询参数");
    this.endpoint = uri;
  }

  @Override
  public Info info() {
    boolean local = "http".equals(endpoint.getScheme());
    boolean ready = !model.isBlank() && (local || !key.isBlank());
    return new Info(
        ready,
        model,
        endpoint.getScheme() + "://" + endpoint.getAuthority(),
        ready ? "" : "请在模型连接中配置接口地址、模型名称和 API Key；也可连接本机服务。");
  }

  @Override
  public String redactSecret(String text) {
    return key.isBlank() ? text : text.replace(key, "[已脱敏]");
  }

  @Override
  public Reply complete(ArrayNode messages, ArrayNode tools, int maxOutputTokens, Duration timeout)
      throws Exception {
    if (!info().available()) throw new IllegalStateException("模型尚未配置");
    var body =
        json.createObjectNode()
            .put("model", model)
            .put("stream", false)
            .put("max_tokens", maxOutputTokens);
    body.set("messages", messages);
    if (!tools.isEmpty()) {
      body.set("tools", tools);
      body.put("tool_choice", "auto");
    }
    var builder =
        HttpRequest.newBuilder(endpoint)
            .timeout(timeout)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()));
    if (!key.isBlank()) builder.header("Authorization", "Bearer " + key);
    var pending = http.sendAsync(builder.build(), ignored -> new LimitedBody());
    HttpResponse<byte[]> response;
    try {
      response = pending.get(Math.max(1, timeout.toMillis()), TimeUnit.MILLISECONDS);
    } finally {
      // Cancels both request and response-body consumption on timeout or thread interruption.
      if (!pending.isDone()) pending.cancel(true);
    }
    if (response.statusCode() != 200) {
      int status = response.statusCode();
      throw new Failure(
          status == 401 || status == 403
              ? "authentication"
              : status == 429 ? "rate_limit" : status == 404 ? "endpoint" : "provider_error",
          status == 401 || status == 403
              ? "鉴权失败（HTTP " + status + "），请检查 API Key 与权限"
              : status == 429
                  ? "服务限流或额度不足（HTTP 429），请检查服务账户"
                  : status == 404 ? "接口不存在（HTTP 404），请检查兼容地址" : "模型服务返回 HTTP " + status + "，请稍后重试");
    }
    try {
      JsonNode root = json.readTree(response.body());
      JsonNode choice = root.path("choices").path(0), message = choice.path("message");
      JsonNode usage = root.path("usage");
      for (String field : List.of("prompt_tokens", "completion_tokens"))
        if (!usage.path(field).isIntegralNumber()
            || !usage.path(field).canConvertToInt()
            || usage.path(field).asInt() < 0) throw new IllegalArgumentException();
      if (!message.isObject()
          || !"assistant".equals(message.path("role").asText())
          || !choice.path("finish_reason").isTextual()) throw new IllegalArgumentException();
      // Preserve tool call ids (and optional reasoning_content) exactly for the next round.
      return new Reply(
          (ObjectNode) message,
          usage.path("prompt_tokens").asInt(),
          usage.path("completion_tokens").asInt(),
          root.path("model").asText(model),
          choice.path("finish_reason").asText());
    } catch (Exception e) {
      throw new Failure("protocol", "模型响应格式不兼容或缺少 token 用量");
    }
  }

  /**
   * Bound the entire upstream response, including error bodies, before allocating a large array.
   */
  private static class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
    final HttpResponse.BodySubscriber<byte[]> delegate = HttpResponse.BodySubscribers.ofByteArray();
    Flow.Subscription subscription;
    int size;

    public CompletionStage<byte[]> getBody() {
      return delegate.getBody();
    }

    public void onSubscribe(Flow.Subscription value) {
      subscription = value;
      delegate.onSubscribe(value);
    }

    public void onNext(List<ByteBuffer> chunks) {
      for (var chunk : chunks) size += chunk.remaining();
      if (size > 1_000_000) {
        subscription.cancel();
        delegate.onError(new IllegalStateException("模型响应超过大小限制"));
      } else delegate.onNext(chunks);
    }

    public void onError(Throwable error) {
      delegate.onError(error);
    }

    public void onComplete() {
      delegate.onComplete();
    }
  }
}
