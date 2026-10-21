package dev.labflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.api.ApiException;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FigureToolService {
  private final WorkspaceService workspace;

  public FigureToolService(WorkspaceService workspace) {
    this.workspace = workspace;
  }

  @Transactional(readOnly = true)
  public Object preview(long project, JsonNode request) {
    if (request == null || !request.isObject()) throw ApiException.bad("需要操作请求");
    var allowed = Set.of("protocol_version", "chart_id", "base_revision", "config", "operations");
    request
        .fieldNames()
        .forEachRemaining(
            k -> {
              if (!allowed.contains(k)) throw ApiException.bad("不支持请求字段 " + k);
            });
    if (!request.path("protocol_version").isIntegralNumber()
        || !request.path("protocol_version").canConvertToInt()
        || request.path("protocol_version").asInt() != 1) throw ApiException.bad("不支持的操作协议");
    workspace.project(project);
    var chartId = request.path("chart_id");
    var revision = request.path("base_revision");
    if (!chartId.isMissingNode() && !chartId.isNull()) {
      if (!chartId.isIntegralNumber()
          || !chartId.canConvertToLong()
          || chartId.asLong() <= 0
          || !revision.isIntegralNumber()
          || !revision.canConvertToInt()
          || revision.asInt() < 1) throw ApiException.bad("图表与版本标识无效");
      var saved = workspace.chart(project, chartId.asLong());
      if (((Number) saved.get("revision")).intValue() != revision.asInt())
        throw new ApiException(409, "已保存图表有新版本，请重新打开后再预览操作");
    } else if (!revision.isMissingNode()
        && !revision.isNull()
        && (!revision.isIntegralNumber() || !revision.canConvertToInt() || revision.asInt() != 0))
      throw ApiException.bad("新图表不能指定保存版本");
    var original = request.path("config");
    if (original.toString().length() > 200000) throw ApiException.bad("配置过大");
    var config = FigureOperations.apply(original, request.path("operations"));
    workspace.validateAndReport(project, config);
    var source = workspace.data(project, config.path("datasetVersionId").asLong());
    return Map.of(
        "protocol_version",
        1,
        "config",
        config,
        "changes",
        FigureOperations.changes(original, config),
        "operation_count",
        request.path("operations").size(),
        "base_revision",
        chartId.isIntegralNumber() ? revision.asInt() : 0,
        "source",
        Map.of("dataset_version_id", source.get("id"), "sha256", source.get("sha256")));
  }
}
