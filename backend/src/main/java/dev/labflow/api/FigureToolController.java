package dev.labflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.service.FigureOperations;
import dev.labflow.service.FigureToolService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class FigureToolController {
  private final FigureToolService service;
  @org.springframework.beans.factory.annotation.Autowired private dev.labflow.agent.AgentRunService agent;

  public FigureToolController(FigureToolService service) {
    this.service = service;
  }

  @GetMapping("/figure-tools/catalog")
  Object catalog() {
    return FigureOperations.catalog();
  }

  @GetMapping("/figure-tools/spec")
  Object spec(@RequestParam(required = false) String type) {
    return service.spec(type);
  }

  @PostMapping("/projects/{p}/figure-tools/lint")
  Object lint(@PathVariable long p, @RequestBody JsonNode request) {
    return service.lint(p, request);
  }

  @PostMapping("/projects/{p}/figure-tools/preview")
  Object preview(@PathVariable long p, @RequestBody JsonNode request) {
    if(request.has("agent_run_id"))return agent.preview(p,request);
    return service.preview(p, request);
  }
}
