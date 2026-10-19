package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;

import dev.labflow.api.ApiException;
import dev.labflow.processing.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class DataProcessorTest {
  final DataProcessor processor = new DataProcessor();
  final List<Map<String, Object>> fields =
      List.of(
          Map.of("name", "model", "type", "string"),
          Map.of("name", "epoch", "type", "number"),
          Map.of("name", "seed", "type", "number"),
          Map.of("name", "accuracy", "type", "number"));

  Map<String, Object> row(Object model, int epoch, int seed, Object value) {
    var r = new LinkedHashMap<String, Object>();
    r.put("model", model);
    r.put("epoch", epoch);
    r.put("seed", seed);
    r.put("accuracy", value);
    return r;
  }

  ProcessingRules rules(
      List<String> groupBy,
      List<ProcessingRules.Filter> filters,
      List<ProcessingRules.Order> sort,
      String error,
      String missing,
      String replicate) {
    return new ProcessingRules(
        1,
        "aggregate",
        groupBy,
        List.of("accuracy"),
        filters,
        sort,
        missing,
        error,
        "one seed at fixed epoch",
        replicate,
        groupBy.contains("epoch") ? "epoch" : groupBy.isEmpty() ? "" : groupBy.getFirst(),
        groupBy.contains("model") && groupBy.contains("epoch") ? "model" : "",
        "bars");
  }

  double stat(DataProcessor.Result r, int index, String stat) {
    return ((Number) r.rows().get(index).get(r.statistics().getFirst().columns().get(stat)))
        .doubleValue();
  }

  @Test
  void calculatesKnownSampleStatisticsAndPreservesInput() {
    var rows =
        List.of(row("A", 1, 1, 1), row("A", 1, 2, 2), row("A", 1, 3, 3), row("A", 1, 4, null));
    var copy = rows.stream().map(LinkedHashMap::new).toList();
    var result =
        processor.process(
            fields,
            rows,
            rules(List.of("model", "epoch"), List.of(), List.of(), "sem", "include", "seed"));
    assertEquals(3, stat(result, 0, "n"));
    assertEquals(4, stat(result, 0, "total"));
    assertEquals(1, stat(result, 0, "missing"));
    assertEquals(2, stat(result, 0, "mean"));
    assertEquals(1, stat(result, 0, "sd"));
    assertEquals(1 / Math.sqrt(3), stat(result, 0, "sem"), 1e-15);
    assertEquals(2 - 1 / Math.sqrt(3), stat(result, 0, "lower"), 1e-15);
    assertEquals(copy, rows);
  }

  @Test
  void keepsInsufficientSamplesMissingAndConstantSamplesZero() {
    var result =
        processor.process(
            fields,
            List.of(row("A", 1, 1, null), row("B", 1, 2, 5), row("C", 1, 3, 8), row("C", 1, 4, 8)),
            rules(List.of("model"), List.of(), List.of(), "sd", "include", ""));
    var c = result.statistics().getFirst().columns();
    assertNull(result.rows().getFirst().get(c.get("mean")));
    assertNull(result.rows().get(1).get(c.get("sd")));
    assertNull(result.rows().get(1).get(c.get("lower")));
    assertEquals(0, stat(result, 2, "sd"));
    assertEquals(8, stat(result, 2, "lower"));
  }

  @Test
  void filtersBeforeAggregationAndHandlesMissingGroupingExplicitly() {
    var rows = List.of(row(null, 1, 1, 1), row("A", 1, 2, 2), row("A", 2, 3, 4));
    var filters = List.of(new ProcessingRules.Filter("epoch", "eq", "1.0"));
    var included =
        processor.process(
            fields, rows, rules(List.of("model"), filters, List.of(), "sd", "include", ""));
    assertEquals(2, included.rows().size());
    assertNull(included.rows().getFirst().get("model"));
    var excluded =
        processor.process(
            fields, rows, rules(List.of("model"), filters, List.of(), "sd", "exclude", ""));
    assertEquals(1, excluded.rows().size());
    assertEquals(2, excluded.counts().get("excluded_rows"));
  }

  @Test
  void sortsNumericallyAndKeepsMissingLastInBothDirections() {
    var rows =
        List.of(row(null, 2, 1, 2), row("Z", 10, 2, 10), row("A", 1, 3, 1), row("Z", 10, 4, 11));
    var sorted =
        processor.process(
            fields,
            rows,
            new ProcessingRules(
                1,
                "sort",
                List.of(),
                List.of(),
                List.of(),
                List.of(new ProcessingRules.Order("epoch", "asc")),
                "include",
                "none",
                "",
                "",
                "",
                "",
                "bars"));
    assertEquals(List.of(1, 2, 10, 10), sorted.rows().stream().map(r -> r.get("epoch")).toList());
    var missingLast =
        processor.process(
            fields,
            rows,
            new ProcessingRules(
                1,
                "sort",
                List.of(),
                List.of(),
                List.of(),
                List.of(new ProcessingRules.Order("model", "desc")),
                "include",
                "none",
                "",
                "",
                "",
                "",
                "bars"));
    assertNull(missingLast.rows().getLast().get("model"));
    assertEquals(2, missingLast.rows().getFirst().get("seed"));
  }

  @Test
  void rejectsDuplicateOrMissingReplicateIdsAndInvalidOwnership() {
    var duplicate = List.of(row("A", 1, 1, 1), row("A", 1, 1, 2));
    assertThrows(
        ApiException.class,
        () ->
            processor.process(
                fields,
                duplicate,
                rules(List.of("model"), List.of(), List.of(), "sd", "include", "seed")));
    assertThrows(
        ApiException.class,
        () ->
            processor.process(
                fields,
                duplicate,
                rules(List.of("foreign"), List.of(), List.of(), "sd", "include", "")));
    assertThrows(
        ApiException.class,
        () ->
            processor.process(
                fields,
                duplicate,
                rules(
                    List.of("model"),
                    List.of(new ProcessingRules.Filter("model", "gte", "1")),
                    List.of(),
                    "sd",
                    "include",
                    "")));
    assertThrows(
        ApiException.class,
        () ->
            processor.process(
                fields,
                duplicate,
                rules(
                    List.of("model"),
                    List.of(),
                    List.of(new ProcessingRules.Order("foreign", "asc")),
                    "sd",
                    "include",
                    "")));
  }

  @Test
  void supportsAllRowsOneGroupAndHandlesLargeOffsetsAndSmallNumbers() {
    var r =
        processor.process(
            fields,
            List.of(row("A", 1, 1, 1e15 + 1), row("A", 1, 2, 1e15 + 2), row("A", 1, 3, 1e15 + 3)),
            rules(List.of(), List.of(), List.of(), "sd", "include", ""));
    assertEquals(1, stat(r, 0, "sd"));
    assertEquals("全部", r.rows().getFirst().get("__summary"));
    var tiny =
        processor.process(
            fields,
            List.of(row("A", 1, 1, 1e-300), row("A", 1, 2, 3e-300)),
            rules(List.of(), List.of(), List.of(), "none", "include", ""));
    assertEquals(Math.sqrt(2) * 1e-300, stat(tiny, 0, "sd"), 1e-314);
    var large =
        processor.process(
            fields,
            List.of(row("A", 1, 1, 1e308), row("A", 1, 2, 1e308)),
            rules(List.of(), List.of(), List.of(), "sd", "include", ""));
    assertEquals(1e308, stat(large, 0, "mean"));
    assertThrows(
        ApiException.class,
        () ->
            processor.process(
                fields,
                List.of(row("A", 1, 1, -1.7e308), row("A", 1, 2, 1.7e308)),
                rules(List.of(), List.of(), List.of(), "sd", "include", "")));
  }

  @Test
  void allocatesCollisionFreeColumnsAndRejectsEmptyResults() {
    var extra = new ArrayList<>(fields);
    extra.add(Map.of("name", "accuracy__mean", "type", "string"));
    var r = row("A", 1, 1, 1);
    r.put("accuracy__mean", "existing");
    var result =
        processor.process(
            extra,
            List.of(r),
            rules(List.of("accuracy__mean"), List.of(), List.of(), "sd", "include", ""));
    assertNotEquals("accuracy__mean", result.statistics().getFirst().columns().get("mean"));
    assertThrows(
        ApiException.class,
        () ->
            processor.process(
                fields,
                List.of(row("A", 1, 1, 1)),
                rules(
                    List.of(),
                    List.of(new ProcessingRules.Filter("epoch", "gte", "10")),
                    List.of(),
                    "sd",
                    "include",
                    "")));
  }
}
