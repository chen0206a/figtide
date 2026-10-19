package dev.labflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class DeliveryController {
  private final StyleTemplateService styles;
  private final BackupService backups;

  public DeliveryController(StyleTemplateService styles, BackupService backups) {
    this.styles = styles;
    this.backups = backups;
  }

  public record StyleInput(@NotBlank @Size(max = 120) String name, @NotNull JsonNode config) {}

  @GetMapping("/style-templates")
  Object styles() {
    return styles.list();
  }

  @PostMapping("/projects/{p}/style-templates")
  Object style(@PathVariable long p, @Valid @RequestBody StyleInput in) {
    return styles.save(p, in.name(), in.config());
  }

  @DeleteMapping("/style-templates/{id}")
  Object delete(@PathVariable long id) {
    return styles.delete(id);
  }

  @GetMapping("/projects/{p}/backup")
  ResponseEntity<byte[]> backup(@PathVariable long p) {
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType("application/zip"))
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=labflow-project-" + p + ".labflow.zip")
        .body(backups.export(p));
  }

  @PostMapping("/backups/preview")
  Object preview(@RequestPart MultipartFile file) throws Exception {
    return backups.preview(file.getBytes());
  }

  @PostMapping("/backups/restore")
  Object restore(@RequestPart MultipartFile file, @RequestParam String name) throws Exception {
    return backups.restore(file.getBytes(), name);
  }
}
