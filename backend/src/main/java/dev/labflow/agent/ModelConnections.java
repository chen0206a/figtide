package dev.labflow.agent;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import java.time.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Local single-user connection settings. Keys and test receipts never leave process memory. */
@Service
public class ModelConnections {
  private final ObjectMapper json;
  private final Semaphore probes = new Semaphore(1);
  private Connection current;
  private Receipt receipt;

  private record Connection(
      long revision,
      String base,
      String model,
      String key,
      String source,
      String verifiedAt,
      ModelProvider provider) {}

  private record Receipt(String id, long revision, String fingerprint, Instant at) {}

  @Autowired
  public ModelConnections(
      ObjectMapper json,
      @Value("${LABFLOW_AGENT_BASE_URL:https://api.deepseek.com}") String base,
      @Value("${LABFLOW_AGENT_MODEL:}") String model) {
    this(json, base, model, System.getenv().getOrDefault("LABFLOW_AGENT_API_KEY", ""));
  }

  ModelConnections(ObjectMapper json, String base, String model, String key) {
    this.json = json;
    current = connection(1, base.replaceAll("/+$", ""), model, key, "environment", "");
  }

  private Connection connection(
      long revision, String base, String model, String key, String source, String verified) {
    return new Connection(
        revision,
        base,
        model,
        key,
        source,
        verified,
        new CompatibleModelProvider(json, base, model, key));
  }

  public synchronized ModelProvider snapshot() {
    return current.provider;
  }

  public synchronized ObjectNode view() {
    return json.createObjectNode()
        .put("revision", current.revision)
        .put("available", current.provider.info().available())
        .put("base_url", current.base)
        .put("model", current.model)
        .put("has_key", !current.key.isBlank())
        .put("source", current.source)
        .put("verified_at", current.verifiedAt);
  }

  private void envelope(JsonNode input, boolean testing) {
    if (!input.isObject() || input.toString().length() > 9000) throw ApiException.bad("连接设置格式无效");
    Set<String> allowed =
        testing
            ? Set.of("revision", "base_url", "model", "api_key", "keep_key", "allow_test")
            : Set.of("revision", "base_url", "model", "api_key", "keep_key", "test_id");
    input
        .fieldNames()
        .forEachRemaining(
            k -> {
              if (!allowed.contains(k)) throw ApiException.bad("连接设置包含不支持的字段");
            });
    if (!input.path("revision").isIntegralNumber()
        || !input.path("revision").canConvertToLong()
        || input.path("revision").asLong() != current.revision)
      throw new ApiException(409, "连接已变更，请重新读取后再试");
  }

