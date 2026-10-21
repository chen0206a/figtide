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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Non-streaming Chat Completions adapter. Never logs upstream headers, bodies or errors. */
@Component
public class CompatibleModelProvider implements ModelProvider {
  private final ObjectMapper json;
  private final URI endpoint;
  private final String model, key;
  private final HttpClient http =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(10))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();

  @Autowired
  public CompatibleModelProvider(
      ObjectMapper json,
      @Value("${LABFLOW_AGENT_BASE_URL:https://api.deepseek.com}") String base,
      @Value("${LABFLOW_AGENT_MODEL:}") String model) {
    this(json, base, model, System.getenv().getOrDefault("LABFLOW_AGENT_API_KEY", ""));
  }

  // Explicit constructor for deterministic local HTTP tests; no key in configuration files.
  public CompatibleModelProvider(ObjectMapper json, String base, String model, String key) {
    this.json = json;
    this.model = model;
    this.key = key;
    URI uri = URI.create(base.replaceAll("/+$", "") + "/chat/completions");
    boolean loopback = List.of("127.0.0.1", "localhost", "[::1]").contains(uri.getHost());
    if ((!"https".equals(uri.getScheme()) && !(loopback && "http".equals(uri.getScheme())))
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
        ready ? "" : "请在后端环境变量中设置模型名称和 API Key；也可连接本机兼容服务。");
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
    if (response.statusCode() != 200)
      throw new IllegalStateException("模型服务返回 HTTP " + response.statusCode() + "，请检查配置或额度");
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
      throw new IllegalStateException("模型响应格式不兼容或缺少 token 用量");
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
