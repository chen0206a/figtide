package dev.labflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.service.ExperimentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{p}")
public class ExperimentController {
  private final ExperimentService service;

  public ExperimentController(ExperimentService service) {
    this.service = service;
  }

  public record Input(
      @NotBlank @Size(max = 120) String name,
      @NotNull JsonNode parameters,
      @NotNull JsonNode metrics,
      @NotNull @Size(max = 30000) String notes,
      String status,
      List<String> tags,
      List<Long> dataset_version_ids,
      Integer revision) {}

  public record ComparisonInput(
      @NotNull List<ExperimentService.Selection> experiments,
      long baseline_id,
      @NotBlank @Size(max = 120) String metric,
      @NotBlank String direction,
      @NotBlank String chart_type) {}

  @GetMapping("/experiments")
  Object list(@PathVariable long p) {
    return service.list(p);
  }

  @PostMapping("/experiments")
  Object create(@PathVariable long p, @Valid @RequestBody Input in) {
    return save(p, null, in);
  }

  @PutMapping("/experiments/{id}")
  Object update(@PathVariable long p, @PathVariable long id, @Valid @RequestBody Input in) {
    return save(p, id, in);
  }

  private Object save(long p, Long id, Input in) {
    return service.save(
        p,
        id,
        in.name(),
        in.parameters(),
        in.metrics(),
        in.notes(),
        in.status(),
        in.tags(),
        in.dataset_version_ids(),
        in.revision());
  }

  @PostMapping("/comparisons")
  Object compare(@PathVariable long p, @Valid @RequestBody ComparisonInput in) {
    return service.snapshot(
        p, in.experiments(), in.baseline_id(), in.metric(), in.direction(), in.chart_type());
  }
}
