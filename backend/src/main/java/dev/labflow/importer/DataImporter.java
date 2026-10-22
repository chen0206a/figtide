package dev.labflow.importer;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import dev.labflow.api.ApiException;
import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.util.*;
import org.apache.commons.csv.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

@Component
public class DataImporter {
  private static final ObjectMapper JSON =
      new ObjectMapper(
              JsonFactory.builder()
                  .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                  .streamReadConstraints(
                      StreamReadConstraints.builder()
                          .maxNestingDepth(16)
                          .maxStringLength(10000)
                          .build())
                  .build())
          .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

  private static String utf8(byte[] bytes) throws CharacterCodingException {
    String text =
        StandardCharsets.UTF_8
            .newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes))
            .toString();
    return text.startsWith("\uFEFF") ? text.substring(1) : text;
  }

  public List<String> recordPaths(String filename, byte[] bytes) {
    if (filename == null
        || !filename.toLowerCase(Locale.ROOT).endsWith(".json")
        || bytes.length == 0
        || bytes.length > 10 * 1024 * 1024) return List.of();
    try {
      var paths = new ArrayList<String>();
      findArrays(JSON.readTree(utf8(bytes)), "", paths, 0);
      return paths;
    } catch (Exception e) {
      return List.of();
    }
  }

  private static void findArrays(JsonNode node, String path, List<String> result, int depth) {
    if (depth > 8 || result.size() >= 30) return;
    if (node.isArray()) {
      if (!node.isEmpty() && node.get(0).isObject()) result.add(path);
      return;
    }
    if (node.isObject())
      node.fields()
          .forEachRemaining(
              e ->
                  findArrays(
                      e.getValue(),
                      path + "/" + e.getKey().replace("~", "~0").replace("/", "~1"),
                      result,
                      depth + 1));
  }

  private static void flatten(JsonNode node, String prefix, Map<String, String> row) {
    if (node.isObject()) {
      node.fields()
          .forEachRemaining(
              e -> {
                String name = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
                if (name.isBlank() || name.length() > 120)
                  throw ApiException.bad("JSON 字段名称为空或超过120字符");
                flatten(e.getValue(), name, row);
              });
    } else {
      if (node.isArray()) throw ApiException.bad("记录内包含数组字段（" + prefix + "），请先整理为每行一个观测值的表格");
      if (row.containsKey(prefix)) throw ApiException.bad("嵌套字段展开后重名：" + prefix);
      if (row.size() >= 100) throw ApiException.bad("最多支持100列");
      row.put(prefix, node.isNull() ? "" : node.asText());
    }
  }

  private List<List<String>> jsonCells(String name, byte[] bytes, ImportRules rules)
      throws Exception {
    List<JsonNode> records = new ArrayList<>();
    String text = utf8(bytes);
    if (name.endsWith(".jsonl")) {
      if (!rules.recordsPath().isEmpty()) throw ApiException.bad("JSONL 不使用记录路径");
      int line = 0;
      for (String value : text.split("\\R")) {
        line++;
        if (value.isBlank()) continue;
        try {
          records.add(JSON.readTree(value));
        } catch (Exception e) {
          throw ApiException.bad("JSONL 第" + line + "行不是合法JSON对象");
        }
        if (records.size() > 20000) throw ApiException.bad("最多支持20000行");
      }
    } else {
      JsonNode root = JSON.readTree(text);
      if (root == null) throw ApiException.bad("JSON文件为空");
      if (!rules.recordsPath().isEmpty()) root = root.at(rules.recordsPath());
      else if (root.isObject()) {
        var paths = recordPaths(name, bytes);
        if (paths.size() == 1) root = root.at(paths.getFirst());
        else if (paths.size() > 1) throw ApiException.bad("发现多个记录数组，请选择记录路径后确认");
      }
      if (root.isArray()) {
        if (root.size() > 20000) throw ApiException.bad("最多支持20000行");
        root.forEach(records::add);
      } else if (root.isObject() && rules.recordsPath().isEmpty()) records.add(root);
      else throw ApiException.bad("记录路径必须指向对象数组");
    }
    if (records.isEmpty()) throw ApiException.bad("JSON中没有数据记录");
    List<Map<String, String>> rows = new ArrayList<>();
    Set<String> keys = new LinkedHashSet<>();
    for (JsonNode record : records) {
      if (!record.isObject()) throw ApiException.bad("每条JSON记录必须是对象");
      var row = new LinkedHashMap<String, String>();
      flatten(record, "", row);
      keys.addAll(row.keySet());
      if (keys.size() > 100 || (long) keys.size() * records.size() > 200000)
        throw ApiException.bad("最多支持100列和200000个数据单元格");
      rows.add(row);
    }
    List<String> headers = new ArrayList<>(keys);
    var cells = new ArrayList<List<String>>();
    cells.add(headers);
    for (var row : rows) cells.add(headers.stream().map(k -> row.getOrDefault(k, "")).toList());
    return cells;
  }

  private char delimiter(String text, String choice) throws IOException {
    if (!choice.equals("auto")) return choice.charAt(0);
    char selected = ',';
    int width = 1;
    for (char candidate : new char[] {',', '\t', ';', '|'}) {
      try (var parser =
          CSVFormat.DEFAULT
              .builder()
              .setDelimiter(candidate)
              .setIgnoreEmptyLines(true)
              .get()
              .parse(new StringReader(text))) {
        var iter = parser.iterator();
        if (!iter.hasNext()) continue;
        int n = iter.next().size(), count = 0;
        boolean regular = true;
        while (iter.hasNext() && count++ < 20)
          if (iter.next().size() != n) {
            regular = false;
            break;
          }
        if (regular && n > width) {
          width = n;
          selected = candidate;
        }
      } catch (RuntimeException ignored) {
        /* Another delimiter may describe the file. */
      }
    }
    return selected;
  }

  public List<String> sheetNames(String filename, byte[] bytes) {
    if (filename == null || !filename.toLowerCase(Locale.ROOT).endsWith(".xlsx")) return List.of();
    if (bytes.length == 0 || bytes.length > 10 * 1024 * 1024) return List.of();
    try (var book = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
      if (book.isMacroEnabled()) return List.of();
      var names = new ArrayList<String>();
      for (int i = 0; i < book.getNumberOfSheets(); i++) names.add(book.getSheetName(i));
      return names;
    } catch (Exception e) {
      return List.of();
    }
  }

  public record Parsed(
      List<Map<String, Object>> fields,
      List<Map<String, Object>> rows,
      List<String> warnings,
      List<String> sheets,
      List<Map<String, Object>> issues,
      List<String> recordPaths) {}

  public Parsed parse(String filename, byte[] bytes) {
    return parse(filename, bytes, ImportRules.defaults());
  }

  public Parsed parse(String filename, byte[] bytes, ImportRules rules) {
    rules.validate();
    List<String> sheets = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();
    if (bytes.length == 0 || bytes.length > 10 * 1024 * 1024)
      throw ApiException.bad("文件为空或超过 10 MB");
    if (filename == null) throw ApiException.bad("文件名不能为空");
    String name = filename.toLowerCase(Locale.ROOT);
    List<List<String>> cells = new ArrayList<>();
    try {
      if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
        String text = utf8(bytes);
        try (CSVParser parser =
            CSVFormat.DEFAULT
                .builder()
                .setDelimiter(name.endsWith(".tsv") ? '\t' : delimiter(text, rules.delimiter()))
                .setIgnoreEmptyLines(true)
                .get()
                .parse(new StringReader(text))) {
          for (CSVRecord row : parser) {
            if (cells.size() > 20000) throw ApiException.bad("最多支持 20000 行");
            if (row.size() > 100 || (long) row.size() * cells.size() > 200000)
              throw ApiException.bad("最多支持 100 列和 200000 个数据单元格");
            List<String> r = new ArrayList<>();
            row.forEach(r::add);
            cells.add(r);
          }
        }
      } else if (name.endsWith(".json") || name.endsWith(".jsonl")) {
        cells = jsonCells(name, bytes, rules);
      } else if (name.endsWith(".xlsx")) {
        try (XSSFWorkbook book = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
          if (book.isMacroEnabled()) throw ApiException.bad("不接受包含宏的工作簿");
          for (int i = 0; i < book.getNumberOfSheets(); i++) sheets.add(book.getSheetName(i));
          if (rules.sheet() >= book.getNumberOfSheets()) throw ApiException.bad("工作表不存在");
          Sheet sheet = book.getSheetAt(rules.sheet());
          if (sheet.getLastRowNum() > 20000) throw ApiException.bad("最多支持 20000 行");
          DataFormatter fmt = new DataFormatter(Locale.ROOT);
          int width = sheet.getRow(0) == null ? 0 : sheet.getRow(0).getLastCellNum();
          if (width < 1 || width > 100) throw ApiException.bad("最多支持 100 列");
          if ((long) width * sheet.getLastRowNum() > 200000)
            throw ApiException.bad("最多支持 200000 个数据单元格");
          for (int i = 0; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            List<String> r = new ArrayList<>();
            if (row != null && row.getLastCellNum() > width) throw ApiException.bad("数据行列数超过表头");
            for (int j = 0; j < width; j++) {
              Cell cell = row == null ? null : row.getCell(j);
              if (cell != null && cell.getCellType() == CellType.FORMULA)
                throw ApiException.bad("工作簿含公式，请先转换为纯数值；不会执行公式");
              r.add(cell == null ? "" : fmt.formatCellValue(cell));
            }
            cells.add(r);
          }
        }
      } else throw ApiException.bad("支持 UTF-8 CSV、TSV、分隔文本、JSON、JSONL 或无宏 XLSX");
    } catch (ApiException e) {
      throw e;
    } catch (CharacterCodingException e) {
      throw ApiException.bad("文本文件必须使用 UTF-8 编码，请转码后重试");
    } catch (Exception e) {
      throw ApiException.bad("无法解析文件，请检查文件格式与内容");
    }
    if (cells.size() < 2) throw ApiException.bad("文件必须含表头和至少一行数据");
    List<String> headers = cells.getFirst().stream().map(String::trim).toList();
    if (headers.isEmpty()
        || headers.size() > 100
        || headers.stream().anyMatch(s -> s.isBlank() || s.length() > 120)
        || new HashSet<>(headers).size() != headers.size())
      throw ApiException.bad("表头必须唯一、非空，且不超过 100 列 / 每列 120 字符");
    for (int i = 1; i < cells.size(); i++)
      if (cells.get(i).size() != headers.size())
        throw ApiException.bad("第 " + (i + 1) + " 行列数与表头不一致");
    if (!headers.containsAll(rules.types().keySet())
        || !headers.containsAll(rules.roles().keySet())) throw ApiException.bad("导入规则引用了不存在的字段");
    List<String> warnings = new ArrayList<>();
    List<Map<String, Object>> fields = new ArrayList<>();
    List<Map<String, Object>> rows = new ArrayList<>();
    for (int r = 1; r < cells.size(); r++) rows.add(new LinkedHashMap<>());
    for (int c = 0; c < headers.size(); c++) {
      boolean numeric = true;
      int present = 0, missing = 0, invalid = 0;
      boolean wideInteger = false;
      for (int r = 1; r < cells.size(); r++) {
        String v = cells.get(r).get(c).trim();
        if (v.isEmpty() || nonFinite(v) || rules.missingValues().contains(v)) continue;
        if (v.length() > 10000) throw ApiException.bad("单元格内容过长");
        present++;
        if (unsafeInteger(v)) {
          wideInteger = true;
          numeric = false;
        }
        try {
          Double.parseDouble(v);
        } catch (NumberFormatException e) {
          numeric = false;
        }
      }
      numeric = numeric && present > 0;
      String inferred = numeric ? "number" : "string";
      if (rules.types().containsKey(headers.get(c)))
        numeric = rules.types().get(headers.get(c)).equals("number");
      for (int r = 1; r < cells.size(); r++) {
        String v = cells.get(r).get(c).trim();
        Object value = v;
        if (v.isEmpty() || rules.missingValues().contains(v)) {
          value = null;
          missing++;
        } else if (nonFinite(v)) {
          value = null;
          missing++;
          invalid++;
        } else if (numeric) {
          double n;
          try {
            if (unsafeInteger(v)) throw new NumberFormatException("unsafe integer");
            n = Double.parseDouble(v);
          } catch (NumberFormatException e) {
            n = Double.NaN;
            if (issues.size() < 100)
              issues.add(
                  Map.of(
                      "row",
                      r + 1,
                      "field",
                      headers.get(c),
                      "value",
                      v,
                      "message",
                      "无法转为数值；请修改字段类型或明确设置缺失符号"));
          }
          if (!Double.isFinite(n)) {
            value = null;
            missing++;
            invalid++;
          } else value = n;
        }
        if (v.length() > 10000) throw ApiException.bad("单元格内容过长");
        rows.get(r - 1).put(headers.get(c), value);
      }
      var field = new LinkedHashMap<String, Object>();
      String key = headers.get(c);
      field.put("name", key);
      field.put("type", numeric ? "number" : "string");
      field.put("inferredType", inferred);
      field.put("missing", missing);
      field.put("role", rules.roles().getOrDefault(key, "none"));
      var values = rows.stream().map(row -> row.get(key)).filter(Objects::nonNull).toList();
      field.put("unique", values.stream().distinct().count());
      field.put("samples", values.stream().distinct().limit(3).toList());
      field.put("constant", !values.isEmpty() && values.stream().distinct().count() == 1);
      String lower = key.toLowerCase(Locale.ROOT);
      String suggestion =
          numeric
              ? (lower.matches(".*(std|sem|stderr|error).*") ? "error" : (c == 0 ? "x" : "y"))
              : (values.stream().distinct().count() <= 20 ? "group" : "none");
      field.put("suggestedRole", suggestion);
      if (numeric && !values.isEmpty()) {
        field.put(
            "min", values.stream().mapToDouble(v -> ((Number) v).doubleValue()).min().orElse(0));
        field.put(
            "max", values.stream().mapToDouble(v -> ((Number) v).doubleValue()).max().orElse(0));
      }
      if (Set.of("y", "error").contains(rules.roles().getOrDefault(key, "none")) && !numeric)
        issues.add(Map.of("row", 1, "field", key, "value", "", "message", "Y 和误差角色需要数值字段"));
      fields.add(field);
      if (wideInteger) warnings.add(headers.get(c) + "：整数超出安全精度范围，默认按文本保留；原文件不变");
      if (invalid > 0) warnings.add(headers.get(c) + "：" + invalid + " 个非有限数值作为缺失值展示，原文件保持不变");
    }
    return new Parsed(fields, rows, warnings, sheets, issues, recordPaths(filename, bytes));
  }

  private static boolean unsafeInteger(String value) {
    return value.matches("[+-]?[0-9]+")
        && new java.math.BigInteger(value)
                .abs()
                .compareTo(java.math.BigInteger.valueOf(9007199254740991L))
            > 0;
  }

  private boolean nonFinite(String s) {
    return Set.of("nan", "infinity", "-infinity", "+infinity", "inf", "-inf", "+inf")
        .contains(s.toLowerCase(Locale.ROOT));
  }
}