  private Connection candidate(JsonNode input, boolean testing) {
    envelope(input, testing);
    if (!input.path("base_url").isTextual()
        || !input.path("model").isTextual()
        || (input.has("api_key") && !input.path("api_key").isTextual())
        || (input.has("keep_key") && !input.path("keep_key").isBoolean()))
      throw ApiException.bad("请填写有效的接口地址和模型名称");
    String base = input.path("base_url").asText().strip().replaceAll("/+$", "");
    String model = input.path("model").asText().strip();
    String key = input.path("api_key").asText("").strip();
    if (base.length() > 1024
        || !model.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}")
        || key.length() > 4096
        || key.chars().anyMatch(c -> c < 33 || c > 126)) throw ApiException.bad("接口地址、模型名称或密钥格式无效");
    if (input.path("keep_key").asBoolean()) {
      if (!key.isEmpty() || !base.equals(current.base))
        throw ApiException.bad("更换接口地址时请重新填写密钥，原密钥不会转发到新地址");
      key = current.key;
    }
    try {
      var result = connection(current.revision, base, model, key, "session", "");
      if (!result.provider.info().available())
        throw ApiException.bad("请填写模型名称和 API Key；本机 HTTP 服务可不填密钥");
      return result;
    } catch (IllegalArgumentException invalid) {
      throw ApiException.bad("请使用不含凭据或查询参数的 HTTPS 地址，或本机 HTTP 地址");
    }
  }

  private String fingerprint(Connection c) {
    return AuditSanitizer.hash(
        json.createObjectNode().put("base", c.base).put("model", c.model).put("key", c.key));
  }

  public synchronized ObjectNode configure(JsonNode input) {
    var candidate = candidate(input, false);
    String verified = "";
    if (input.has("test_id")) {
      if (!input.path("test_id").isTextual()
          || receipt == null
          || !receipt.id.equals(input.path("test_id").asText())
          || receipt.revision != current.revision
          || receipt.at.plusSeconds(600).isBefore(Instant.now())
          || !receipt.fingerprint.equals(fingerprint(candidate)))
        throw new ApiException(409, "测试结果已过期或设置已改变，请重新测试");
      verified = receipt.at.toString();
    }
    current =
        connection(
            current.revision + 1,
            candidate.base,
            candidate.model,
            candidate.key,
            "session",
            verified);
    receipt = null;
    return view();
  }

  public synchronized ObjectNode disconnect(JsonNode input) {
    if (!input.isObject()
        || input.size() != 1
        || !input.path("revision").isIntegralNumber()
        || input.path("revision").asLong() != current.revision)
      throw new ApiException(409, "连接已变更，请重新读取后再试");
    current = connection(current.revision + 1, "https://api.deepseek.com", "", "", "disabled", "");
    receipt = null;
    return view();
  }

  /** Two fixed synthetic requests; no chart data, dataset or workspace tools are reachable. */
  public ObjectNode test(JsonNode input) {
    final Connection candidate;
    synchronized (this) {
      candidate = candidate(input, true);
      if (!input.path("allow_test").isBoolean() || !input.path("allow_test").asBoolean())
        throw ApiException.bad("请确认发送两条固定测试请求，模型服务可能计费");
    }
    if (!probes.tryAcquire()) throw new ApiException(429, "已有连接测试正在进行，请稍后重试");
    long started = System.nanoTime();
    long tokens = 0;
    try {
      String nonce = UUID.randomUUID().toString();
      var messages = json.createArrayNode();
      messages
          .addObject()
          .put("role", "user")
          .put("content", "LabFlow connection check. Reply with exactly: " + nonce);
      var chat =
          candidate.provider.complete(messages, json.createArrayNode(), 96, Duration.ofSeconds(10));
      tokens += (long) chat.promptTokens() + chat.completionTokens();
      var chatCalls = chat.message().path("tool_calls");
      boolean hasChatCalls =
          !chatCalls.isMissingNode()
              && !chatCalls.isNull()
              && (!chatCalls.isArray() || !chatCalls.isEmpty());
      if (!"stop".equals(chat.finishReason())
          || hasChatCalls
          || !chat.message().path("content").asText().contains(nonce))
        return failed("chat_response", "接口已响应，但基础对话检查未通过", started, tokens);
      messages = json.createArrayNode();
      messages
          .addObject()
          .put("role", "user")
          .put(
              "content",
              "LabFlow tool check. Call labflow_connection_check exactly once with nonce "
                  + nonce
                  + ". Do not answer in text.");
      var tools = json.createArrayNode();
      var fn = tools.addObject().put("type", "function").putObject("function");
      fn.put("name", "labflow_connection_check")
          .put("description", "Synthetic connectivity check; no side effects.");
      var parameters =
          fn.putObject("parameters").put("type", "object").put("additionalProperties", false);
      parameters.putObject("properties").putObject("nonce").put("type", "string");
      parameters.putArray("required").add("nonce");
      long remaining = 20_000 - Duration.ofNanos(System.nanoTime() - started).toMillis();
      if (remaining <= 0) return failed("timeout", "连接测试超时，请稍后重试", started, tokens);
      var tool =
          candidate.provider.complete(
              messages, tools, 192, Duration.ofMillis(Math.min(10000, remaining)));
      tokens += (long) tool.promptTokens() + tool.completionTokens();
      if (!validToolReply(tool, nonce))
        return failed("tool_support", "对话正常，但模型未通过工具调用检查，请选择支持工具调用的模型", started, tokens);
      synchronized (this) {
        if (candidate.revision != current.revision) throw new ApiException(409, "测试期间连接已变更，请重新测试");
        receipt =
            new Receipt(
                UUID.randomUUID().toString(),
                current.revision,
                fingerprint(candidate),
                Instant.now());
        return json.createObjectNode()
            .put("ok", true)
            .put("code", "verified")
            .put("message", "对话与工具调用均正常")
            .put("test_id", receipt.id)
            .put("latency_ms", elapsed(started))
            .put("tokens", tokens)
            .put("usage_complete", true);
      }
    } catch (ApiException error) {
      throw error;
    } catch (CompatibleModelProvider.Failure error) {
      return failed(error.code(), error.getMessage(), started, tokens);
    } catch (java.util.concurrent.TimeoutException | java.net.http.HttpTimeoutException error) {
      return failed("timeout", "连接测试超时，请检查服务地址或稍后重试", started, tokens);
    } catch (Exception error) {
      // Do not expose upstream error bodies, malformed arguments, headers or credentials.
      return failed("connection_failed", "连接测试未通过，请检查地址、密钥、模型名称及服务额度", started, tokens);
    } finally {
      probes.release();
    }
  }

  private long elapsed(long start) {
    return Duration.ofNanos(System.nanoTime() - start).toMillis();
  }

  private boolean validToolReply(ModelProvider.Reply reply, String nonce) {
    var calls = reply.message().path("tool_calls");
    if (!"tool_calls".equals(reply.finishReason()) || !calls.isArray() || calls.size() != 1)
      return false;
    var call = calls.path(0);
    if (!"function".equals(call.path("type").asText())
        || !call.path("id").isTextual()
        || call.path("id").asText().isBlank()
        || call.path("id").asText().length() > 200
        || !"labflow_connection_check".equals(call.at("/function/name").asText())
        || !call.at("/function/arguments").isTextual()) return false;
    try {
      var args = json.readTree(call.at("/function/arguments").asText());
      return args != null
          && args.isObject()
          && args.size() == 1
          && args.path("nonce").isTextual()
          && nonce.equals(args.path("nonce").asText());
    } catch (com.fasterxml.jackson.core.JsonProcessingException invalid) {
      return false;
    }
  }

  private ObjectNode failed(String code, String message, long start, long tokens) {
    return json.createObjectNode()
        .put("ok", false)
        .put("code", code)
        .put("message", message)
        .put("latency_ms", elapsed(start))
        .put("tokens", tokens)
        .put("usage_complete", false);
  }
}
