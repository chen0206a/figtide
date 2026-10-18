package dev.labflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.service.WorkspaceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class WorkspaceController {
  private final WorkspaceService service;

  public WorkspaceController(WorkspaceService s) {
    service = s;
  }

  public record ProjectInput(
      @NotBlank @Size(max = 120) String name, @NotNull @Size(max = 10000) String description) {}

  public record ExperimentInput(
      @NotBlank @Size(max = 120) String name,
      @NotNull JsonNode parameters,
      @NotNull JsonNode metrics,
      @NotNull @Size(max = 30000) String notes) {}

  public record ChartInput(
      @NotBlank @Size(max = 120) String name, Integer revision, @NotNull JsonNode config) {}

  @GetMapping("/health")
  Object health() {
    return java.util.Map.of("status", "ok", "mode", "local-only");
  }

  @GetMapping("/projects")
  Object projects() {
    return service.projects();
  }

  @PostMapping("/projects")
  Object create(@Valid @RequestBody ProjectInput in) {
    return service.createProject(in.name(), in.description());
  }

  @GetMapping("/projects/{p}/experiments")
  Object experiments(@PathVariable long p) {
    return service.experiments(p);
  }

  @PostMapping("/projects/{p}/experiments")
  Object experiment(@PathVariable long p, @Valid @RequestBody ExperimentInput in) {
    return service.saveExperiment(p, null, in.name(), in.parameters(), in.metrics(), in.notes());
  }

  @PutMapping("/projects/{p}/experiments/{id}")
  Object editExperiment(
      @PathVariable long p, @PathVariable long id, @Valid @RequestBody ExperimentInput in) {
    return service.saveExperiment(p, id, in.name(), in.parameters(), in.metrics(), in.notes());
  }

  @GetMapping("/projects/{p}/datasets")
  Object datasets(@PathVariable long p) {
    return service.datasets(p);
  }

  @PostMapping("/projects/{p}/datasets")
  Object upload(@PathVariable long p, @RequestPart MultipartFile file) throws Exception {
    return service.upload(p, null, file.getOriginalFilename(), file.getBytes());
  }

  @PostMapping("/projects/{p}/datasets/{id}/versions")
  Object uploadVersion(@PathVariable long p, @PathVariable long id, @RequestPart MultipartFile file)
      throws Exception {
    return service.upload(p, id, file.getOriginalFilename(), file.getBytes());
  }

  @GetMapping("/projects/{p}/data/{id}")
  Object data(@PathVariable long p, @PathVariable long id) {
    return service.data(p, id);
  }

  @GetMapping("/projects/{p}/data/{id}/original")
  ResponseEntity<byte[]> original(@PathVariable long p, @PathVariable long id) {
    var data = service.original(p, id);
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(data.get("filename").toString(), java.nio.charset.StandardCharsets.UTF_8)
                .build()
                .toString())
        .body((byte[]) data.get("original_file"));
  }

  @GetMapping("/projects/{p}/charts")
  Object charts(@PathVariable long p) {
    return service.charts(p);
  }

  @PostMapping("/projects/{p}/charts")
  Object chart(@PathVariable long p, @Valid @RequestBody ChartInput in) {
    return service.saveChart(p, null, in.name(), null, in.config());
  }

  @GetMapping("/projects/{p}/charts/{id}")
  Object chart(@PathVariable long p, @PathVariable long id) {
    return service.chart(p, id);
  }

  @PutMapping("/projects/{p}/charts/{id}")
  Object save(@PathVariable long p, @PathVariable long id, @Valid @RequestBody ChartInput in) {
    return service.saveChart(p, id, in.name(), in.revision(), in.config());
  }

  @GetMapping("/projects/{p}/charts/{id}/versions")
  Object versions(@PathVariable long p, @PathVariable long id) {
    return service.versions(p, id);
  }
}
