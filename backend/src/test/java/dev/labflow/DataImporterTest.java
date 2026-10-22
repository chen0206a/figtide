package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;

import dev.labflow.api.ApiException;
import dev.labflow.importer.DataImporter;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class DataImporterTest {
  final DataImporter parser = new DataImporter();

  @Test
  void importsTabTextAndQuotedAutoDelimiterWithoutChangingCells() {
    var tab =
        parser.parse("实验.tsv", "epoch\t准确率\n1\t0.9\n2\t0.95".getBytes(StandardCharsets.UTF_8));
    assertEquals(2, tab.rows().size());
    assertEquals(0.9, tab.rows().getFirst().get("准确率"));
    var rules =
        new dev.labflow.importer.ImportRules(
            1, "auto", 0, java.util.List.of(), java.util.Map.of(), java.util.Map.of());
    var text = parser.parse("a.txt", "epoch|label|value\n1|\"a|b\"|0.9\n2|c|0.8".getBytes(), rules);
    assertEquals("a|b", text.rows().getFirst().get("label"));
    assertEquals(3, text.fields().size());
  }

  @Test
  void jsonObjectsUnionNestedFieldsAndPreserveMissingValuesAndLargeIds() {
    var d =
        parser.parse(
            "实验.json",
            ("\uFEFF[{\"id\":9007199254740993,\"metrics\":{\"acc\":0.9},\"model\":\"甲\"},{\"id\":9007199254740994,\"loss\":0.2}]")
                .getBytes(StandardCharsets.UTF_8));
    assertEquals(4, d.fields().size());
    assertEquals("9007199254740993", d.rows().getFirst().get("id"));
    assertEquals(0.9, d.rows().getFirst().get("metrics.acc"));
    assertNull(d.rows().get(1).get("metrics.acc"));
    assertEquals("string", d.fields().getFirst().get("type"));
    assertFalse(d.warnings().isEmpty());
  }

  @Test
  void ambiguousJsonArraysRequireExplicitReplayablePath() {
    byte[] raw =
        "{\"train\":[{\"epoch\":1,\"acc\":0.9}],\"test\":[{\"epoch\":2,\"acc\":0.8}]}".getBytes();
    assertThrows(ApiException.class, () -> parser.parse("a.json", raw));
    assertEquals(java.util.List.of("/train", "/test"), parser.recordPaths("a.json", raw));
    var rules =
        new dev.labflow.importer.ImportRules(
            1, ",", 0, java.util.List.of(), java.util.Map.of(), java.util.Map.of(), "/test");
    var d = parser.parse("a.json", raw, rules);
    assertEquals(2.0, d.rows().getFirst().get("epoch"));
  }

  @Test
  void jsonlSupportsBlankLinesAndRejectsMalformedLineWithoutDroppingIt() {
    var d =
        parser.parse(
            "run.jsonl", "{\"epoch\":1,\"acc\":0.8}\n\n{\"epoch\":2,\"acc\":null}".getBytes());
    assertEquals(2, d.rows().size());
    assertNull(d.rows().get(1).get("acc"));
    var e =
        assertThrows(
            ApiException.class, () -> parser.parse("run.jsonl", "{\"epoch\":1}\nnope".getBytes()));
    assertTrue(e.getMessage().contains("2"));
  }

  @Test
  void rejectsDuplicateJsonKeysTrailingCodeArrayCellsAndFlattenCollisions() {
    for (String raw :
        java.util.List.of(
            "[{\"a\":1,\"a\":2}]",
            "[{\"a\":1}] alert(1)",
            "[{\"a\":[1,2]}]",
            "[{\"a.b\":1,\"a\":{\"b\":2}}]"))
      assertThrows(ApiException.class, () -> parser.parse("a.json", raw.getBytes()), raw);
  }

  @Test
  void utf8BomChineseMissingAndNonFinite() {
    var d =
        parser.parse(
            "实验.csv",
            "\uFEFF轮次,准确率,模型\n1,92.1,模型甲\n2,,模型乙\n3,NaN,模型丙\n4,Infinity,模型丁"
                .getBytes(StandardCharsets.UTF_8));
    assertEquals(4, d.rows().size());
    assertEquals("number", d.fields().get(1).get("type"));
    assertNull(d.rows().get(2).get("准确率"));
    assertEquals(1, d.warnings().size());
    assertEquals("模型甲", d.rows().getFirst().get("模型"));
  }

  @Test
  void rejectsDuplicateHeaders() {
    assertThrows(ApiException.class, () -> parser.parse("a.csv", "a,a\n1,2".getBytes()));
  }

  @Test
  void rejectsEmptyHeaders() {
    assertThrows(ApiException.class, () -> parser.parse("a.csv", "a,\n1,2".getBytes()));
  }

  @Test
  void rejectsUnevenRows() {
    assertThrows(ApiException.class, () -> parser.parse("a.csv", "a,b\n1,2,3".getBytes()));
  }

  @Test
  void rejectsBadEncoding() {
    assertThrows(ApiException.class, () -> parser.parse("a.csv", new byte[] {(byte) 0xff, 1}));
  }

  @Test
  void quotedCommaAndNewline() {
    var d = parser.parse("a.csv", "a,b\n1,\"text,more\nnext\"".getBytes());
    assertEquals("text,more\nnext", d.rows().getFirst().get("b"));
  }

  @Test
  void rejectsOversizeAndExtension() {
    assertThrows(ApiException.class, () -> parser.parse("a.csv", new byte[10 * 1024 * 1024 + 1]));
    assertThrows(ApiException.class, () -> parser.parse("a.xlsm", new byte[] {1}));
  }

  @Test
  void rejectsFormulaWorkbook() throws Exception {
    try (var book = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var s = book.createSheet();
      s.createRow(0).createCell(0).setCellValue("value");
      s.createRow(1).createCell(0).setCellFormula("1+1");
      book.write(out);
      assertThrows(ApiException.class, () -> parser.parse("a.xlsx", out.toByteArray()));
    }
  }

  @Test
  void readsXlsx() throws Exception {
    try (var book = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var s = book.createSheet();
      s.createRow(0).createCell(0).setCellValue("数值");
      s.createRow(1).createCell(0).setCellValue(12.5);
      book.write(out);
      assertEquals(12.5, parser.parse("a.xlsx", out.toByteArray()).rows().getFirst().get("数值"));
    }
  }

  @Test
  void rowAndColumnLimits() {
    assertThrows(
        ApiException.class, () -> parser.parse("a.csv", ("x\n" + "1\n".repeat(20001)).getBytes()));
    String h =
        java.util.stream.IntStream.range(0, 101)
            .mapToObj(i -> "c" + i)
            .collect(java.util.stream.Collectors.joining(","));
    assertThrows(ApiException.class, () -> parser.parse("a.csv", (h + "\n" + h).getBytes()));
  }

  @Test
  void explicitImportRulesDoNotSilentlyConvertText() {
    var rules =
        new dev.labflow.importer.ImportRules(
            1,
            ";",
            0,
            java.util.List.of("NA"),
            java.util.Map.of("score", "number"),
            java.util.Map.of("epoch", "x", "score", "y"));
    var parsed =
        parser.parse(
            "demo.csv", "epoch;score\n1;NA\n2;<0.01".getBytes(StandardCharsets.UTF_8), rules);
    assertNull(parsed.rows().getFirst().get("score"));
    assertEquals(1, parsed.issues().size());
    assertEquals(3, parsed.issues().getFirst().get("row"));
    assertEquals("y", parsed.fields().get(1).get("role"));
    assertEquals("string", parsed.fields().get(1).get("inferredType"));
  }

  @Test
  void supportsWorksheetSelectionAndRetainsWorkbook() throws Exception {
    try (var book = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      for (String sheet : java.util.List.of("第一张", "结果")) {
        var sh = book.createSheet(sheet);
        sh.createRow(0).createCell(0).setCellValue("score");
        sh.createRow(1).createCell(0).setCellValue(sheet.equals("结果") ? 92 : 11);
      }
      book.write(out);
      var parsed =
          parser.parse(
              "s.xlsx",
              out.toByteArray(),
              new dev.labflow.importer.ImportRules(
                  1, ",", 1, java.util.List.of(), java.util.Map.of(), java.util.Map.of()));
      assertEquals(92d, parsed.rows().getFirst().get("score"));
      assertEquals(2, parsed.sheets().size());
    }
  }

  @Test
  void rejectsUnknownFieldAndDuplicateRoles() {
    var rules =
        new dev.labflow.importer.ImportRules(
            1, ",", 0, java.util.List.of(), java.util.Map.of(), java.util.Map.of("missing", "x"));
    assertThrows(ApiException.class, () -> parser.parse("x.csv", "x,y\n1,2".getBytes(), rules));
    var duplicate =
        new dev.labflow.importer.ImportRules(
            1,
            ",",
            0,
            java.util.List.of(),
            java.util.Map.of(),
            java.util.Map.of("x", "x", "y", "x"));
    assertThrows(ApiException.class, duplicate::validate);
  }
}
