package dev.labflow.agent;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.AgentAuditRepository;
import jakarta.annotation.PostConstruct;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentAuditService {
  // Shared by Spring contexts in one JVM; a new process has a new identity.
  private static final String INSTANCE = UUID.randomUUID().toString();
  private final AgentAuditRepository db;
  private final ObjectMapper json;

  public AgentAuditService(AgentAuditRepository db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  @PostConstruct
  public void recover() {
    db.recover(INSTANCE);
  }

  public void begin(
      long project, JsonNode snapshot, JsonNode initial, ModelProvider.Info info, JsonNode source) {
    db.create(
        initial.path("run_id").asText(),
        project,
        INSTANCE,
        snapshot.path("chart_id").isIntegralNumber() ? snapshot.path("chart_id").asLong() : null,
        snapshot.path("base_revision").asInt(0),
        snapshot.path("config").path("datasetVersionId").asLong(),
        source.path("sha256").asText(),
        AuditSanitizer.hash(snapshot.path("config")),
        modelName(info.model()),
        AuditSanitizer.note(info.endpoint()),
        initial.path("prompt_version").asText(),
        initial.path("catalog_hash").asText(),
        initial.path("max_steps").asInt(),
        initial.path("max_tokens").asInt(),
        initial.path("timeout_seconds").asInt(),
        Timestamp.from(Instant.now()));
  }

  public void finish(
      long project,
      JsonNode result,
      long promptTokens,
      long completionTokens,
      String reasonCode,
      boolean usageComplete) {
    var proposal = result.path("proposal");
    boolean hasProposal = proposal.isObject();
    String status = result.path("status").asText();
    db.finish(
        status,
        outcome(status),
        reasonCode,
        modelName(result.path("model").asText()),
        result.path("steps").asInt(),
        promptTokens,
        completionTokens,
        result.path("tokens").asLong(),
        result.path("budget_used").asLong(),
        usageComplete,
        result.path("latency_ms").asLong(),
        result.path("trace").toString(),
        hasProposal ? AuditSanitizer.proposal(proposal).toString() : null,
        hasProposal ? AuditSanitizer.hash(proposal.path("config")) : null,
        Timestamp.from(Instant.now()),
        result.path("run_id").asText(),
        project);
  }

  private static String outcome(String status) {
    return switch (status) {
      case "proposed" -> "pending";
      case "answered" -> "answered";
      case "cancelled" -> "cancelled";
      case "incomplete" -> "incomplete";
      default -> "failed";
    };
  }

  public ObjectNode detail(long project, String id) {
    return render(db.find(project, id));
  }

  private ObjectNode render(Map<String, Object> row) {
    var result = json.createObjectNode();
    for (String key :
        List.of(
            "run_id",
            "chart_id",
            "base_revision",
            "dataset_version_id",
            "source_sha256",
            "snapshot_hash",
            "model",
            "endpoint",
            "prompt_version",
            "catalog_hash",
            "status",
            "outcome",
            "reason_code",
            "max_steps",
            "max_tokens",
            "timeout_seconds",
            "steps",
            "prompt_tokens",
            "completion_tokens",
            "tokens",
            "budget_used",
            "usage_complete",
            "latency_ms",
            "proposal_hash",
            "decision_reason")) result.set(key, json.valueToTree(row.get(key)));
    for (String key : List.of("created_at", "finished_at", "decision_at")) {
      Object value = row.get(key);
      if (value instanceof Timestamp t) result.put(key, t.toInstant().toString());
      else result.putNull(key);
    }
    try {
      result.set("trace", json.readTree(String.valueOf(row.get("trace_json"))));
      if (row.get("proposal_json") != null)
        result.set("proposal_summary", json.readTree(String.valueOf(row.get("proposal_json"))));
    } catch (Exception e) {
      throw new IllegalStateException("审计记录格式无效");
    }
    result.put("persisted", true).put("historical", true).put("text", "");
    result.put(
        "reason",
        switch (String.valueOf(row.get("reason_code"))) {
          case "process_interrupted" -> "上次运行因服务中断而结束，用量可能不完整。";
          case "shutdown" -> "服务关闭，运行已取消。";
          default -> "";
        });
    return result;
  }

  public Object list(long project, Long chart, String outcome, int page, int size) {
    if (page < 0 || page > 100000 || size < 1 || size > 50 || (chart != null && chart < 1))
      throw ApiException.bad("分页参数无效");
    if (outcome != null
        && !Set.of(
                "running",
                "pending",
                "accepted",
                "rejected",
                "answered",
                "cancelled",
                "failed",
                "incomplete",
                "interrupted")
            .contains(outcome)) throw ApiException.bad("运行结果筛选无效");
    var rows = db.list(project, chart, outcome, size + 1, page * size);
    var items = new ArrayList<Map<String, Object>>();
    for (var row : rows.subList(0, Math.min(size, rows.size()))) {
      var item = new LinkedHashMap<>(row);
      for (String key : List.of("created_at", "finished_at", "decision_at"))
        if (item.get(key) instanceof Timestamp t) item.put(key, t.toInstant().toString());
      items.add(item);
    }
    return Map.of("items", items, "page", page, "size", size, "has_more", rows.size() > size);
  }

  @Transactional
  public ObjectNode decide(
      long project, String id, JsonNode request, boolean live, String expectedHash) {
    if (!request.isObject()) throw ApiException.bad("需要决策请求");
    request
        .fieldNames()
        .forEachRemaining(
            k -> {
              if (!Set.of("outcome", "reason", "proposal_hash").contains(k))
                throw ApiException.bad("不支持决策字段");
            });
    String decision = request.path("outcome").asText();
    if (!Set.of("accepted", "rejected").contains(decision)) throw ApiException.bad("请选择接受或拒绝");
    if (request.has("reason")
        && (!request.get("reason").isTextual() || request.get("reason").asText().length() > 500))
      throw ApiException.bad("拒绝原因最多500字");
    String note = AuditSanitizer.note(request.path("reason").asText("").strip());
    if (decision.equals("accepted") && !note.isBlank()) throw ApiException.bad("接受时不填写拒绝原因");
    var row = db.lock(project, id);
    if (!"proposed".equals(row.get("status"))) throw new ApiException(409, "只有已完成的提案可以接受或拒绝");
    if (!Objects.equals(row.get("proposal_hash"), request.path("proposal_hash").asText()))
      throw new ApiException(409, "提案指纹不一致，请重新读取");
    if (decision.equals(row.get("outcome")) && note.equals(row.get("decision_reason")))
      return render(row);
    if (!"pending".equals(row.get("outcome"))) throw new ApiException(409, "该提案已记录最终决策，不能覆盖");
    if (decision.equals("accepted")
        && (!live || !Objects.equals(expectedHash, row.get("proposal_hash"))))
      throw new ApiException(409, "历史提案仅供追溯，请重新生成后应用");
    if (decision.equals("accepted")
        && row.get("chart_id") instanceof Number chart
        && db.chartRevision(project, chart.longValue())
            != ((Number) row.get("base_revision")).intValue())
      throw new ApiException(409, "源图表已更新，请重新生成提案");
    if (db.decide(project, id, decision, note, Timestamp.from(Instant.now())) != 1)
      throw new ApiException(409, "决策已变化，请重新读取运行记录");
    return render(db.find(project, id));
  }

  private static String modelName(String name) {
    String safe = AuditSanitizer.note(name);
    return safe.substring(0, Math.min(200, safe.length()));
  }
}
