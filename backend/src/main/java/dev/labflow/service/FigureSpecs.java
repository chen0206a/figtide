package dev.labflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.labflow.api.ApiException;
import java.util.ArrayList;
import java.util.List;

/**
 * Read-only description of what the figure editor can build. It answers the questions a caller
 * must settle before proposing {@code operations}: which types exist, which data roles each type
 * needs, and which editorial blocks are mandatory. It deliberately contains no defaults — the
 * editor owns those (see {@code frontend/src/editor/model.ts}).
 */
public final class FigureSpecs {
  private FigureSpecs() {}

  private record Type(
      String type,
      String label,
      List<String> required,
      List<String> optional,
      String needs,
      String note) {}

  private static final List<Type> TYPES =
      List.of(
          new Type(
              "line",
              "折线图",
              List.of("x", "y"),
              List.of("group", "error", "band"),
              "",
              "可按分组列叠加多条线，误差列与区间带可选"),
          new Type("bar", "柱状图", List.of("x", "y"), List.of("group", "error"), "", "分组列生成并列柱"),
          new Type("scatter", "散点图", List.of("x", "y"), List.of("group", "error"), "", "适合两个数值列的关系"),
          new Type(
              "heatmap",
              "热力图",
              List.of("heatY", "heatZ"),
              List.of(),
              "",
              "Y 轴是分类列（行），Z 轴是数值列（着色）；不使用 x/y"),
          new Type("box", "箱线图", List.of("x", "y"), List.of("group"), "", "按分类列分组展示数值分布"),
          new Type("violin", "小提琴图", List.of("x", "y"), List.of("group"), "", "同箱线图，另示意密度"),
          new Type("histogram", "直方图", List.of("y"), List.of("group"), "", "X 轴自动换成分箱计数"),
          new Type("ecdf", "经验分布", List.of("y"), List.of("group"), "", "X 轴自动换成分位"),
          new Type("roc", "ROC 曲线", List.of("y"), List.of(), "evaluation", "需要 evaluation 块（真实标签列 + 正类）"),
          new Type("pr", "PR 曲线", List.of("y"), List.of(), "evaluation", "需要 evaluation 块（真实标签列 + 正类）"),
          new Type(
              "confusion",
              "混淆矩阵",
              List.of("y"),
              List.of(),
              "classification",
              "需要 classification 块（真实标签列，标签模式还需预测列）"));

  public static ObjectNode describe() {
    var mapper = new ObjectMapper();
    ObjectNode root = mapper.createObjectNode();
    root.put("protocol_version", 1).put("config_schema_version", 1).put("execution", "read-only");
    root.put(
        "summary",
        "先用 get_dataset_profile 看清列画像，再用 set_chart/set_mapping 选定类型与字段；"
            + "一旦类型依赖专业配置（evaluation/classification），本工具不会代造，缺什么会在 lint 里报出来。");
    var roles = root.putObject("roles");
    roles.put("x", "横轴数值列");
    roles.put("y", "纵轴数值列（热力图为分类列时改由 heatY/heatZ 承载）");
    roles.put("group", "分组列，低基数文本");
    roles.put("heatY", "热力图 Y 分类列");
    roles.put("heatZ", "热力图 Z 数值列");
    roles.put("error", "误差列，必须非负");
    roles.put("band", "区间带上下界列，仅折线图");
    var series = root.putObject("series");
    series.put("min", 1).put("max", 20);
    var types = root.putArray("types");
    for (var type : TYPES) {
      ObjectNode item = types.addObject();
      item.put("type", type.type()).put("label", type.label());
      ArrayNode required = item.putArray("required_roles");
      type.required().forEach(required::add);
      ArrayNode optional = item.putArray("optional_roles");
      type.optional().forEach(optional::add);
      item.put("requires_block", type.needs());
      item.put("note", type.note());
    }
    var rules = root.putArray("rules");
    rules.add("固定 X 的类型：histogram、ecdf、roc、pr、confusion —— 不接受 set_mapping 改 x");
    rules.add("热力图不接受 x/y；切到 heatmap 前必须先给 heatY 与 heatZ");
    rules.add("y / heatZ / error / band 只能引用数值列，x / group / heatY 只能是当前数据版本里的列名");
    rules.add("文本列不能当 Y（混淆矩阵 labels 模式例外，用 series[].prediction）");
    rules.add("结构工具不代造 evaluation / classification 配置，缺块时返回 400 而不是猜");
    return root;
  }

  /** Same payload, narrowed to one type. An unknown type is a caller bug, not a figure. */
  public static ObjectNode describe(String type) {
    var all = describe();
    if (type == null || type.isBlank()) return all;
    ArrayNode types = (ArrayNode) all.path("types");
    List<JsonNode> keep = new ArrayList<>();
    for (var item : types) if (item.path("type").asText().equals(type)) keep.add(item);
    if (keep.isEmpty()) throw ApiException.bad("未知图表类型 " + type);
    types.removeAll();
    keep.forEach(types::add);
    all.put("filtered_by", type);
    return all;
  }
}