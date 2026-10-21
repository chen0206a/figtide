package dev.labflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.service.FigureOperations;
import dev.labflow.service.FigureToolService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class FigureToolController {
  private final FigureToolService service;

  public FigureToolController(FigureToolService service) {
    this.service = service;
  }

  @GetMapping("/figure-tools/catalog")
  Object catalog() {
    return FigureOperations.catalog();
  }

  @PostMapping("/projects/{p}/figure-tools/preview")
  Object preview(@PathVariable long p, @RequestBody JsonNode request) {
    return service.preview(p, request);
  }
}
