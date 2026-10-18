package dev.labflow.importer;

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
  public record Parsed(
      List<Map<String, Object>> fields, List<Map<String, Object>> rows, List<String> warnings) {}

  public Parsed parse(String filename, byte[] bytes) {
    if (bytes.length == 0 || bytes.length > 10 * 1024 * 1024)
      throw ApiException.bad("文件为空或超过 10 MB");
    String name = filename.toLowerCase(Locale.ROOT);
    List<List<String>> cells = new ArrayList<>();
    try {
      if (name.endsWith(".csv")) {
        String text =
            StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString();
        if (text.startsWith("\uFEFF")) text = text.substring(1);
        try (CSVParser parser =
            CSVFormat.DEFAULT
                .builder()
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
      } else if (name.endsWith(".xlsx")) {
        try (XSSFWorkbook book = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
          if (book.isMacroEnabled()) throw ApiException.bad("不接受包含宏的工作簿");
          Sheet sheet = book.getSheetAt(0);
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
      } else throw ApiException.bad("只接受 UTF-8 CSV 或无宏 XLSX");
    } catch (ApiException e) {
      throw e;
    } catch (CharacterCodingException e) {
      throw ApiException.bad("CSV 必须使用 UTF-8 编码，请转码后重试");
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
    for (List<String> row : cells)
      if (row.size() != headers.size()) throw ApiException.bad("数据行列数与表头不一致");
    List<String> warnings = new ArrayList<>();
    List<Map<String, Object>> fields = new ArrayList<>();
    List<Map<String, Object>> rows = new ArrayList<>();
    for (int r = 1; r < cells.size(); r++) rows.add(new LinkedHashMap<>());
    for (int c = 0; c < headers.size(); c++) {
      boolean numeric = true;
      int present = 0, missing = 0, invalid = 0;
      for (int r = 1; r < cells.size(); r++) {
        String v = cells.get(r).get(c).trim();
        if (v.isEmpty() || nonFinite(v)) continue;
        present++;
        try {
          Double.parseDouble(v);
        } catch (NumberFormatException e) {
          numeric = false;
        }
      }
      numeric = numeric && present > 0;
      for (int r = 1; r < cells.size(); r++) {
        String v = cells.get(r).get(c).trim();
        Object value = v;
        if (v.isEmpty()) {
          value = null;
          missing++;
        } else if (nonFinite(v)) {
          value = null;
          missing++;
          invalid++;
        } else if (numeric) {
          double n = Double.parseDouble(v);
          if (!Double.isFinite(n)) {
            value = null;
            missing++;
            invalid++;
          } else value = n;
        }
        if (v.length() > 10000) throw ApiException.bad("单元格内容过长");
        rows.get(r - 1).put(headers.get(c), value);
      }
      fields.add(
          Map.of(
              "name", headers.get(c), "type", numeric ? "number" : "string", "missing", missing));
      if (invalid > 0) warnings.add(headers.get(c) + "：" + invalid + " 个非有限数值作为缺失值展示，原文件保持不变");
    }
    return new Parsed(fields, rows, warnings);
  }

  private boolean nonFinite(String s) {
    return Set.of("nan", "infinity", "-infinity", "+infinity", "inf", "-inf", "+inf")
        .contains(s.toLowerCase(Locale.ROOT));
  }
}
