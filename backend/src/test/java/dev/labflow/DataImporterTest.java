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
}
