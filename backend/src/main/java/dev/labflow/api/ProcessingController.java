package dev.labflow.api;

import dev.labflow.processing.ProcessingRules;
import dev.labflow.service.ProcessingService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{p}/data/{id}/process")
public class ProcessingController {
  private final ProcessingService service;

  public ProcessingController(ProcessingService service) {
    this.service = service;
  }

  public record Input(@NotBlank @Size(max = 120) String name, @NotNull ProcessingRules rules) {}

  @PostMapping("/preview")
  Object preview(@PathVariable long p, @PathVariable long id, @Valid @RequestBody Input in) {
    return service.preview(p, id, in.rules());
  }

  @PostMapping
  Object commit(@PathVariable long p, @PathVariable long id, @Valid @RequestBody Input in) {
    return service.commit(p, id, in.name(), in.rules());
  }
}
